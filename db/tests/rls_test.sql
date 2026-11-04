-- Run after migrations, as a superuser. Fails (ON_ERROR_STOP) on any broken isolation rule.
\set ON_ERROR_STOP on
insert into users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'a@test'),
  ('00000000-0000-0000-0000-00000000000b', 'b@test');

set role feista_app;

begin;
set local app.user_id = '00000000-0000-0000-0000-00000000000a';
insert into projects (id, owner_id, kind, title, scene_count, budget_limit_cents, approval_threshold_cents, warn_fraction)
  values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'story', 'A film', 5, 3000, 1500, 0.8);
insert into stage_runs (project_id, node_id, status, max_attempts, max_lease_losses)
  values ('10000000-0000-0000-0000-000000000001', 'scene_video:0', 'queued', 2, 2);
insert into credentials (owner_id, provider, ciphertext, wrapped_key, key_version, last4)
  values ('00000000-0000-0000-0000-00000000000a', 'fal', '\x01', '\x02', 1, 'abcd');
insert into ledger (project_id, estimated_cents) values ('10000000-0000-0000-0000-000000000001', 120);
commit;

-- B sees none of A's data
begin;
set local app.user_id = '00000000-0000-0000-0000-00000000000b';
do $$ begin
  if (select count(*) from projects) <> 0 then raise exception 'B sees A projects'; end if;
  if (select count(*) from stage_runs) <> 0 then raise exception 'B sees A runs'; end if;
  if (select count(*) from credentials) <> 0 then raise exception 'B sees A credentials'; end if;
  if (select count(*) from ledger) <> 0 then raise exception 'B sees A ledger'; end if;
  if (select count(*) from users) <> 1 then raise exception 'B sees other users'; end if;
end $$;
-- B cannot write into A's project or impersonate A
do $$ begin
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
  update projects set title = 'pwned';
  delete from credentials;
end $$;
commit;

-- no user set: nothing visible
do $$ begin
  if (select count(*) from projects) <> 0 then raise exception 'anonymous sees projects'; end if;
end $$;

-- A's data is intact and constraints hold
begin;
set local app.user_id = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  if (select title from projects) <> 'A film' then raise exception 'A project modified by B'; end if;
  if (select count(*) from credentials) <> 1 then raise exception 'A credential deleted by B'; end if;
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
reset role;
\echo RLS_TESTS_PASSED
