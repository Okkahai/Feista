-- Run after migrations, as a superuser. Fails (ON_ERROR_STOP) on any broken isolation rule.
\set ON_ERROR_STOP on
\set A '''00000000-0000-0000-0000-00000000000a'''
\set B '''00000000-0000-0000-0000-00000000000b'''
\set PA '''10000000-0000-0000-0000-000000000001'''
-- users are created by the privileged auth path only
insert into users (id, email) values (:A, 'a@test'), (:B, 'b@test');

-- behave like the API: unprivileged login, then the app role
set session authorization feista_api;
set role feista_app;

begin;
set local app.user_id = :A;
insert into projects (id, owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction)
  values (:PA, :A, 'story', 'A film', 5, 3000, 1500, 0.8);
insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses) values (:PA, 'scene_video:0', 'queued', 2, 2);
insert into credentials (owner_id, provider, ciphertext, wrapped_key, key_version, last4) values (:A, 'fal', '\x01', '\x02', 1, 'abcd');
insert into ledger (project_id, estimated_cents) values (:PA, 120);
insert into assets (project_id, node_id, generation, kind, storage_key, mime, bytes)
  values (:PA, 'scene_video:0', 1, 'video', '10000000-0000-0000-0000-000000000001/s0.mp4', 'video/mp4', 10);
commit;

begin;
set local app.user_id = :B;
insert into projects (id, owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction)
  values ('20000000-0000-0000-0000-000000000002', :B, 'story', 'B film', 1, 100, 50, 0.8);
do $$
declare n int;
begin
  -- reads
  if (select count(*) from projects where id = '10000000-0000-0000-0000-000000000001') <> 0 then raise exception 'B sees A project'; end if;
  if (select count(*) from stage_runs) <> 0 then raise exception 'B sees A runs'; end if;
  if (select count(*) from credentials) <> 0 then raise exception 'B sees A credentials'; end if;
  if (select count(*) from ledger) <> 0 then raise exception 'B sees A ledger'; end if;
  if (select count(*) from assets) <> 0 then raise exception 'B sees A assets'; end if;
  if (select count(*) from users) <> 1 then raise exception 'B sees other users'; end if;
  -- writes into A's project / as A
  begin
    insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses)
      values ('10000000-0000-0000-0000-000000000001', 'assembly', 'queued', 2, 2);
    raise exception 'B inserted into A project';
  exception when insufficient_privilege then null; end;
  begin
    insert into projects (owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction)
      values ('00000000-0000-0000-0000-00000000000a', 'story', 'x', 1, 1, 1, 0.5);
    raise exception 'B created a project owned by A';
  exception when insufficient_privilege then null; end;
  -- storage keys are bound to the row's own project: B can't claim A's prefix
  begin
    insert into assets (project_id, node_id, generation, kind, storage_key, mime, bytes)
      values ('20000000-0000-0000-0000-000000000002', 'x', 1, 'other', '10000000-0000-0000-0000-000000000001/future.png', 'image/png', 1);
    raise exception 'B squatted on A storage prefix';
  exception when check_violation then null; end;
  -- no self-made users, no email probing
  begin
    insert into users (id, email) values ('00000000-0000-0000-0000-0000000000cc', 'c@test');
    raise exception 'feista_app created a user';
  exception when insufficient_privilege then null; end;
  begin
    update users set email = 'a@test';
    raise exception 'feista_app updated an email';
  exception when insufficient_privilege then null; end;
  -- temp-table shadowing of projects is impossible
  begin
    execute 'create temp table projects(id uuid, owner_id uuid)';
    raise exception 'temp table allowed';
  exception when insufficient_privilege then null; end;
  -- bulk writes touch nothing of A's
  update projects set title = 'pwned' where id = '10000000-0000-0000-0000-000000000001';
  get diagnostics n = row_count; if n <> 0 then raise exception 'B updated A project'; end if;
  delete from credentials; get diagnostics n = row_count; if n <> 0 then raise exception 'B deleted A credentials'; end if;
  update ledger set reported_cents = 0; get diagnostics n = row_count; if n <> 0 then raise exception 'B updated A ledger'; end if;
  delete from stage_runs; get diagnostics n = row_count; if n <> 0 then raise exception 'B deleted A runs'; end if;
end $$;
commit;

-- no user set: nothing visible
do $$ begin
  if (select count(*) from projects) <> 0 then raise exception 'anonymous sees projects'; end if;
end $$;

-- A's data intact; ownership can't be moved; constraints hold
begin;
set local app.user_id = :A;
do $$ begin
  if (select title from projects) <> 'A film' then raise exception 'A project modified'; end if;
  if (select count(*) from credentials) <> 1 then raise exception 'A credential gone'; end if;
  if (select count(*) from stage_runs) <> 1 then raise exception 'A runs gone'; end if;
  if (select reported_cents from ledger) is not null then raise exception 'A ledger modified'; end if;
  begin
    update projects set owner_id = '00000000-0000-0000-0000-00000000000b';
    raise exception 'A moved project to B';
  exception when insufficient_privilege then null; end;
  begin
    update stage_runs set status = 'done';
    raise exception 'invalid status accepted';
  exception when check_violation then null; end;
  begin
    insert into ledger (project_id, estimated_cents) values ('10000000-0000-0000-0000-000000000001', -1);
    raise exception 'negative estimate accepted';
  exception when check_violation then null; end;
end $$;
commit;

-- RESET ROLE drops to feista_api, which can read nothing
reset role;
do $$ begin
  if current_user <> 'feista_api' then raise exception 'reset role escaped to %', current_user; end if;
  begin
    perform count(*) from credentials;
    raise exception 'feista_api can read credentials';
  exception when insufficient_privilege then null; end;
end $$;
reset session authorization;
\echo RLS_TESTS_PASSED
