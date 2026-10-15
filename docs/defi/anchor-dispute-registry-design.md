# Anchor Dispute Registry Design — Devnet Only

**Target:** Solana devnet, Anchor v2.1+
**Scope:** Design only — no program code, no chain interaction
**Zone:** `docs/defi/`

---

## 1. Purpose

The dispute registry provides an off-chain, on-chain-supported dispute mechanism for CityDesk ecosystem entities that require mediation: property claim conflicts, street rule violations, and ADA guide bot moderation decisions. This document outlines the Anchor program accounts, PDAs, instructions, error codes, and a localnet test plan. No actual program code is provided.

---

## 2. Scope & Constraints

- **Environment:** Devnet only (separate from production mainnet; no cross-consensus implications)
- **Authorization:** No minting, no token creation, no governance votes
- **Data Persistence:** Off-chain storage via JSON/IPFS; on-chain metadata registry
- **No Chain Access:** Design-only; no real devnet calls
- **Scope:** Limited to dispute lifecycle (open → adjudicate → resolve/close). Non-dispute flows are outside scope.

---

## 3. Target Use Cases

| Use Case | Stakeholder | Entry Point |
|----------|--------------|-------------|
| Property claim conflict | Property owner vs. City admin | `openDispute(propertyKey, claimant, reason)` |
| Street rule violation dispute | Walker/vehicle vs. Admin on-street | `openDispute(streetId, offender, rule)` |
| ADA bot moderation | ADA decisions vs. affected user | `openDispute(userId, adaId, decision)` |

---

## 4. Account Model

### 4.1 PDA Addresses

```
DisputeRegistry = programId
Dispute(s disputeAccount) = PDA(programId, ["dispute", disputeIndex.toBuffer()])
Proposal(s proposalAccount) = PDA(disputeAccount, ["proposal", proposalIndex.toBuffer()])
```

**Basis of derivation:** Anchor `publicKey: PublicKey` with `[seeds]`.

### 4.2 Core Accounts

| Account | Type | Mutability | Role |
|---------|------|------------|------|
| `authority` | `Pubkey` | R | Dispute resolution authority (e.g., City admin, platform ops). R in design; can be updated by governance if ever introduced. |
| `disputeRegistry` | `Pubkey` | R | Global program ID — used for PDA derivation; stable across time. |
| `disputeCounter` | `Pubkey` | RW | Global counter for sequential dispute indices. Updated via `incrementCounter`. |
| `dispute(s disputeAccount)` | `Account` | RW | Dispute record: metadata, state, counters, metadata links. |
| `proposal(s proposalAccount)` | `Account` | RW | Proposal record for mediation: type, content, votes, resolution. |
| `offender(s offenderAccount)` | `Account` RW | Account info for entity being disputed (e.g., property owner, walker). |
| `stakeholder(s stakeholderAccount)` | `Account` RW | Entity with claim or interest in dispute (e.g., claimant, admin). |
| `metadata(s args.metadataPtr)` | `Account` | Off-chain metadata (JSON/IPFS) attached to a record: `proposal`, `dispute`, `attachment`. Pointer stored on-chain for retrieval. |
| `logs(s args.logPtr)` | `Account` | Optional: off-chain logs stored for debugging / compliance. |
| `attachment(s args.attachmentPtr)` | `Account` | Off-chain evidence: screenshots, witness statements, logs. Pointer stored. |
| `voter(s voterWallet)` | `Account` RW | Individual voting entity; stored to track per-voter votes for proposals. |
| `authority(s args.authorityPtr)` | `Account` | Authority account (if different from program ID authority used for `openDispute`). Optional. |

**Storage strategy:** All metadata and attachments are off-chain files stored via JSON or IPFS. On-chain fields store only pointers. Program never writes disk; files stored via external service.

### 4.3 Account Layouts

#### Core Records

```typescript
// Dispute record on-chain
export const disputeSchema = AccountDataSchema({
  state: "u8",
  disputeIndex: "u64",
  createdBy: "publicKey",
  type: "u8",
  createdAtSlot: "u64",
  offender: "publicKey",    // owner/walker/admin
  stakeholder: "publicKey", // claimant/admin
  attachmentPtr: "publicKey",
  metadataPtr: "publicKey",
  logPtr: "publicKey",
  proposalCount: "u32",
  resolution: "u32",
  closedAtSlot: "u64",
  tags: ["u8"],
});

// Proposal record
export const proposalSchema = AccountDataSchema({
  type: "u8",               // "mediation" | "rule_clarification" | "moderation"
  title: "string",
  content: "string",
  votesFor: "u8",
  votesAgainst: "u8",
  deadlineSlot: "u64",
  resolved: "u8",
  resolvedBy: "publicKey", // authority or stakeholder
  resolution: "u8",         // "approve" | "reject" | "escalate"
});
```

