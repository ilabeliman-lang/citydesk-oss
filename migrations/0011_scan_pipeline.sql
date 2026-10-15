-- NDU-UPG #351-#356, #369, #378, #391: scan import pipeline.
-- Each upload keeps its raw file (storage_key, owner download) and gains an optimised GLB
-- (optimized_key, served by default) once the CPU pipeline has converted/validated it.
-- status: stored (not processed) -> queued -> converting -> ready | failed (status_reason says why).
alter table scan_assets add column if not exists status text not null default 'stored';
alter table scan_assets add column if not exists status_reason text;
alter table scan_assets add column if not exists optimized_key text;
alter table scan_assets add column if not exists optimized_bytes bigint;
alter table scan_assets add column if not exists optimized_sha256 text;
-- pipeline: { stats: {before, after, preset, size, offset, ...}, validation: {...}, reportKey }
alter table scan_assets add column if not exists pipeline jsonb;
alter table scan_assets add column if not exists processed_at timestamptz;

create table if not exists scan_jobs (
  id text primary key,
  scan_id text not null,
  user_id text not null,
  status text not null default 'queued' check (status in ('queued', 'running', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scan_jobs_open on scan_jobs (status, created_at);
create index if not exists scan_jobs_scan on scan_jobs (scan_id);
