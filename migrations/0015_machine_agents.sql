-- Machine agents on this platform. A row is a listing, not a lease.
-- lease can only be closed: nobody outside can run code on the machine.
create table if not exists machine_agents (
  id text primary key,
  user_id text not null default 'studio',
  label text not null,
  kind text not null check (kind in ('cpu', 'gpu')),
  vram_gb int not null default 0,
  model_name text not null default '',
  role text not null check (role in ('commander', 'distiller')),
  version int not null default 1,
  status text not null default 'active' check (status in ('active', 'paused')),
  lease text not null default 'closed' check (lease in ('closed')),
  created_at timestamptz not null default now()
);

create table if not exists agent_revisions (
  agent_id text not null references machine_agents (id) on delete cascade,
  version int not null,
  model_name text not null,
  duty text not null,
  created_at timestamptz not null default now(),
  primary key (agent_id, version)
);

create table if not exists knowledge_pool (
  id text primary key,
  parent_id text,
  version int not null default 1,
  agent_id text,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists agent_jobs (
  id text primary key,
  agent_id text,
  status text not null check (status in ('running', 'done', 'failed', 'skipped')),
  detail text,
  created_at timestamptz not null default now(),
  finished_at timestamptz
);

create unique index if not exists agent_jobs_one_running on agent_jobs ((1)) where status = 'running';