#### Optional: Off-chain metadata / logs / attachments

```typescript
// Metadata or attachment store pointer structure
export const metadataSchema = AccountDataSchema({
  type: "u8",            // "metadata" | "attachment" | "log"
  ptr: "publicKey",      // address of off-chain store (JSON or IPFS CID)
  hash: "publicKey",     // integrity check (off-chain hashing)
});
```

---

## 5. Instructions

All instructions assume no access to chain; they are design-only. Off-chain actions (store JSON/IPFS, attach file, retrieve log) are called via external service APIs, never executed by the Anchor program itself.

### 5.1 `openDispute`

Open a new dispute record with on-chain pointer to off-chain metadata and attachment.

**Inputs:**
- `mintState` (R): Mint metadata (e.g., `mint: { title, url, owner, claim }`) — optional context for properties.
- `offenderAccount` (R): Offender info stored on-chain.
- `stakeholderAccount` (R): Stakeholder info (e.g., claimant, admin).
- `reason` (R): Human-readable dispute reason string.
- `type` (R): Dispute type (`property` | `street` | `moderation`).
- `attachmentPtr` (R): Pointer to off-chain attachment file.
- `metadataPtr` (R): Pointer to off-chain metadata JSON (e.g., logs, details).

**Outputs:**
- `disputeAccount`: Created/disputed record.
- `disputeCounter`: Incremented dispute index.
- `logs`: Optionally written by external logging service.
- `attachment`, `metadata`: Off-chain stored objects referenced by `attachmentPtr`, `metadataPtr`.

**Constraint:** All pointers passed as `publicKey` (external storage addresses). Program can validate they exist and are owned by a known service address (if ever added). For design-only, no validation required.

### 5.2 `submitProposal`

Attach a mediation proposal to an existing dispute.

**Inputs:**
- `disputeAccount` (R): Existing dispute.
- `proposalType` (R): Type (`"mediation"` | `"rule_clarification"` | `"moderation"`).
- `title` (R): Proposal title.
- `content` (R): Proposal content.
- `attachmentPtr` (R): Pointer to off-chain evidence or details.
- `voter` (R): Vote account identifier.

**Outputs:**
- `proposal(account)`: New proposal record under dispute.
- `dispute(proposalCount)`: Incremented proposal counter.

### 5.3 `voteProposal`

Cast vote for or against a proposal (design-only; no governance implementation specified).

**Inputs:**
- `proposal(account)` (R): Existing proposal.
- `vote` (R): `"for"` | `"against"`.
- `voter` (R): Voter account.

**Outputs:**
- `proposal(votesFor/Against)`: Updated vote counts.
- `voter`: Off-chain mapping via external service; no on-chain state updated.

**Constraint:** Votes are stored only off-chain. The proposal may decide resolution later via `resolveProposal`.

### 5.4 `resolveProposal`

Official resolution of a proposal by authority or stakeholder.

**Inputs:**
- `proposal(account)` (R): Existing proposal.
- `resolvedBy` (R): Authority or stakeholder who resolves.
- `resolution` (R): `"approve"` | `"reject"`. Escalation options omitted for this design scope.
- `logPtr` (R): Pointer to off-chain resolution explanation.

**Outputs:**
- `proposal(resolved, resolvedBy, resolution)`: Finalized proposal record.
- `logs`: Off-chain resolution log.

### 5.5 `closeDispute`

Mark a dispute as closed after all proposals are resolved, with timestamp and tag.

**Inputs:**
- `dispute(account)` (R): Existing dispute.
- `tags(s args.tags)`: One or more tags (e.g., `"resolved"`, `"escalated"`, `"admin_decision"`).
- `reason` (R): Human-readable reason (optional).

**Outputs:**
- `dispute(state, closedAtSlot, tags)`: Closed dispute state.
- `logs`: Off-chain closure log.

---

## 6. Error Codes

Errors are design-only; no actual Anchor program is provided. Suggested codes:

| Code | Name | Meaning |
|------|------|---------|
| `0x0` | `Success` | Normal operation. |
| `0x1` | `InvalidAccountId` | Provided account pointer not registered. |
| `0x2` | `InvalidDispute` | No active dispute for the given key. |
| `0x3` | `InvalidProposal` | No active proposal under the dispute. |
| `0x4` | `InvalidInput` | Bad or malformed input (e.g., empty title). |
| `0x5` | `DisputeClosed` | Cannot operate on a closed dispute. |
| `0x6` | `ProposalResolved` | Attempted to update an already resolved proposal. |
| `0x7` | `TimeRestriction` | Instruction timestamp outside allowed window. |
| `0x8` | `InvalidStateTrans` | Invalid state transition (e.g., close before resolving). |
| `0x9` | `Authorization` | Caller not authorized. |

