-- NDU property first slice (plan NDU-15, E4/E5) — OFF-CHAIN part only. Solana devnet only.
-- Items in a room scan, each tagged Personal / Family / Community, with an encrypted receipt + photo
-- and salted commitments that are ready to be anchored on-chain. Nothing here mints or signs:
-- property_records rows stay 'awaiting_mint' until the signing decision (NDU-2) is made.
--
-- Privacy rules for this schema:
--   * no plaintext columns for receipt fields (merchant, amount, date), serials, labels or group names;
--   * evidence bytes live encrypted on disk (PROPERTY_EVIDENCE_DIR), keyed by opaque ids, never user ids;
--   * salts and data keys are stored only wrapped with the server KEK (envelope encryption);
--   * every per-user query is keyed on user_id.
-- Known gap (prototype carry-over): scan_assets (0009) still keeps the owner's placement as plaintext
-- lng/lat for the map; NDU-12 moves that to an encrypted placement column.

create table if not exists property_consents (
  user_id text not null,
  copy_version text not null,
  accepted_at timestamptz not null default now(),
  primary key (user_id, copy_version)
);

-- Off-chain Family / Community groups (D7). Names are encrypted; invite tokens are stored hashed.
create table if not exists property_groups (
  id text primary key,
  kind text not null check (kind in ('family', 'community')),
  name_enc text not null,
  created_by text not null,
  created_at timestamptz not null default now()
);

create table if not exists property_group_members (
  group_id text not null references property_groups (id) on delete cascade,
  user_id text not null,
  role text not null default 'member' check (role in ('head', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index if not exists property_group_members_user on property_group_members (user_id);

create table if not exists property_group_invites (
  token_hash text primary key,
  group_id text not null references property_groups (id) on delete cascade,
  created_by text not null,
  expires_at timestamptz not null,
  used_by text,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists property_group_invites_group on property_group_invites (group_id);

create table if not exists property_items (
  id text primary key,
  user_id text not null,
  scan_id text references scan_assets (id) on delete set null,
  -- opaque public reference (16 hex); the only id that may ever appear in public metadata
  record_ref text not null unique,
  asset_class text not null check (asset_class in ('household', 'equipment')),
  scope text not null default 'personal' check (scope in ('personal', 'family', 'community')),
  group_id text references property_groups (id),
  label_enc text not null,
  -- pin on the model, in model space (metres); null until the item picker (NDU-20) sets it
  pin_x double precision,
  pin_y double precision,
  pin_z double precision,
  claim_status text not null default 'draft'
    check (claim_status in ('draft', 'claimed_offchain', 'pending_mint', 'minted', 'disputed', 'revoked', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'personal' and group_id is null) or (scope <> 'personal' and group_id is not null))
);
create index if not exists property_items_user on property_items (user_id, created_at desc);
create index if not exists property_items_scan on property_items (scan_id);
create index if not exists property_items_group on property_items (group_id) where group_id is not null;

-- Encrypted receipt / photo per item. sha256 = digest of the stored plaintext bytes
-- (photos after EXIF stripping). storage_key / dek_wrapped are nulled when shredded.
create table if not exists property_item_evidence (
  id text primary key,
  item_id text not null references property_items (id) on delete cascade,
  user_id text not null,
  kind text not null check (kind in ('receipt', 'photo')),
  mime text not null,
  bytes bigint not null,
  sha256 text not null,
  storage_key text,
  dek_wrapped text,
  created_at timestamptz not null default now(),
  shredded_at timestamptz
);
create unique index if not exists property_item_evidence_live on property_item_evidence (item_id, kind) where shredded_at is null;

-- Salted commitments per (item, kind) — D3. The salt is wrapped with the KEK; the commitment is
-- safe to publish. source_ref names what it was computed over (evidence id / scan id / group id),
-- never a raw low-entropy digest (e.g. of a geohash).
create table if not exists property_item_commitments (
  item_id text not null references property_items (id) on delete cascade,
  kind text not null check (kind in ('receipt', 'photo', 'scan', 'geo', 'group')),
  salt_wrapped text,
  commitment text not null,
  source_ref text,
  created_at timestamptz not null default now(),
  primary key (item_id, kind)
);

-- The claimant-signed record + its content-addressed public metadata. On-chain columns
-- (asset_id, tree, leaf_index, mint_sig) stay NULL in this build: minting is stubbed and OFF.
create table if not exists property_records (
  id text primary key,
  item_id text not null references property_items (id) on delete cascade,
  user_id text not null,
  cluster text not null default 'devnet' check (cluster = 'devnet'),
  claim_hash text not null,
  claim_message text not null,
  claimant_address text not null,
  claimant_sig text not null,
  metadata_json text not null,
  metadata_json_hash text not null,
  uri text not null,
  asset_id text,
  tree text,
  leaf_index bigint,
  mint_sig text,
  status text not null default 'awaiting_mint'
    check (status in ('awaiting_mint', 'pending', 'confirmed', 'finalized', 'failed', 'superseded')),
  superseded_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists property_records_asset on property_records (cluster, asset_id) where asset_id is not null;
create unique index if not exists property_records_mint_sig on property_records (mint_sig) where mint_sig is not null;
create unique index if not exists property_records_meta on property_records (metadata_json_hash);
create unique index if not exists property_records_item_live on property_records (item_id) where status <> 'superseded';
create index if not exists property_records_user on property_records (user_id, created_at desc);

-- Per-user rate limiting for property actions (NDU-17).
create table if not exists property_rate_events (
  user_id text not null,
  action text not null,
  at timestamptz not null default now()
);
create index if not exists property_rate_events_lookup on property_rate_events (user_id, action, at desc);
