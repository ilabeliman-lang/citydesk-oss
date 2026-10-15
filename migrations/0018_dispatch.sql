-- A recorded tile. The bytes are not executed. The unit is left idle.
create table if not exists dispatch_log (
  id text primary key,
  unit_id text not null,
  kind text not null,
  bytes int not null,
  status text not null check (status in ('recorded')),
  created_at timestamptz not null default now()
);
