-- Link a paid devnet hire to the NeuraNet dispatcher job it queued (off-chain).
-- The user signs the dispatcher's canonical create_job message in their wallet (no gas).
alter table compute_hires add column if not exists dispatcher_message text;
alter table compute_hires add column if not exists dispatcher_job_id text;
