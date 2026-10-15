-- NDU-UPG sessions: session management for users and admins.
--
-- ADDITIVE ONLY: three new tables and two indexes. Better Auth's own "user" / "session" columns are
-- NOT altered, so sign-in keeps working whether or not this file has been applied (the app checks
-- for these tables and degrades: no suspension, no audit log, no place / last-active detail).
-- Idempotent (if not exists). DO NOT apply to the production citydesk-pg without Wei's OK.

-- Per-session detail the user and admins see. Only what is needed: no full IP, no raw UA string.
create table if not exists ndu_session_meta (
  session_id text primary key references "session" ("id") on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  ip_net text,       -- network only: a.b.c.0/24 or xxxx:xxxx:xxxx::/48, never the full address
  device text,       -- parsed label, e.g. "Safari on iPhone"
  place text,        -- coarse (city, region, country) from Cloudflare headers when present, else null
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index if not exists ndu_session_meta_user_idx on ndu_session_meta (user_id);

-- A suspended user cannot sign in; their sessions are revoked when suspended.
create table if not exists ndu_user_suspension (
  user_id text primary key references "user" ("id") on delete cascade,
  reason text,
  suspended_by text not null,
  suspended_at timestamptz not null default now()
);

-- Who did what, when, on the admin sessions desk. Pruned after NDU_AUDIT_RETENTION_DAYS (180).
create table if not exists ndu_admin_audit (
  id bigserial primary key,
  at timestamptz not null default now(),
  actor_id text not null,
  actor_email text,
  action text not null,
  target_user_id text,
  target_session_id text,
  detail text
);
create index if not exists ndu_admin_audit_at_idx on ndu_admin_audit (at desc);

-- Retention cleanup deletes expired sessions by expiry time.
create index if not exists ndu_session_expires_idx on "session" ("expiresAt");

-- Privacy: older session rows kept the full client IP. Keep only the network from now on.
update "session" set "ipAddress" = regexp_replace("ipAddress", '^(\d+\.\d+\.\d+)\.\d+$', '\1.0/24')
  where "ipAddress" ~ '^\d+\.\d+\.\d+\.\d+$';
update "session" set "ipAddress" = null where "ipAddress" like '%:%';
