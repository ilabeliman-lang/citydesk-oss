-- A split job and the cards that ran it. Amounts are a ledger only. Nothing is paid.
create table if not exists gpu_nodes (
  id text primary key,
  label text not null,
  gpu_name text not null,
  vram_mb int not null default 0,
  status text not null default 'stopped',
  lease text not null default 'closed' check (lease in ('closed')),
  created_at timestamptz not null default now()
);

create table if not exists gpu_jobs (
  id text primary key,
  kind text not null,
  status text not null,
  shards int not null,
  frames int not null default 0,
  useful_gpu_ms numeric not null default 0,
  billed_seconds numeric not null default 0,
  gross_usd numeric not null default 0,
  fee_usd numeric not null default 0,
  node_usd numeric not null default 0,
  paid boolean not null default false,
  output_sha256 text,
  created_at timestamptz not null default now()
);

create table if not exists gpu_shards (
  job_id text not null,
  shard_index int not null,
  node_id text not null,
  frames int not null,
  checksum text not null,
  gpu_ms numeric not null,
  flops bigint not null,
  learn_start numeric,
  learn_end numeric,
  primary key (job_id, shard_index)
);
