# ADR 0001: Who signs property-registry mints (NDU-2)

- **Status:** Proposed
- **Decision:** **Proposed: A, pending Sun (Wei)**
- **Date:** 2026-10-08
- **Tickets:** NDU-2 (this decision); it unblocks NDU-24 and NDU-26 to NDU-29 (mint, tree, indexer, confirm) and, through them, disputes NDU-32 to NDU-35.
- **Related:** `docs/spikes/bubblegum-freeze.md`, `docs/spikes/devnet-indexer.md`

> Label note: the stub comment in `src/world/property.server.ts` lists the options the other way round (its "A" is the server key and its "B" is the user's wallet). This ADR uses **A = Wei's wallet** and **B = server key**. Fix the comment when the stub is replaced.

## Context
- Today **the server never signs anything on-chain.** `mintCompressedRecordStub()` always throws. It has no RPC connection, keypair path or instruction builder. The file header says the build must not "generate, hold, load or use ANY private key".
- What exists already: the claimant signs a **message** (not a transaction) over a claim hash (`prepareClaim`, then submit). The record is stored off-chain with status `awaiting_mint`. The verification card's check 7 ("non-transferable") reports `unavailable`.
- A mint needs a **registry authority**. That key creates the Merkle tree (tree creator), controls the MPL-Core collection (update authority, the signer `mintV2` needs as `collectionAuthority`), and holds the collection's permanent freeze/burn delegate. That last role is what makes records non-transferable and lets disputes revoke them. Whoever holds this key can mint, freeze or burn any record in the registry.
- Devnet only, non-tradable, private by default (strategy doc). The project has a history of a leaked key (old NEURA mint authority `77iD…`, see HANDOFF). Agents share one box and studio, and their logs are visible to all agents.

## Options
### A. Wei signs each mint in his own wallet (recommended)
An admin queue page lists records in `awaiting_mint`. Wei connects Phantom or Solflare, set to devnet, through the Solana wallet adapter (`@solana/wallet-adapter-react`, or Umi's `@metaplex-foundation/umi-signer-wallet-adapters` → `walletAdapterIdentity`). The page builds the unsigned transaction(s) in the browser and Wei approves them. The server then verifies the confirmed signature on-chain and stores `mint_sig`.
- The registry authority (tree creator, collection update authority, permanent freeze and burn delegate) is Wei's wallet address. The server only ever holds **public keys**.
- With Bubblegum V2, each record is `mintV2` followed by `setNonTransferableV2` (see the spike). That is 1 to 2 transactions per record. Wallets can sign them together with `signAllTransactions`, but check that this works in Phantom and Solflare on devnet.
- Pros: no secret on the server or the box, and nothing for an agent to leak. Every mint is an explicit human act, which suits a registry that makes claims about real property. This is the smallest change to the current safety rule ("server never signs").
- Cons: minting is slower and needs Wei to be present, so there is a queue backlog. It needs a small admin UI. Wallet support for Bubblegum V2 shows assets but can't transfer them yet (Metaplex compatibility table). Records are non-transferable anyway, so that doesn't matter here.

### B. Devnet-only server key
A keypair in a server env file signs `createTreeV2`, `mintV2` and `setNonTransferableV2` automatically.
- Pros: fast, no human in the loop, simpler UI.
- Cons: a hot key on a shared, agent-operated studio, and this project has already leaked a key once. Whoever holds the key controls every record, including burning them, which matters for disputes. It changes the "server never signs" rule. It is easy to accidentally reuse the key or point it at mainnet later.
- **An agent must not generate or hold this key.** If B is chosen, Wei generates it offline and places it in a git-ignored server env file himself. It is devnet-only (the code asserts the cluster is devnet and refuses any other), is funded only from the faucet, is never used for NEURA or mainnet, and gets rotated if exposed. Agents never print, copy or log it. Agents generating keys conflicts with the standing "secrets stay out of chat/agents" rule, and agent transcripts and the shared box are not secret storage.

### C. Hybrid
Wei's wallet keeps the **powerful, rare** roles: it creates the collection and tree, and holds the update authority plus the permanent freeze and burn delegates. A narrow server key does only the routine step.
- One version: the server key is the **tree delegate** (Bubblegum `setTreeDelegate`). **Uncertain:** `mintV2` into an MPL-Core collection also needs the collection authority to sign, and I have not confirmed that a narrower Core delegate can fill that role. If it can't, the server key would need collection authority, and C collapses into B.
- Another version: the server mints, and Wei signs only `setNonTransferableV2` and burns. That still needs a server hot key, so it has most of B's risks.
- Use C only if A's queue becomes a real bottleneck, and only after a devnet test proves which signer roles can be split.

## Decision
**Proposed: A, pending Sun (Wei).** Nothing changes until Wei records his choice here (Status → Accepted, with date and initials).

## Consequences
**If A:**
- NDU-24/26: the stub becomes "build unsigned tx", never "sign". There is no keypair path in server code, and an `eslint`/grep CI guard rejects `Keypair.generate`, `keypairIdentity` and `fromSecretKey` in `src/`.
- NDU-27 (tree): Wei signs `createTreeV2` and creates the Core collection once from the admin page. That costs about 0.34 SOL rent for a depth-14 tree (Metaplex table), and devnet SOL comes from the faucet.
- NDU-28 (indexer): DAS read-only, see `devnet-indexer.md`. The server verifies the mint signature, then parses the leaf (`parseLeafFromMintV2Transaction`) to get the asset ID.
- NDU-29 (confirm): `awaiting_mint` → `minted` happens only after the server has confirmed the transaction itself. It never trusts what the client says.
- Disputes (NDU-32 to 35): revoking a record means Wei signs a burn as the permanent burn delegate.
- Expect throughput limited by Wei's availability, so the UI shows a "queued for registry signature" state.

**If B:** a secret-handling runbook, a cluster guard, a balance cap, a rotation procedure, and a change to the safety rule in the handoff. The agents' role stays "never see the key".

## How the OFF feature flag gates this
- `PROPERTY_MINT_ENABLED` (server env, read by `mintFeatureFlag()` in `src/world/property.server.ts`) defaults to off. `app.env` currently has no `PROPERTY_*` variables. Even when the flag is `true`, `mintCompressedRecordStub()` throws, so claims stay `awaiting_mint` and the UI shows "Not minted … signing decision (NDU-2) is open". `getPropertyStatus` reports `mintEnabled: false`.
- Order of switching on: (1) this ADR is Accepted; (2) the stub is replaced by code matching the chosen option, reviewed, with tests; (3) `PROPERTY_ENABLED` plus the KEK is provisioned by Wei; (4) only then does Wei set `PROPERTY_MINT_ENABLED=true`. Turning the flag off again returns every new claim to off-chain-only without data loss.
