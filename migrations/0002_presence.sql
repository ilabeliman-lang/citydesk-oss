create table if not exists presence (
  user_id text primary key,
  display_name text not null default '',
  avatar text not null default '',
  lat double precision,
  lng double precision,
  share_lat double precision,
  share_lng double precision,
  visible boolean not null default false,
  updated_at timestamptz not null default now()
);

create index if not exists presence_visible_idx on presence (visible, updated_at);
