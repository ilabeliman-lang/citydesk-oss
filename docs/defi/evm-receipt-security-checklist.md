# EVM Property-Receipt Contract — Security Checklist

Design notes only. No contract code, no chain access. Minting stays OFF until NDU-2 is decided.

## Access Control

- [ ] Only a designated `minter` role can call `mint` / `safeMintFrom`.
- [ ] Only an `admin` role can pause/unpause, set the minter, or upgrade the implementation.
- [ ] Use OpenZeppelin `AccessControl` (or equivalent) — no hardcoded addresses.
- [ ] All privileged functions are `onlyRole`-guarded; default-deny.
- [ ] Role changes emit an event and are rate-limited or timelocked (≥ 24 h).
- [ ] No public `setApprovalForAll` to a contract address without a whitelist check.

## Reentrancy

- [ ] Apply checks-effects-interactions on every state-changing function.
- [ ] Mark external calls to untrusted contracts with `nonReentrant` (OpenZeppelin `ReentrancyGuard`).
- [ ] Avoid calling `tokenOfOwnerByIndex` or other enumeration helpers inside a loop that mutates state.
- [ ] If the contract ever calls back into the caller (e.g. `onERC721Received`), validate the return data strictly.
- [ ] Keep external calls to a minimum; prefer pull-over-push for any future payout logic.

## Upgradeability

- [ ] Use a proxy pattern (UUPS or Transparent) if upgradeability is required; document the choice.
- [ ] Storage layout is versioned; every new state variable is appended, never inserted mid-layout.
- [ ] `initialize` is callable exactly once; subsequent calls revert.
- [ ] Admin cannot upgrade while the contract is paused (or vice-versa — pick one and document it).
- [ ] Include a `storageGap` at the end of the contract to allow future variable additions without breaking layout.
- [ ] Upgrade path requires a timelock and emits `Upgraded(address)` event.

## Event Design

- [ ] Emit `Transfer`, `Approval`, `ApprovalForAll` per ERC-721 spec.
- [ ] Emit a custom `ReceiptMinted(uint256 tokenId, address owner, uint256 propertyId)` on mint.
- [ ] Emit `ReceiptBurned(uint256 tokenId, address from)` on burn.
- [ ] Emit `Paused(address account)` / `Unpaused(address account)` on pause state change.
- [ ] Emit `MinterChanged(address oldMinter, address newMinter)` on role change.
- [ ] All events use indexed parameters for the fields most commonly filtered (tokenId, owner).
- [ ] No sensitive data (private keys, off-chain PII) in event data.

## Test Plan (Foundry + local Anvil only)

- [ ] Unit tests: mint, transfer, burn, pause, role changes — happy path and revert cases.
- [ ] Reentrancy test: mock a malicious `onERC721Received` that re-enters; assert state is unchanged.
- [ ] Access-control test: call every privileged function from a non-privileged address; expect revert.
- [ ] Upgrade test: deploy proxy → implementation v1 → upgrade to v2 → verify storage integrity and `initialize` guard.
- [ ] Event test: decode emitted logs and assert topic/data match expected values.
- [ ] Fuzz test: random `tokenId` / `owner` combinations for `transferFrom`; assert invariants hold.
- [ ] Invariant test: total supply never exceeds cap; no token exists without an owner.
- [ ] Run all tests against a local `anvil` instance only (`forge test --fork-url` is NOT used).
- [ ] CI gate: `forge build && forge test` must pass before any merge.
- [ ] No test connects to a public RPC, mainnet, or any non-local endpoint.
