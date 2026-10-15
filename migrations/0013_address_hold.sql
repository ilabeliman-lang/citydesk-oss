-- Address holds. Additive. A building is an address. Title may be shared.
-- A floor has one renter. A flat is one unit on a storey. The council is not a row here.
create table if not exists ndu_address (
  id text primary key,
  label text not null,
  lat double precision,
  lng double precision,
  storeys int not null default 1
);
create table if not exists ndu_address_hold (
  address_id text not null references ndu_address (id) on delete cascade,
  user_id text not null references "user" (id) on delete cascade,
  kind text not null check (kind in ('title', 'floor', 'flat')),
  floor int not null default 0,
  unit text not null default '',
  created_at timestamptz not null default now(),
  primary key (address_id, user_id, kind, floor, unit)
);
