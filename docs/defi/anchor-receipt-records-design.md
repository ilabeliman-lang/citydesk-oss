# Anchor Program Design: Property Receipt Records (devnet)

**Purpose:** Define a Solana Anchor program on devnet to store property receipt hashes in the NDU / CityDesk ecosystem.

**Target net:** devnet
**Program name:** `receipt_records`
**Bundler:** Anchor CLI (`anchor init`)

---

## 1. Overview

The program provides on-chain storage for cryptographic hashes of property receipts (e.g., receipt image/packet hashes) for the CityDesk property workflow. Clients submit a receipt hash to a dedicated account. The program records the hash with a timestamp and a short metadata payload, and enforces rent-exempt storage.

Key concerns:

- Account layout compact and size-conservative (anchor accounts + seeds)
- Rent-exempt: the account must store at least the buffer size of `RIE_DATA_SIZE`
- Minimal, single-action program (record) to minimize attack surface on devnet
- No minting, no payments, no transfer logic; purely storage

---

## 2. Program & account layout

### 2.1 Seeds

- Property account (records receipt): `receipt_record_prop(<owner_pubkey>_hash[:32])` (hash truncated to 32B, or use `blake3_hash()` of account data for stability) — seeds: `[b"prop", prop_hash.as_ref()]`
- Metadata account (optional): `receipt_record_meta(<owner_pubkey>_hash[:32])` — seeds: `[b"meta", prop_hash.as_ref()]`
- PDA for program-level config/rent authority: `receipt_config` — seeds: `[b"config"]` (fixed), owned by sysvar/syscall account (`SysvarProviders::Sysrent` if needed)

If you choose to stabilize the seed:
- Compute a 32-byte hash of the raw receipt data (e.g., SHA-256/BLAKE3) and truncate to 32 bytes.

### 2.2 Owned accounts

- **Property account (`receipt_record_prop`)**
  - `prop: Pubkey`
  - `owner: Pubkey`
  - `receipt_hash: [u8; 32]` — raw hash of the receipt (SHA-256 / BLAKE3 of the receipt data)
  - `timestamp: u64`
  - `payload: String` — optional short metadata (e.g., type, location)
- **Metadata account (`receipt_record_meta`) – optional, for extensibility**
  - `meta: Pubkey`
  - `prop: Pubkey` — links back to the property account
  - `data: [u8; 256]` — larger metadata payload (e.g., signed transaction JSON)
  - `timestamp: u64`

### 2.3 Invariant (not enforced in on-chain validation on devnet)
- One property account per receipt hash (`0..1` on-chain relationship) — enforced via seed uniqueness; you can store `prop_hash` as seed, then read it back to verify uniqueness.

### 2.4 Rent exemption

**Minimum rent-exempt balance** = `(DATA_SIZE * sysvar_rent_rent_lamports_per_byte_unit) / sysvar_rent_unrent_lamports_per_byte_unit`

- `sysvar_rent_rent_lamports_per_byte_unit` = `1_000_000` (as of Solana 1.x).
- `sysvar_rent_unrent_lamports_per_byte_unit` = `1_000_000`.

**Simplified calculation** (historical values):
- `sysvar_rent_rent_lamports_per_byte_unit` = `1`, `sysvar_rent_unrent_lamports_per_byte_unit` = `1` on older Solana versions.
- `DATA_SIZE` = size of the property account (see Section 3).

---

## 3. Size math & account sizing

We target ~1–2KB total stored data to keep rent manageable.

### 3.1 Property account (`receipt_record_prop`)

| Field                    | Type          | Bytes            | Notes                            |
|--------------------------|---------------|------------------|----------------------------------|
| `prop`                   | `Pubkey`      | 32               | 1                                    |
| `owner`                  | `Pubkey`      | 32               | 1                                    |
| `receipt_hash`           | `[u8; 32]`    | 32               | 1                                    |
| `timestamp`              | `u64`         | 8                | 1                                    |
| `payload`                | `String`      | ~250              | UTF-8 length-prefixed; assume worst-case |
| Padding/alignment        |               | 2                | Align to 8 bytes; can be zero or `0x00..` |

**Rough worst-case size:**
- `prop` = 32
- `owner` = 32
- `receipt_hash` = 32
- `timestamp` = 8
- `payload` = length byte (1) + maximum valid length bytes (~250) = ~251
- Alignment padding = 2 (to 256 bytes)

**Total worst-case: 256 bytes**.

### 3.2 Metadata account (`receipt_record_meta`) – optional

| Field                     | Type          | Bytes            | Notes                                   |
|---------------------------|---------------|------------------|-----------------------------------------|
| `meta`                    | `Pubkey`      | 32               | 1                                         |
| `prop`                    | `Pubkey`      | 32               | 1                                         |
| `data`                    | `[u8; 256]`   | 256              | 1                                         |
| `timestamp`               | `u64`         | 8                | 1                                         |

**Total size: 360 bytes**.

### 3.3 Rent-exempt math (devnet)

Using Solana 1.x units (historical approximate values for clarity):

- `sysvar_rent_rent_lamports_per_byte_unit` = `1_000_000`
- `sysvar_rent_unrent_lamports_per_byte_unit` = `1_000_000`

