-- NDU-UPG upg-u-046: address holds expire.
--
-- ADDITIVE ONLY: one nullable column and one index on ndu_address_hold. No existing column is
-- altered or dropped, no row is deleted, and nothing here changes the primary key, so claim /
-- revoke keep working exactly as before whether or not this file has been applied.
-- Idempotent (if not exists). DO NOT apply to the production citydesk-pg without Wei's OK.
--
-- Existing rows keep their hold: the default backfills them with now() + 30 days measured from
-- the moment the migration runs, so nobody loses a hold they are standing on today.

alter table ndu_address_hold
  add column if not exists expires_at timestamptz;

update ndu_address_hold
  set expires_at = now() + interval '30 days'
  where expires_at is null;

alter table ndu_address_hold
  alter column expires_at set default now() + interval '30 days';

-- The worker only ever asks "what is already past its deadline", so index exactly that.
create index if not exists ndu_address_hold_expires_idx
  on ndu_address_hold (expires_at)
  where expires_at is not null;
