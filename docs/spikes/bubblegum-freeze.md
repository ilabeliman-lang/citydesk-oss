# Spike: non-transferable records with Bubblegum V2. Per item or per collection? (NDU-24/27)

Researched 2026-10-08. Sources: Metaplex docs and the `mpl-bubblegum` source at commit `ad7d32b` (2026-09-22). Versions on npm: `@metaplex-foundation/mpl-bubblegum` **6.0.0** (2026-09-22), `mpl-core` **1.10.0**, `umi` **1.6.0**, `digital-asset-standard-api` **2.1.1**.

## Answer
**Both exist, as three separate mechanisms.** All of them require the cNFT to belong to an **MPL-Core collection** that has the `BubblegumV2` plugin. Freeze and soulbound need a Bubblegum **V2** tree (`createTreeV2`, LeafSchemaV2); V1 trees can't do either.

| Mechanism | Scope | Who signs | Reversible | Source |
|---|---|---|---|---|
| `setNonTransferableV2`: sets the leaf's `non_transferable` flag (soulbound) | **Per asset** | Only the collection's `PermanentFreezeDelegate` authority (the instruction errors if the collection lacks the plugin) | **No, permanent** | docs [2]; `processor/set_non_transferable.rs` [4] |
| `freezeV2` by the permanent freeze delegate: sets the leaf's `permanent_lvl_frozen` flag | **Per asset** (authority comes from the collection plugin) | Collection permanent freeze delegate | Yes (`thawV2`) | [2]; `processor/freeze.rs` |
| `freezeV2` / `delegateAndFreezeV2` by a leaf delegate: `asset_lvl_frozen` | Per asset; the owner must delegate first | Leaf delegate | Yes | [2] |
| Collection plugin `PermanentFreezeDelegate { frozen: true }` | **Whole collection.** Every cNFT transfer/burn fails with `CollectionIsFrozen` | Plugin authority (`updateCollectionPlugin`) | Yes, unless authority is `None` | [3]; `processor/transfer.rs` L304-311, `burn.rs` L256-260; JS test "asset cannot be transferred by owner when collection is frozen" [5] |

Details from the source code (`transfer.rs`, `burn.rs`):
- The `non_transferable` check runs **even when** a collection `PermanentTransferDelegate` force-approves a transfer, so a soulbound record can't be moved by anyone.
- A `PermanentBurnDelegate` on the collection can **burn** frozen or soulbound cNFTs (force-approve skips the frozen check). The owner can also burn a soulbound item (JS test "item set to non-transferrable can be burnt by owner"). That gives us **revocation for disputes** and **user deletion**.
- `mintV2` always writes `DEFAULT_FLAGS`, so soulbound status is a **second instruction after minting**. `mintV2` also charges a protocol fee of `MINT_V2_FEE_LAMPORTS = 90000` (0.00009 SOL) and `transferV2` charges 6000 lamports (`state/collect.rs`). Assume this applies on devnet too, since it's program code. See Metaplex's protocol fees page [6] for the current schedule.
- **Unverified:** whether `mintV2` succeeds into a collection that is **already frozen**. The tests only freeze the collection after minting. `mintV2` makes a CPI into mpl-core to update the collection's count, and I couldn't confirm that mpl-core allows this while frozen. Test it on devnet before relying on it.
- **Unverified:** whether DAS `ownership.frozen` reflects a **collection-level** freeze. The JS `canTransfer()` helper only reads `ownership.frozen || ownership.non_transferable`, which are leaf-level. To see a collection freeze, read the Core collection account (`fetchCollection`, standard RPC).

## Alternative: MPL-Core assets (not compressed)
- Each record is a Core asset with `PermanentFreezeDelegate { frozen: true, authority: None }`. Metaplex documents this as the way to make a soulbound token: it can never be unfrozen or transferred [3]. Add `PermanentBurnDelegate` if disputes need to revoke records. Note that on a **collection**, the permanent freeze delegate freezes all assets at once and can't target a single one [3].
- Pros: one instruction and **one signature** per record. Wallets and marketplaces broadly support Core (Metaplex says to choose Core "if you need broad wallet and marketplace support today" [1]). It is readable with a **plain RPC** `getAccountInfo`, so **no DAS dependency**. No tree rent.
- Cons: about **0.0029 SOL rent per asset** (Metaplex FAQ figure [1]) plus Core protocol fees [6], versus about 0.0000255 SOL per cNFT in a depth-14 tree. That only matters on mainnet at volume. The rough break-even against the 0.3358 SOL depth-14 tree is about 115 records.

## Devnet costs (from Metaplex's table [7]; devnet SOL is free from https://faucet.solana.com)
| Tree | Capacity | Canopy / buffer | Rent |
|---|---|---|---|
| depth 14 | 16,384 | 8 / 64 | **0.3358 SOL** |
| depth 16 | 65,536 | 10 / 64 | 0.7069 SOL |
| depth 20 | 1,048,576 | 13 / 1024 | 8.5012 SOL |

