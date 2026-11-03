-- Verification for 20261103102913_security_hardening. Every check raises on
-- failure. The whole run sits in a block that ends by raising VERIFY_PASS,
-- which rolls back everything it created -- worlds, sessions, attempts and the
-- write budget it spent -- so it can be re-run against production at any time.

do $$
declare
  v_admin   uuid := (select user_id from private.admins limit 1);
  v_a       uuid;
  v_b       uuid;
  v_char_a  uuid;
  v_char_b  uuid;
  v_enc     uuid;
  v_play_a  text := encode(extensions.gen_random_bytes(32), 'hex');
  v_dm_a    text := encode(extensions.gen_random_bytes(32), 'hex');
  v_name_a  text := '__harden_A_' || substr(gen_random_uuid()::text, 1, 8);
  v_res     json;
  n         integer;
  i         integer;
begin
  begin
    if v_admin is null then raise exception 'FAIL: private.admins is empty'; end if;

    -- ---- fixtures, as the owner ------------------------------------------
    insert into public.game_worlds (name) values (v_name_a) returning id into v_a;
    insert into public.game_worlds (name) values ('__harden_B_' || gen_random_uuid()) returning id into v_b;
    insert into public.game_world_secrets (game_world_id, dm_pin_hash, player_pin_hash)
    values (v_a, encode(extensions.digest('1379', 'sha256'), 'hex'),
                 encode(extensions.digest('2468', 'sha256'), 'hex'));
    insert into public.characters (name, player_name, race, class, game_world_id)
    values ('Harden A', 't', 'Human', 'Fighter', v_a) returning id into v_char_a;
    insert into public.characters (name, player_name, race, class, game_world_id)
    values ('Harden B', 't', 'Human', 'Fighter', v_b) returning id into v_char_b;
    insert into public.encounters (campaign_id, game_world_id, name, status)
    select c.id, v_b, 'Harden fight', 'active' from public.campaigns c where c.game_world_id = v_b
    returning id into v_enc;
    insert into public.npcs (campaign_id, game_world_id, name, is_known_to_players)
    select c.id, v_b, 'Harden NPC', true from public.campaigns c where c.game_world_id = v_b;
    insert into public.dm_sessions (token_hash, game_world_id, role) values
      (extensions.digest(v_play_a, 'sha256'), v_a, 'player'),
      (extensions.digest(v_dm_a,   'sha256'), v_a, 'dm');

    -- ---- 1. no token: where the 2026-09-18 attacker stood -----------------
    set local role anon;
    perform set_config('request.headers', '{}', true);
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);

    select count(*) into n from public.game_worlds;        if n <> 0 then raise exception 'FAIL: tokenless sees % worlds', n; end if;
    select count(*) into n from public.characters;         if n <> 0 then raise exception 'FAIL: tokenless sees % characters', n; end if;
    select count(*) into n from public.campaigns;          if n <> 0 then raise exception 'FAIL: tokenless sees % campaigns', n; end if;
    select count(*) into n from public.npcs;               if n <> 0 then raise exception 'FAIL: tokenless sees % known NPCs', n; end if;
    select count(*) into n from public.encounters;         if n <> 0 then raise exception 'FAIL: tokenless sees % active encounters', n; end if;
    select count(*) into n from public.campaign_characters; if n <> 0 then raise exception 'FAIL: tokenless sees % memberships', n; end if;
    select count(*) into n from public.feedback;           if n <> 0 then raise exception 'FAIL: tokenless reads feedback'; end if;

    begin
      delete from public.game_worlds;
      raise exception 'FAIL: tokenless DELETE on game_worlds was not refused';
    exception when insufficient_privilege then null;
    end;

    -- ---- 2. any signed-in user who is not an admin: the anonymous sign-in path
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', gen_random_uuid(), 'role', 'authenticated', 'is_anonymous', true)::text, true);
    set local role authenticated;

    select count(*) into n from public.game_worlds;  if n <> 0 then raise exception 'FAIL: a non-admin user sees % worlds', n; end if;
    select count(*) into n from public.characters;   if n <> 0 then raise exception 'FAIL: a non-admin user sees % characters', n; end if;
    select count(*) into n from public.inventory_items; if n <> 0 then raise exception 'FAIL: a non-admin user sees % items', n; end if;
    select count(*) into n from public.feedback;     if n <> 0 then raise exception 'FAIL: a non-admin user reads feedback'; end if;
    begin
      perform public.analytics_overview();
      raise exception 'FAIL: a non-admin user ran analytics_overview';
    exception when insufficient_privilege then null;
    end;

    -- ---- 3. the admin keeps analytics ----------------------------------------
    reset role;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    set local role authenticated;

    select count(*) into n from public.game_worlds;
    if n < 2 then raise exception 'FAIL: the admin sees only % worlds', n; end if;
    perform public.analytics_overview();

    -- ---- 4. a player of world A ----------------------------------------------
    reset role;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.headers', json_build_object('x-dm-token', v_play_a)::text, true);
    set local role anon;

    select count(*) into n from public.characters;
    if n <> 1 then raise exception 'FAIL: player A sees % characters, expected 1', n; end if;
    select count(*) into n from public.campaigns;
    if n <> 1 then raise exception 'FAIL: player A sees % campaigns, expected their own 1', n; end if;

    update public.characters set current_hit_points = 7 where id = v_char_a;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: player A could not edit their own character'; end if;

    insert into public.inventory_items (character_id, name) values (v_char_a, 'Rope');
    delete from public.inventory_items where character_id = v_char_a;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: player A could not remove an item from a sheet'; end if;

    delete from public.characters where id = v_char_a;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: a player deleted a character (DM only)'; end if;

    begin
      insert into public.characters (name, player_name, race, class, game_world_id)
      values ('Intruder', 't', 'Human', 'Fighter', v_b);
      raise exception 'FAIL: player A created a character in world B';
    exception when insufficient_privilege then null;
    end;

    begin
      insert into public.inventory_items (character_id, name) values (v_char_b, 'Planted');
      raise exception 'FAIL: player A wrote to a character in world B';
    exception when insufficient_privilege then null;
    end;

    update public.game_worlds set leveling_mode = 'exp' where id = v_a;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: a player changed world settings'; end if;

    -- row size cap
    begin
      update public.characters set notes = repeat('x', 40000) where id = v_char_a;
      raise exception 'FAIL: a 40 KB character row was accepted';
    exception when program_limit_exceeded then null;
    end;

    -- row count cap, including inside one bulk statement
    begin
      insert into public.skills (character_id, skill_name)
      select v_char_a, 'Junk ' || g from generate_series(1, 41) g;
      raise exception 'FAIL: 41 skills on one character were accepted';
    exception when configuration_limit_exceeded then null;
    end;
    select count(*) into n from public.skills where character_id = v_char_a;
    if n <> 0 then raise exception 'FAIL: the refused bulk insert left % rows behind', n; end if;

    -- per-world hourly byte budget: ~1.2 MB in 7 KB items
    begin
      insert into public.inventory_items (character_id, name, description)
      select v_char_a, 'Junk ' || g, repeat('y', 7000) from generate_series(1, 170) g;
      raise exception 'FAIL: 1.2 MB in one hour from one world was accepted';
    exception when configuration_limit_exceeded then null;
    end;

    -- an HP change costs no budget, so play survives a refused flood
    update public.characters set current_hit_points = 3 where id = v_char_a;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: an HP change was refused'; end if;

    -- ---- 5. the DM of world A -----------------------------------------------
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);

    update public.game_worlds set leveling_mode = 'exp' where id = v_a;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: the DM could not change the levelling mode'; end if;

    begin
      update public.game_worlds set name = 'Renamed' where id = v_a;
      raise exception 'FAIL: the DM renamed the world through the API';
    exception when insufficient_privilege then null;
    end;

    begin
      delete from public.game_worlds where id = v_a;
      raise exception 'FAIL: the DM deleted the world through the API';
    exception when insufficient_privilege then null;
    end;

    delete from public.characters where id = v_char_b;
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FAIL: DM A deleted a character in world B'; end if;

    delete from public.characters where id = v_char_a;
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'FAIL: the DM could not delete their own character'; end if;

    reset role;

    -- ---- 6. world_create site-wide limits ---------------------------------------
    if (public.world_create('__harden_desc', repeat('d', 501), 'milestone', '1111', '2222') ->> 'error')
       is distinct from 'bad_description' then
      raise exception 'FAIL: a 501 character description was accepted';
    end if;

    -- ten creations this hour from ten different "addresses"
    insert into public.world_create_attempts (ip)
    select '10.0.0.' || g from generate_series(1, 10) g;
    perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.77"}', true);
    v_res := public.world_create('__harden_flood', null, 'milestone', '1111', '2222');
    if (v_res ->> 'error') is distinct from 'rate_limited' then
      raise exception 'FAIL: a fresh x-forwarded-for got past the site-wide hourly limit: %', v_res;
    end if;

    -- ---- 7. world_login --------------------------------------------------------
    perform set_config('request.headers', '{}', true);
    if (public.world_login(repeat('n', 5000), '1234') ->> 'error') <> 'not_found' then
      raise exception 'FAIL: an oversized world name was not refused';
    end if;
    if exists (select 1 from public.pin_attempts where length(game_world_name) > 50) then
      raise exception 'FAIL: an oversized world name was stored';
    end if;

    for i in 1..105 loop
      perform public.world_login(v_name_a, '2468');
    end loop;
    select count(*) into n from public.dm_sessions where game_world_id = v_a;
    if n > 100 then raise exception 'FAIL: % live sessions for one world, cap is 100', n; end if;

    insert into public.pin_attempts (game_world_name, ip)
    select v_name_a, '198.51.100.' || g from generate_series(1, 30) g;
    if (public.world_login(v_name_a, '1379') ->> 'error') <> 'rate_limited' then
      raise exception 'FAIL: 30 failures in an hour from 30 addresses did not lock the world';
    end if;

    -- ---- 8. feedback site-wide ceiling -------------------------------------------
    -- Thirty reports twenty minutes ago fill the hour without touching any
    -- world's ten-minute limit, so the next one isolates the site-wide check.
    begin
      insert into public.feedback (kind, message, created_at)
      select 'bug', 'harden ' || g, now() - interval '20 minutes' from generate_series(1, 30) g;
      insert into public.feedback (kind, message, game_world_id) values ('bug', 'one more', v_a);
      raise exception 'FAIL: a 31st feedback report in one hour was accepted';
    exception when configuration_limit_exceeded then null;
    end;

    -- ---- 9. no TRUNCATE for the API roles ----------------------------------------
    if has_table_privilege('anon', 'public.characters', 'TRUNCATE')
       or has_table_privilege('authenticated', 'public.game_worlds', 'TRUNCATE') then
      raise exception 'FAIL: an API role still holds TRUNCATE';
    end if;

    raise exception 'VERIFY_PASS';
  exception when others then
    if sqlerrm = 'VERIFY_PASS' then
      raise notice 'PASS: every boundary held; all fixtures rolled back.';
    else
      raise;
    end if;
  end;
end $$;