**Error handling:** Anchor instructions check input and return error code. For design-only, callers handle codes externally.

---

## 7. Roles & Permissions

| Role | Instruction Access | Off-chain Action (via external service) |
|------|-------------------|----------------------------------------|
| `authority` (dispute resolution) | `resolveProposal`, `closeDispute` (optionally) | Log storage, metadata retrieval, file serve. |
| `stakeholder` (owner, claimant, user) | `openDispute`, `submitProposal`, `voteProposal` | Vote storage, voting log. |
| `offender` (owner, walker, admin) | `openDispute` (as stakeholder) — design does not allow them to initiate against themselves; can be a stakeholder in their own dispute later. | No direct write in this design. |
| `voter` (entity with voting right) | `voteProposal` | Off-chain vote storage. |

**Authorization design:** Off-chain service handles access control. Authority and stakeholder roles determined off-chain via admin config, not on-chain program logic. No multi-sig or governance is defined here.

---

## 8. On-Chain vs Off-Chain

- **On-chain:** Dispute index, pointers, accounts, and simple counters.
- **Off-chain:** Human-readable content (reason, title), voting log, file content, logs. Stored as JSON or IPFS.

No on-chain votes or governance are stored; decisions made off-chain via external service.

---

## 9. Localnet Test Plan

This section is for testing design only; no actual devnet calls.

**Preparation:**

1. Start local validator (`solana-test-validator` against devnet config; no migrations or program deployment required).
2. Set up Anchor v2.1+; no program deployment in this design.

**Test Cases (dry-run in localnet for design review):**

| Test ID | Purpose | Steps | Expected |
|--------|---------|-------|----------|
| `01-open-dispute` | Basic `openDispute` works | Simulate `openDispute` instruction args; verify PDA derivation and `disputeCounter` increment (expected to be design-only) | Account created; index increments. |
| `02-submit-proposal` | `submitProposal` attaches to dispute | Simulate `submitProposal` under existing `disputeAccount` | `proposalCount` increments; proposal stored. |
| `03-resolve-proposal` | `resolveProposal` finalizes a proposal | Simulate `resolveProposal` with `resolvedBy`, `resolution` | `resolved` flag updates to 1; `resolvedBy` recorded. |
| `04-close-dispute` | `closeDispute` ends dispute lifecycle | Simulate `closeDispute` with `tags` | `state` updates; `closedAtSlot` set. |
| `05-invalid-state-trans` | Attempt invalid transition (close before resolve) | Simulate `closeDispute` on unresolved dispute | Error: `InvalidStateTrans`. |
| `06-proposal-resolved` | Update resolved proposal | Run `voteProposal` on `resolved` proposal | Error: `ProposalResolved`. |
| `07-error-codes` | Validate error code generation | Pass invalid data or invalid account; check returned error code | Expected code returned. |

**Test tools:**
- Local validator only (no migrations, no program code).
- Mock external service calls for storage (no real write; design-only).

**Reporting:** Not implemented in design.

---

## 10. Deployment Notes for Devnet

**Design-level decisions:**
- Program name: `CityDeskDisputeRegistry`
- Seeds format: `[programId, "dispute", disputeIndex.toBuffer()]`
- Authority: Program ID or separate authority account (off-chain config). No governance.

**Devnet-unique aspects:**
- No migrations for this design; no DB sync needed.
- No minting / token / governance in scope.
- Off-chain storage service should be separate from CityDesk app’s data pipeline.

---

## 11. Future Extensions

If program is implemented, consider:

- Multi-sig authority (solana multi-sig wallet).
- Governance voting hook for dispute resolution rules.
- IPFS CID hashing and retrieval hook for off-chain content.
- Chain-based logs for compliance / audit (e.g., `LogStore` program).
- Sub-accounts for category-specific dispute handlers (e.g., `PropertyDispute`, `StreetDispute`).
- Token-based stakes or reputation system integrated via separate token program.

These are out of scope for this design.

---

## 12. References

- Anchor v2.1+ Quick Start (https://www.anchor-lang.com/docs/quickstart)
- Solana devnet guide (https://solana.com/developer/docs/quick-start/set-up-solana-local-validator)
- CityDesk NDU Status (docs/NDU_STATUS.md)

---


**Author:** gpu-so-goose-s1 (Model: Goose)
**Date:** 2026-10-10
**Gate:** Passed (document-only: md)
**Base:** main