Tree parameters can't be changed after creation [7]. On top of the tree: Core collection rent (small but not quoted; measure it), 0.00009 SOL per `mintV2`, and transaction fees. A smaller custom tree is possible, but I don't have a sourced cost for it. Compute it at run time with `getMinimumBalanceForRentExemption`.

## Recommendation
1. **The registry shape, if NDU stays on compressed NFTs (the current plan):** one V2 tree (depth 14, private, so `public: false`) and one Core collection with plugins `BubblegumV2`, `PermanentFreezeDelegate { frozen: false, authority: <registry authority> }` and `PermanentBurnDelegate { authority: <registry authority> }`. Each record is `mintV2` and then `setNonTransferableV2`. This is per-asset and permanent, and it's the path exercised by Metaplex's own tests. Collection-level `frozen: true` is a reversible emergency brake, not the soulbound mechanism.
2. **For the week-1 go/no-go gate ("mint one frozen non-transferable NFT"),** a Core asset with `PermanentFreezeDelegate { frozen: true, authority: None }` is the lowest-risk proof: one transaction, no DAS. If the team prefers it, Core could also carry the whole devnet slice. That is for Sun to decide alongside ADR 0001.
3. Under ADR 0001 option A, the registry authority is Wei's wallet. In Bubblegum, he signs 2 transactions per record (1 for Core).

## Minimal devnet script outline (not executed; no keys)
```ts
// scripts/registry-devnet.ts (outline). Signer = wallet adapter (ADR option A); never a keypair file.
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { walletAdapterIdentity } from '@metaplex-foundation/umi-signer-wallet-adapters';
import { mplBubblegum, createTreeV2, mintV2, setNonTransferableV2, getAssetWithProof,
         parseLeafFromMintV2Transaction } from '@metaplex-foundation/mpl-bubblegum';
import { mplCore, createCollection } from '@metaplex-foundation/mpl-core';
import { generateSigner } from '@metaplex-foundation/umi';

const umi = createUmi(DEVNET_DAS_RPC).use(mplBubblegum()).use(mplCore()).use(walletAdapterIdentity(wallet));
assertDevnet(await umi.rpc.getGenesisHash());               // refuse anything but devnet

// once: tree + collection (registry authority = umi.identity = Wei's wallet)
const merkleTree = generateSigner(umi);                      // ephemeral account address, not a stored key
await (await createTreeV2(umi, { merkleTree, maxDepth: 14, maxBufferSize: 64, canopyDepth: 8 })).sendAndConfirm(umi);
const collection = generateSigner(umi);
await createCollection(umi, { collection, name: 'NDU Property Records (devnet)', uri: COLLECTION_META_URI,
  plugins: [ { type: 'BubblegumV2' },
             { type: 'PermanentFreezeDelegate', frozen: false, authority: { type: 'UpdateAuthority' } },
             { type: 'PermanentBurnDelegate', authority: { type: 'UpdateAuthority' } } ] }).sendAndConfirm(umi);

// per record: mint to the claimant, then make it soulbound
const { signature } = await mintV2(umi, { leafOwner: claimant, merkleTree: merkleTree.publicKey,
  coreCollection: collection.publicKey,
  metadata: { name, uri: `/api/property/meta/${hash}.json` /* absolute URL in practice */, collection: collection.publicKey, creators: [] }
}).sendAndConfirm(umi);
const leaf = await parseLeafFromMintV2Transaction(umi, signature);   // gives asset id
const awp = await getAssetWithProof(umi, leaf.id, { truncateCanopy: true }); // needs DAS (see devnet-indexer.md)
await setNonTransferableV2(umi, { ...awp, authority: umi.identity, coreCollection: collection.publicKey }).sendAndConfirm(umi);
// verify: DAS getAsset → ownership.non_transferable === true; store mint_sig + asset id; status → minted
```
The tree and collection signers are throwaway account addresses created at setup. Only their **public** keys get stored. Check the exact argument shapes against the installed 6.x typings. The calls are taken from the docs pages [2][7] and the repo tests [5], but `createCollection`'s plugin syntax differs slightly between docs pages.

## Sources
1. Bubblegum V2 overview: https://developers.metaplex.com/bubblegum-v2
2. Freezing and thawing cNFTs (incl. soulbound): https://developers.metaplex.com/bubblegum-v2/freeze-cnfts
3. Core Permanent Freeze Delegate: https://developers.metaplex.com/core/plugins/permanent-freeze-delegate
4. mpl-bubblegum source: https://github.com/metaplex-foundation/mpl-bubblegum (`programs/bubblegum/program/src/processor/{set_non_transferable,freeze,transfer,burn,mint}.rs`, `state/collect.rs`)
5. JS tests: https://github.com/metaplex-foundation/mpl-bubblegum/tree/main/clients/js/test (`setNonTransferableV2.test.ts`, `permanentFreezeDelegate.test.ts`, `burnV2.test.ts`)
6. Protocol fees: https://developers.metaplex.com/protocol-fees
7. Creating trees (cost table): https://developers.metaplex.com/bubblegum-v2/create-trees
