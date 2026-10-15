-- upg-u-071: SQL indexes for property + address-hold lookups.
-- Pure additive — every index below is tied to an existing WHERE / JOIN / ORDER BY
-- in the running code. No speculative indexes: where the current schema already
-- covers a predicate (property_items PK/record_ref unique, property_records
-- partial item_live index, property_item_commitments PK, ndu_address_hold PK for
-- the revoke delete), nothing is added.
--
-- Query map (each index -> the query it serves):
--   idx_property_item_evidence_item_kind
--     src/world/property.server.ts:321  liveEvidence()
--       `select distinct on (item_id, kind) * from property_item_evidence
--         where item_id = any($1::text[]) order by item_id, kind, created_at desc`
--     Also the leading prefix serves the item_id-only lookups at
--     src/world/property.server.ts:467 (`where item_id = ...`).
--     The existing partial unique index property_item_evidence_live
--     (item_id, kind) where shredded_at is null cannot serve this query: it
--     omits created_at (the distinct-on ordering) and excludes shredded rows.
--
--   idx_property_items_scan_user
--     src/world/property.server.ts:372  listItemsForScan()
--       `select * from property_items where scan_id = ... and user_id = ...
--         order by created_at`
--     src/world/property.server.ts:405  addItem() per-scan item cap
--       `select count(*) from property_items where scan_id = ... and user_id = ...`
--     src/world/property.server.ts:434  ownedScan() row count
--       `select count(*) from property_items where scan_id = ... and user_id = ...`
--     The existing property_items_scan (scan_id) index leaves user_id as a
--     filter and forces a sort for the created_at ordering; this composite
--     satisfies filter + order in one scan.
--
--   idx_ndu_address_hold_address
--     src/world/address/addressHolds.ts:26  rowsFor()
--       `select ... from ndu_address_hold h where h.address_id = ...
--         order by h.kind, h.floor, h.unit`
--     src/world/address/addressHolds.ts:72  claimAddressHold() occupancy check
--       `select u.name from ndu_address_hold h where h.address_id = ... and
--         h.kind = ... and h.floor = ... and h.unit = ... and h.user_id <> ...`
--     The table PK (address_id, user_id, kind, floor, unit) filters on
--     address_id only, so the rowsFor ORDER BY (kind, floor, unit) would need a
--     sort; this composite gives filter + order, and the claim check gets all
--     four of its equality predicates from the index.
--
-- Rollback (operator only):
--   drop index if exists idx_property_item_evidence_item_kind;
--   drop index if exists idx_property_items_scan_user;
--   drop index if exists idx_ndu_address_hold_address;

create index if not exists idx_property_item_evidence_item_kind
  on property_item_evidence (item_id, kind, created_at desc);

create index if not exists idx_property_items_scan_user
  on property_items (scan_id, user_id, created_at);

create index if not exists idx_ndu_address_hold_address
  on ndu_address_hold (address_id, kind, floor, unit);
