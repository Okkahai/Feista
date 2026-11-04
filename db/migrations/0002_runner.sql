-- Job runner: stage_runs is the queue (claimed with FOR UPDATE SKIP LOCKED; see DECISIONS #13).
alter table stage_runs add column run_after timestamptz not null default now();
-- the user approved this node's spend above the per-operation threshold (budget gate, packages/core budget.ts)
alter table stage_runs add column spend_approved boolean not null default false;
create index stage_runs_claim on stage_runs (run_after) where status = 'queued';
create index stage_runs_lease on stage_runs (lease_until) where status = 'running';

-- feista_worker works across tenants, but only on queue/spend/asset rows; it can never read
-- credentials or users. Provider keys are opened per job as the owner (SET ROLE feista_app + app.user_id).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'feista_worker') then
    create role feista_worker nologin;
  end if;
end $$;
grant usage on schema public to feista_worker;
grant select on projects to feista_worker;
grant select, insert, update on stage_runs, ledger to feista_worker;
grant select, insert on assets to feista_worker;
create policy worker_projects on projects for select to feista_worker using (true);
create policy worker_runs on stage_runs for all to feista_worker using (true) with check (true);
create policy worker_ledger on ledger for all to feista_worker using (true) with check (true);
create policy worker_assets on assets for all to feista_worker using (true) with check (true);

-- The runner logs in as feista_runner (no privileges of its own, like feista_api).
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'feista_runner') then
    create role feista_runner nologin noinherit;
  end if;
end $$;
grant feista_worker, feista_app to feista_runner;
