-- Devices an owner put in the pool. Nothing is discovered or claimed from a scan.
create table if not exists processing_units (
  id text primary key,
  user_id text not null,
  label text not null,
  kind text not null check (kind in ('phone', 'cpu', 'iot', 'gpu')),
  ram_mb int not null check (ram_mb >= 0),
  max_chunk_bytes int not null check (max_chunk_bytes > 0),
  status text not null default 'idle' check (status in ('idle', 'busy', 'offline')),
  lease text not null default 'closed' check (lease in ('closed')),
  created_at timestamptz not null default now()
);
