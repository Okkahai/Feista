-- Feista core schema. Plain Postgres (works on Supabase or local).
-- Tenant isolation: every query runs as role feista_app with `app.user_id` set per transaction
-- (SET LOCAL app.user_id = '<uuid>'); RLS is FORCED so even the table owner path is filtered.

create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now()
);

create or replace function app_user() returns uuid language sql stable as
$$ select nullif(current_setting('app.user_id', true), '')::uuid $$;

-- BYOK credentials: only ciphertext is stored (envelope encryption done by the API; see docs/SECURITY.md).
create table credentials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  provider text not null check (provider ~ '^[a-z0-9_-]{2,40}$'),
  label text not null default '',
  ciphertext bytea not null,
  wrapped_key bytea not null,
  key_version int not null,
  last4 text not null check (char_length(last4) <= 4),
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create unique index credentials_one_active on credentials(owner_id, provider) where revoked_at is null;

create table projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('story', 'clip')),
  title text not null check (char_length(title) between 1 and 200),
  config jsonb not null default '{}',
  scene_count int not null check (scene_count between 1 and 24),
  budget_limit_cents int not null check (budget_limit_cents >= 0),
  approval_threshold_cents int not null check (approval_threshold_cents >= 0),
  warn_fraction numeric not null check (warn_fraction between 0 and 1),
  created_at timestamptz not null default now()
);

-- One row per DAG node (see packages/core pipeline.ts / jobs.ts).
create table stage_runs (
  project_id uuid not null references projects(id) on delete cascade,
  node_id text not null check (node_id ~ '^[a-z_]+(:[0-9]+)?$'),
  status text not null check (status in
    ('queued','running','awaiting_provider','awaiting_review','completed','failed','cancelled')),
  generation int not null default 1 check (generation >= 1),
  attempt int not null default 1 check (attempt >= 1),
  max_attempts int not null check (max_attempts >= 1),
  lease_losses int not null default 0 check (lease_losses >= 0),
  max_lease_losses int not null check (max_lease_losses >= 0),
  lease_until timestamptz,
  external_id text,
  error text,
  updated_at timestamptz not null default now(),
  primary key (project_id, node_id)
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  node_id text not null,
  generation int not null,
  kind text not null check (kind in ('image','video','audio','captions','final','cover','other')),
  storage_key text not null unique check (storage_key !~ '\.\.'),
  mime text not null,
  bytes bigint not null check (bytes >= 0),
  created_at timestamptz not null default now()
);

-- Spend: estimates and provider-reported cost are separate columns, never merged.
create table ledger (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  node_id text,
  provider text,
  estimated_cents int not null check (estimated_cents >= 0),
  reported_cents int check (reported_cents >= 0),
  created_at timestamptz not null default now()
);

-- Application role: no bypass, sees only its user's rows.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'feista_app') then
    create role feista_app nologin;
  end if;
end $$;
grant usage on schema public to feista_app;
grant select, insert, update, delete on users, credentials, projects, stage_runs, assets, ledger to feista_app;

alter table users enable row level security;       alter table users force row level security;
alter table credentials enable row level security; alter table credentials force row level security;
alter table projects enable row level security;    alter table projects force row level security;
alter table stage_runs enable row level security;  alter table stage_runs force row level security;
alter table assets enable row level security;      alter table assets force row level security;
alter table ledger enable row level security;      alter table ledger force row level security;

create policy own_user on users for all to feista_app using (id = app_user()) with check (id = app_user());
create policy own_credentials on credentials for all to feista_app
  using (owner_id = app_user()) with check (owner_id = app_user());
create policy own_projects on projects for all to feista_app
  using (owner_id = app_user()) with check (owner_id = app_user());

create or replace function owns_project(p uuid) returns boolean language sql stable as
$$ select exists (select 1 from projects where id = p and owner_id = app_user()) $$;

create policy own_runs on stage_runs for all to feista_app using (owns_project(project_id)) with check (owns_project(project_id));
create policy own_assets on assets for all to feista_app using (owns_project(project_id)) with check (owns_project(project_id));
create policy own_ledger on ledger for all to feista_app using (owns_project(project_id)) with check (owns_project(project_id));
