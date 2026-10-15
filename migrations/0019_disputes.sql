-- A dispute on one subject. Status moves open, then challenged, then settled.
create table if not exists disputes (
  id text primary key,
  subject_id text not null,
  status text not null check (status in ('open', 'challenged', 'settled')),
  opened_at timestamptz not null default now()
);
