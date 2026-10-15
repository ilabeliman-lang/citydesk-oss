-- Imported 3D scans (prototype of the "scan it, place it" first slice; no chain, no minting).
-- The file itself lives on the server's persistent disk (SCAN_STORAGE_DIR); this row is
-- its owner, its hash, and where the owner placed it on the map. Private by default:
-- every query in the app is scoped to user_id, so only the owner ever sees a scan.
create table if not exists scan_assets (
  id text primary key,
  user_id text not null,
  name text not null,
  format text not null check (format in ('glb', 'gltf', 'usdz', 'splat', 'ply', 'spz')),
  bytes bigint not null,
  sha256 text not null,
  storage_key text not null,
  visibility text not null default 'private' check (visibility in ('private', 'family', 'public')),
  lng double precision,
  lat double precision,
  rotation_deg double precision not null default 0,
  scale double precision not null default 1,
  placed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists scan_assets_user on scan_assets (user_id, created_at desc);
