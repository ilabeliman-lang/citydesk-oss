alter table businesses add column if not exists layout text not null default '[]';
alter table businesses add column if not exists fuel_price integer not null default 12;

create table if not exists fuel_sales (
  id text primary key,
  business_id text not null,
  user_id text not null,
  vouchers integer not null,
  created_at timestamptz not null default now()
);
