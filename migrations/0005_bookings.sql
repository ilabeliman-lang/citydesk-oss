alter table businesses add column if not exists verified boolean not null default false;
alter table businesses add column if not exists verified_at timestamptz;
alter table businesses add column if not exists verified_by text;

create table if not exists app_admins (
  email text primary key
);

insert into app_admins (email) values ('admin@example.com')
on conflict (email) do nothing;

create table if not exists bookings (
  id text primary key,
  business_id text not null,
  user_id text not null,
  starts_at timestamptz not null,
  note text not null default '',
  status text not null default 'booked',
  created_at timestamptz not null default now(),
  checked_in_at timestamptz
);

create index if not exists bookings_biz_idx on bookings (business_id, starts_at);
create index if not exists bookings_user_idx on bookings (user_id, starts_at);
create unique index if not exists bookings_one_seat
  on bookings (business_id, starts_at)
  where status in ('booked', 'checked_in');
