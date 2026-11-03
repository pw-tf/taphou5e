-- Recorded from the project's migration history on 2026-11-03; applied 2026-09-20.

-- The lockdown's verification proved the RLS boundaries but never exercised
-- world_login end to end. Since then nobody has logged in, which is either a
-- quiet weekend or a broken login -- and those look identical from outside.
-- This walks the whole loop on a throwaway world and removes it.
--
-- Raises on any failure, so a successful apply is the evidence.

do $$
declare
  v_name    text := '__loginverify_' || substr(gen_random_uuid()::text, 1, 8);
  v_created json;
  v_dm      json;
  v_player  json;
  v_id      uuid;
  n         integer;
begin
  -- 1. Creating a world still works, and hands back a DM session.
  v_created := public.world_create(v_name, 'verification', 'milestone', '1379', '2468');
  if (v_created ->> 'ok')::boolean is not true then
    raise exception 'FAIL: world_create refused: %', v_created ->> 'error';
  end if;
  v_id := (v_created ->> 'game_world_id')::uuid;
  if coalesce(v_created ->> 'dm_token', '') = '' then
    raise exception 'FAIL: world_create returned no token';
  end if;

  -- 2. A DM can log in, and gets a dm-role session.
  v_dm := public.world_login(v_name, '1379');
  if (v_dm ->> 'ok')::boolean is not true then
    raise exception 'FAIL: DM login refused: %', v_dm ->> 'error';
  end if;
  if v_dm ->> 'role' <> 'dm' then raise exception 'FAIL: DM got role %', v_dm ->> 'role'; end if;
  if coalesce(v_dm ->> 'dm_token', '') = '' then
    raise exception 'FAIL: DM login returned no token';
  end if;

  -- 3. A PLAYER can log in, and now gets a token too. This is the new part --
  --    before the lockdown they were handed null, and with the tables scoped
  --    to a session that would mean seeing nothing at all.
  v_player := public.world_login(v_name, '2468');
  if (v_player ->> 'ok')::boolean is not true then
    raise exception 'FAIL: player login refused: %', v_player ->> 'error';
  end if;
  if v_player ->> 'role' <> 'player' then
    raise exception 'FAIL: player got role %', v_player ->> 'role';
  end if;
  if coalesce(v_player ->> 'dm_token', '') = '' then
    raise exception 'FAIL: player login returned no token -- they would see an empty world';
  end if;
  if (v_player ->> 'dm_token') = (v_dm ->> 'dm_token') then
    raise exception 'FAIL: player and DM were issued the same token';
  end if;

  -- 4. A wrong PIN is still refused.
  if (public.world_login(v_name, '0000') ->> 'error') <> 'bad_pin' then
    raise exception 'FAIL: a wrong PIN was not refused';
  end if;

  -- 5. The token actually works: as anon, holding the player token, the world
  --    is visible. This is the whole point -- a token that resolves to nothing
  --    would leave real users staring at an empty app.
  set local role anon;
  perform set_config('request.headers',
    json_build_object('x-dm-token', v_player ->> 'dm_token')::text, true);

  select count(*) into n from public.game_worlds where id = v_id;
  if n <> 1 then
    raise exception 'FAIL: a freshly issued player token cannot see its own world';
  end if;

  select count(*) into n from public.game_worlds;
  if n <> 1 then
    raise exception 'FAIL: the session sees % worlds, expected only its own', n;
  end if;

  -- A player still may not delete the world.
  delete from public.game_worlds where id = v_id;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL: a player deleted a world'; end if;

  -- 6. The DM token can update its own world, which is how the DM panel works.
  perform set_config('request.headers',
    json_build_object('x-dm-token', v_dm ->> 'dm_token')::text, true);
  update public.game_worlds set leveling_mode = 'exp' where id = v_id;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FAIL: a DM could not update their own world'; end if;

  reset role;

  -- Clean up: the world, its secrets, sessions and default campaign cascade.
  delete from public.game_worlds where id = v_id;
  delete from public.pin_attempts where game_world_name = v_name;
  delete from public.world_create_attempts
   where attempted_at > now() - interval '5 minutes' and ip is null;

  if exists (select 1 from public.game_worlds where name = v_name) then
    raise exception 'FAIL: the verification world was left behind';
  end if;

  raise notice 'PASS: create, DM login, player login, bad PIN, token scoping and DM update all work.';
end $$;
