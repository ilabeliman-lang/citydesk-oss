-- NEURA / NeuraNet devnet integration (Solana devnet only).
-- wallet_links: a CityDesk user proved control of a Solana address by signing a
-- one-time nonce (no transaction, no gas). Base58 is case-sensitive: stored as given.
create table if not exists wallet_links (
  user_id text not null,
  chain text not null default 'solana',
  cluster text not null default 'devnet',
  address text not null,
  verified_at timestamptz not null default now(),
  primary key (user_id, chain, cluster)
);
create unique index if not exists wallet_links_addr on wallet_links (chain, cluster, address);

-- Short-lived, single-use nonces for the link signature.
create table if not exists wallet_nonces (
  nonce text primary key,
  user_id text not null,
  address text not null,
  message text not null,
  expires_at timestamptz not null
);
create index if not exists wallet_nonces_user on wallet_nonces (user_id);

-- Compute desk hires. Every step is user-approved in the wallet:
--   intent -> (user signs intent message) -> signed -> (user signs devnet
--   transfer, relayed to devnet only) -> paid_devnet. Nothing is sent by the app.
create table if not exists compute_hires (
  id text primary key,
  user_id text not null,
  wallet text not null,
  cluster text not null default 'devnet',
  offer_id text not null,
  offer_name text not null,
  source text not null,
  token_key text not null,
  mint text not null,
  decimals integer not null,
  amount_base text not null,
  amount_ui text not null,
  payee text,
  intent_message text not null,
  intent_signature text,
  tx_signature text,
  status text not null default 'intent',
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists compute_hires_user on compute_hires (user_id, created_at desc);
create unique index if not exists compute_hires_tx on compute_hires (tx_signature) where tx_signature is not null;
