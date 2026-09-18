-- Verification for the world-session lockdown. Run AFTER applying it.
-- Every block raises on failure, so a clean run means every claim below holds.
-- It creates a throwaway world, proves the boundaries, and removes it.

do $$
declare
  v_a        uuid;   -- world A
  v_b        uuid;   -- world B
  v_c        uuid;
  v_d        uuid;   -- C and D exist only to push a bulk delete past the cap
  v_char_a   uuid;
  v_tok_a    text := encode(extensions.gen_random_bytes(32), 'hex');
  n          integer;
begin
  -- Two worlds, a character in each.
  insert into public.game_worlds (name) values ('__verify_A_' || gen_random_uuid()) returning id into v_a;
  insert into public.game_worlds (name) values ('__verify_B_' || gen_random_uuid()) returning id into v_b;
  insert into public.game_worlds (name) values ('__verify_C_' || gen_random_uuid()) returning id into v_c;
  insert into public.game_worlds (name) values ('__verify_D_' || gen_random_uuid()) returning id into v_d;

  insert into public.characters (name, player_name, race, class, level, game_world_id)
  values ('Verify A', 'tester', 'Human', 'Fighter', 1, v_a) returning id into v_char_a;
  insert into public.characters (name, player_name, race, class, level, game_world_id)
  values ('Verify B', 'tester', 'Human', 'Fighter', 1, v_b);

  -- A player session for world A only.
  insert into public.dm_sessions (token_hash, game_world_id, role)
  values (extensions.digest(v_tok_a, 'sha256'), v_a, 'player');

  -- ---- as anon, holding world A's player token ----
  set local role anon;
  perform set_config('request.headers',
    json_build_object('x-dm-token', v_tok_a)::text, true);

  select count(*) into n from public.game_worlds;
  if n <> 1 then raise exception 'FAIL: a session sees % worlds, expected only its own', n; end if;

  select count(*) into n from public.characters;
  if n <> 1 then raise exception 'FAIL: a session sees % characters, expected only its world''s', n; end if;

  -- A player may edit their own world's sheet.
  update public.characters set current_hit_points = 5 where id = v_char_a;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: a player could not update a character in their own world'; end if;

  -- A player may NOT delete the world.
  delete from public.game_worlds where id = v_a;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a player deleted their own world (DM only)'; end if;

  -- Nobody may touch another world.
  delete from public.characters where game_world_id = v_b;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a session deleted a character in another world'; end if;

  -- ---- as anon with no token at all: the attacker's position ----
  perform set_config('request.headers', '{}', true);

  select count(*) into n from public.game_worlds;
  if n <> 0 then raise exception 'FAIL: a tokenless caller sees % worlds', n; end if;

  delete from public.game_worlds;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a tokenless caller deleted % worlds -- THE HOLE IS STILL OPEN', n; end if;

  delete from public.characters;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a tokenless caller deleted % characters', n; end if;

  begin
    insert into public.game_worlds (name) values ('__verify_injected_' || gen_random_uuid());
    raise exception 'FAIL: a tokenless caller inserted a world directly (world_create should be the only path)';
  exception when insufficient_privilege then
    null;  -- expected
  end;

  reset role;

  -- ---- the bulk-delete guard ----
  -- Four worlds against a cap of three: the statement must be refused whole.
  begin
    delete from public.game_worlds where name like '__verify\_%';
    raise exception 'FAIL: a bulk delete of 4 worlds got past the guard';
  exception when configuration_limit_exceeded then
    null;  -- expected
  end;

  -- The guard refused the statement, so all four must still be there.
  select count(*) into n from public.game_worlds where name like '__verify\_%';
  if n <> 4 then raise exception 'FAIL: the refused bulk delete still removed rows (% left of 4)', n; end if;

  -- Clean up within the cap, which is what a real deletion looks like.
  delete from public.characters where id = v_char_a;
  delete from public.characters where game_world_id = v_b;
  delete from public.dm_sessions where game_world_id in (v_a, v_b, v_c, v_d);
  delete from public.game_worlds where id = v_a;
  delete from public.game_worlds where id = v_b;
  delete from public.game_worlds where id = v_c;
  delete from public.game_worlds where id = v_d;

  raise notice 'PASS: every boundary held.';
end $$;
