-- A person offers a machine by name. Listing does not pay anyone.
-- A hire is still the existing devnet transfer the user signs. Mainnet stays off.
create table if not exists compute_nodes (
  id text primary key,
  user_id text not null,
  label text not null,
  kind text not null check (kind in ('gpu', 'cpu')),
  vram_gb int not null default 0,
  status text not null default 'offered' check (status in ('offered', 'paused')),
  cluster text not null default 'devnet',
  note text,
  created_at timestamptz not null default now()
);
create index if not exists compute_nodes_open on compute_nodes (status, created_at desc);