Rent-exempt balance for property account:
- Balance = `(DATA_SIZE / sysvar_rent_unrent_lamports_per_byte_unit) * sysvar_rent_rent_lamports_per_byte_unit`
- Approx. Balance = `(256 / 1_000_000) * 1_000_000` = `256 sol` (devnet units).

Rent-exempt balance for metadata account:
- Data size = 360 bytes
- Approx. Balance = `(360 / 1_000_000) * 1_000_000` = `360 sol`.

With ~1 sol per 1_000_000 lamports, these amounts are in the 200s of devnet SOL (much larger than on other networks). Ensure you:
- Use devnet dev wallets with sufficient balance to test rent-exempt writes; if tests fail due to insufficient balance, top up devnet tokens.

---

## 4. Rent notes

### 4.1 On devnet

- Rent-exempt balance calculation uses the same formula on devnet, so the numbers above are accurate.
- Accounts must be rent-exempt when created. On failure, the runtime will bump the account if you pass the `AccountInfo` to Anchor’s `invoke_signed`, or the transaction will fail with `Account is not rent-exempt`.
- To avoid renting out: if storage is no longer needed, mark the account as deletable/decommissioned via `transferFrom` from a separate rent authority, or use a separate boolean flag; then `SystemProgram.transfer` the remaining lamports back to a safe address, followed by `SystemProgram.createAccountWithSeed` with `Space::new(0)` and `lamports = 0`. Anchor can automate this with an `invoke_signed` and a program-level authority.

### 4.2 Localnet considerations

- On localnet (e.g., `solana-test-validator`), the default `rent_lamports_per_byte` can be different; the official localnet default is still `1` lamport per byte but you may want to adjust via `--warp-lamports` or `--no-warp` flags.

### 4.3 Invariant & idempotency

- The program does not enforce idempotency. If a client writes the same receipt hash twice, they must enforce it client-side or via a database.
- No state transitions: single write, no rewrites.

---

## 5. Localnet test plan

### 5.1 Environment

```bash
# Install dependencies
cargo install solana-cli --version "^2.0"
cargo install anchor-cli --version "^1.0"
solana-keygen new --outfile ~/receipts-keypair.json --no-bip39-passphrase
export TEST_OWNER=your_test_owner_keypair
export TEST_PROGRAM_ID=$(solana program deploy --pg-program-id @receipt_records_path --bypass-lock --program-name receipt_records <<< "$TEST_OWNER")
```

> Adjust paths as needed.

### 5.2 Steps

1. Initialize the Anchor program locally:
   ```bash
   anchor init receipt_records
   # Edit programs/receipt_records/src/lib.rs per the layout above
   anchor build
   ```
2. Start test-validator with warp enabled (if you prefer):
   ```bash
   solana-test-validator --warp-lamports
   ```
3. Deploy the program to localnet:
   ```bash
   anchor deploy
   ```
4. Generate keys for owner and a receiver wallet:
   ```bash
   solana-keygen new --outfile ~/owner.key
   solana-keygen new --outfile ~/receiver.key
   ```
5. Compute a test receipt hash (SHA-256 or BLAKE3):
   ```bash
   echo "receipt_data_123" | sha256sum | awk '{print $1}'
   # Output: a64fb6c... (hex string)
   ```
6. Record a receipt:
   - Use Anchor client (`programs/receipt_records/src/client.ts`:
     - `invoke('record', { ... })` or `sendAndConfirmTransaction('record', ...)`
     - Ensure owner and receiver have enough devnet SOL.
   - Confirm the transaction succeeds with account `System.out` confirming property account created rent-exempt.
   - Retrieve the property account via `invoke('resolve', { ... })` (optional) and read hash and timestamp.

7. Verify size and rent:
   - Check account size: `solana account <property_account_pubkey> --program-id <program_id>`
   - Verify hash matches: `invoke('resolve', { ... })` returns correct fields.

8. Clean up:
   - Remove property account by transferring from a rent authority and deleting with `SystemProgram.createAccountWithSeed(0)`.

### 5.3 Expected failures & handling

- If an account is not rent-exempt, Anchor will fail unless you bump the account via `invoke_signed` with extra lamports.
- If not enough SOL in devnet, top up devnet tokens for testing: `solana airdrop 2000 <wallet> --url devnet`.

---

## 6. Security & compliance notes

### 6.1 No minting or payments

- No token creation, no transfer between strangers, no wallet private keys stored in code.
- On devnet, only demonstration.

### 6.2 Hash validation

- Clients must ensure they submit a valid 32-byte hash. The program does not validate hash format.

### 6.3 Idempotency

- Not enforced; rely on client-side deduplication or centralized database.

---

## 7. Summary

- Program: `receipt_records` on devnet
- Single property account (≈256B) for each receipt hash, with optional metadata account (≈360B)
- Rent-exempt balances computed with `sysvar_rent_rent_lamports_per_byte_unit` = `1_000_000` and `sysvar_rent_unrent_lamports_per_byte_unit` = `1_000_000`
- Localnet test plan: initialization, deployment, account creation, size/rent verification, cleanup
- No money, minting, or transfers; purely storage
