create table if not exists businesses (
  id text primary key,
  owner_id text not null,
  name text not null,
  category text not null,
  offer text not null,
  lat double precision not null,
  lng double precision not null,
  open boolean not null default true,
  updated_at timestamptz not null default now()
);

create index if not exists businesses_owner_idx on businesses (owner_id);
create index if not exists businesses_open_idx on businesses (open);
