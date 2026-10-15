# Spike: which DAS indexer to use for devnet compressed NFTs (NDU-28)

Researched 2026-10-08. Compressed NFTs have no account of their own. Reading them (and getting the Merkle proof for any write such as `setNonTransferableV2` or burn) needs an RPC that implements the **Metaplex DAS API**. Standard RPCs, including the public `https://api.devnet.solana.com`, don't [1][2].

## Providers
| Provider | DAS on devnet? | Free tier / cost | Notes | Source |
|---|---|---|---|---|
| **Helius** | **Yes.** The DAS OpenAPI lists `https://devnet.helius-rpc.com` | Free: $0, 1M credits/month, 10 RPC req/s, **2 DAS req/s**, and each DAS call costs 10 credits (about 100k DAS calls/month). Developer: $49 per month | The asset `interface` enum includes `MplBubblegumV2` and `MplCoreAsset`. No card or email needed to start | [3][4] |
| **QuickNode** | **Yes.** "Available on Solana Mainnet and Solana Devnet. Same endpoint, same auth" | Free tier says DAS can be added at signup. Per-call credit cost and limits **not confirmed** | It's an add-on, so enable "Metaplex DAS API" on the endpoint | [5] |
| **Triton One** | **Unclear.** The docs say DAS is on "all shared and dedicated endpoints" but only show mainnet examples | No free tier: $125 prepaid deposit; DAS costs $50 per million requests | Co-maintains the open-source DAS | [6][7] |
| **Shyft** | **Probably not.** Its JS SDK says DAS "currently only works with `mainnet-beta`". It does have a devnet RPC (`devnet-rpc.shyft.to`) | Has free plans | The README may be out of date, so test one call before ruling it out | [8] |
| Extrnode, Hello Moon | Listed by Metaplex as DAS-capable. **Devnet not verified** | n/a | n/a | [1] |
| Alchemy, Ankr, Chainstack, Syndica, etc. | Listed by Metaplex as **without** DAS | n/a | n/a | [1] |

**Recommendation:** use **Helius devnet on the free tier** as the primary, with QuickNode devnet as the backup. Both use the same Umi `dasApi()` calls, so switching is just a URL change. The 2 DAS req/s limit is fine for a pilot if reads are cached (below). **To verify** with the first test mint: that Helius devnet returns a Bubblegum **V2** leaf with `ownership.non_transferable`. The schema lists V2 but I haven't run it, because the box can't reach devnet and nothing was minted.

The API key is a **read** credential. Wei creates the account, and the key goes in server `app.env` (for example `PROPERTY_DAS_RPC_URL`, a proposed name, not in code yet). It is never bundled to the client and never stored by an agent. If the browser needs DAS (the admin signing page under ADR 0001 option A needs the proof), send it through a server endpoint rather than exposing the key.

## Reading assets
- **By owner:** `getAssetsByOwner { ownerAddress, page, limit (≤1000) }` (Helius schema) or positional params on Triton [3][6]. With Umi: `umi.rpc.getAssetsByOwner({ owner })` from `@metaplex-foundation/digital-asset-standard-api` 2.1.1.
- **Only our records:** better to use `getAssetsByGroup { groupKey: 'collection', groupValue: <NDU Core collection> }` [8] (or `searchAssets` with owner and collection), then filter `burnt: false`.
- **One record + proof:** `getAsset`, `getAssetProof`, or Bubblegum's `getAssetWithProof(umi, id, { truncateCanopy: true })` before any write [2].
- **Check 7 on the verification card:** `ownership.non_transferable === true` (the field the Bubblegum JS `canTransfer()` reads). A **collection-level** freeze lives on the Core collection account, so read it with `fetchCollection` over standard RPC (see the freeze spike).

## Fallbacks if DAS is down or rate-limited
1. **Our own DB is the source of truth for display.** After the server confirms a mint, store `mint_sig`, the asset ID (from `parseLeafFromMintV2Transaction` [9]), the leaf index and the metadata hash. The UI reads Postgres. DAS is only for verifying and for proofs, and cache its result with a TTL.
2. **Proofs without DAS:** the NDU tree is **private** (only the registry authority mints), so every leaf is one we created. The server can rebuild the tree from its stored leaves and compute proofs with the Bubblegum JS `getMerkleProof` / `getMerkleRoot` helpers (`clients/js/src/merkle.ts`) [9]. It then checks the result against the on-chain root (`fetchMerkleTree`, standard RPC). This only works if we keep every leaf hash, including updates from freeze or soulbound, which change the leaf. **Not prototyped.**
3. **Second provider:** QuickNode, with a URL switch in env.
4. **Self-hosted DAS** (`metaplex-foundation/digital-asset-rpc-infrastructure`): this needs a Geyser-fed validator or RPC plus Postgres. Too heavy for this budget, so listed for completeness only.
5. **No DAS at all:** if Sun picks MPL-Core assets for the slice (freeze spike, "Alternative"), records are normal accounts and readable with `getAccountInfo` / `fetchAsset` on any devnet RPC.

## Sources
1. Metaplex, RPCs and DAS providers: https://developers.metaplex.com/rpc-providers
2. Bubblegum V2, fetching cNFTs: https://www.metaplex.com/docs/smart-contracts/bubblegum-v2/fetch-cnfts
3. Helius getAssetsByOwner (servers incl. devnet): https://www.helius.dev/docs/api-reference/das/getassetsbyowner
4. Helius pricing: https://www.helius.dev/pricing
5. QuickNode Metaplex DAS API: https://www.quicknode.com/metaplex-das-api
6. Triton DAS docs: https://docs.triton.one/digital-assets-api/introduction and https://docs.triton.one/digital-assets-api/metaplex-digital-assets-api/get-assets-by-owner
7. Triton pricing: https://triton.one/pricing
8. Shyft JS SDK README: https://github.com/Shyft-to/js/blob/main/README.md ; Shyft RPCs: https://docs.shyft.to/solana/shyft-rpcs
9. mpl-bubblegum JS (`leafAssetId.ts`, `merkle.ts`, `canTransfer.ts`): https://github.com/metaplex-foundation/mpl-bubblegum/tree/main/clients/js/src
