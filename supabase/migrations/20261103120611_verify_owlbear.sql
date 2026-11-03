-- Verification for 20261103120607_owlbear. Raises on any failure, and rolls
-- back everything it creates, including the broadcast messages.

do $$
declare
  v_a      uuid;
  v_b      uuid;
  v_camp   uuid;
  v_mon    uuid;
  v_enc    uuid;
  v_row    uuid;
  v_play_a text := encode(extensions.gen_random_bytes(32), 'hex');
  v_dm_a   text := encode(extensions.gen_random_bytes(32), 'hex');
  v_dm_b   text := encode(extensions.gen_random_bytes(32), 'hex');
  v_topic  text;
  v_topic_b text;
  v_res    json;
  v_shared text;
  n        integer;
begin
  begin
    insert into public.game_worlds (name) values ('__obr_A_' || gen_random_uuid()) returning id into v_a;
    insert into public.game_worlds (name) values ('__obr_B_' || gen_random_uuid()) returning id into v_b;
    insert into public.game_world_secrets (game_world_id, dm_pin_hash, player_pin_hash)
    values (v_a, 'x', 'y'), (v_b, 'x', 'y');
    insert into public.dm_sessions (token_hash, game_world_id, role) values
      (extensions.digest(v_play_a, 'sha256'), v_a, 'player'),
      (extensions.digest(v_dm_a,   'sha256'), v_a, 'dm'),
      (extensions.digest(v_dm_b,   'sha256'), v_b, 'dm');
    select 'world:' || realtime_key into v_topic   from public.game_world_secrets where game_world_id = v_a;
    select 'world:' || realtime_key into v_topic_b from public.game_world_secrets where game_world_id = v_b;

    -- ---- only a DM may share a player session ----
    set local role anon;
    perform set_config('request.headers', '{}', true);
    v_res := public.world_share_player_session();
    if (v_res ->> 'ok')::boolean is not false or v_res ->> 'error' is distinct from 'not_dm' then
      raise exception 'FAIL: a tokenless caller was not refused a shared session: %', v_res;
    end if;

    perform set_config('request.headers', json_build_object('x-dm-token', v_play_a)::text, true);
    v_res := public.world_share_player_session();
    if (v_res ->> 'ok')::boolean is not false or v_res ->> 'error' is distinct from 'not_dm' then
      raise exception 'FAIL: a player token was not refused a shared session: %', v_res;
    end if;

    -- ---- a DM gets a player session for their own world, and only that ----
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);
    v_res := public.world_share_player_session();
    if (v_res ->> 'ok')::boolean is not true then
      raise exception 'FAIL: a DM was refused a shared session: %', v_res;
    end if;
    if v_res ->> 'role' is distinct from 'player' or (v_res ->> 'game_world_id')::uuid is distinct from v_a then
      raise exception 'FAIL: the shared session is not a player session for the DM''s world: %', v_res;
    end if;
    v_shared := v_res ->> 'dm_token';
    if v_shared is null or v_shared !~ '^[0-9a-f]{64}$' then
      raise exception 'FAIL: the shared token is not 256 random bits: %', v_shared;
    end if;

    perform set_config('request.headers', json_build_object('x-dm-token', v_shared)::text, true);
    if private.current_world() is distinct from v_a then
      raise exception 'FAIL: the shared token does not resolve to its world';
    end if;
    if private.current_dm_world() is not null then
      raise exception 'FAIL: the shared token carries DM rights';
    end if;
    -- and it cannot be used to mint more
    v_res := public.world_share_player_session();
    if (v_res ->> 'ok')::boolean is not false then
      raise exception 'FAIL: a shared player token minted another session: %', v_res;
    end if;
    reset role;

    if not exists (select 1 from public.dm_sessions
                    where token_hash = extensions.digest(v_shared, 'sha256')
                      and expires_at <= now() + interval '12 hours' + interval '1 minute') then
      raise exception 'FAIL: the shared session outlives twelve hours';
    end if;

    -- ---- the throttle ----
    set local role anon;
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);
    for n in 1..30 loop
      v_res := public.world_share_player_session();
      exit when (v_res ->> 'ok')::boolean is not true;
    end loop;
    if v_res ->> 'error' is distinct from 'rate_limited' then
      raise exception 'FAIL: 30 shares in a row were never throttled: %', v_res;
    end if;
    -- The throttle counts the world's own sessions, so another world is untouched.
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_b)::text, true);
    v_res := public.world_share_player_session();
    if (v_res ->> 'ok')::boolean is not true then
      raise exception 'FAIL: one world''s throttle refused another world: %', v_res;
    end if;
    reset role;

    -- realtime.send turns a failed insert into a warning, so a missing day
    -- partition would read as "no signal" below. Say which it is.
    if not exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
                    where i.inhparent = 'realtime.messages'::regclass
                      and c.relname = 'messages_' || to_char(now(), 'YYYY_MM_DD')) then
      raise exception 'FAIL: no realtime.messages partition for today -- realtime has not run; connect a client and retry';
    end if;

    -- ---- a DM builds an encounter: one signal per statement ----
    select id into v_camp from public.campaigns where game_world_id = v_a order by is_default desc limit 1;
    if v_camp is null then raise exception 'FAIL: the fixture world has no campaign'; end if;

    set local role anon;
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);
    insert into public.campaign_monsters (campaign_id, game_world_id, name, source, api_index)
    values (v_camp, v_a, 'Goblin', 'srd_api', 'goblin') returning id into v_mon;
    insert into public.encounters (campaign_id, game_world_id, name)
    values (v_camp, v_a, 'Ford') returning id into v_enc;
    insert into public.encounter_combatants
      (encounter_id, game_world_id, combatant_type, campaign_monster_id, display_name,
       max_hit_points, current_hit_points, sort_order)
    select v_enc, v_a, 'monster', v_mon, 'Goblin ' || g, 7, 7, g
      from generate_series(1, 10) g;
    reset role;

    select count(*) into n from realtime.messages
     where topic = v_topic and payload ->> 'table' = 'encounter_combatants';
    if n <> 1 then raise exception 'FAIL: 10 combatants in one statement sent % signals, expected 1', n; end if;

    select count(*) into n from realtime.messages
     where topic = v_topic and payload ->> 'table' = 'encounters' and payload ->> 'op' = 'INSERT'
       and payload ->> 'encounter_id' = v_enc::text;
    if n <> 1 then raise exception 'FAIL: creating an encounter sent % signals, expected 1', n; end if;

    -- ---- damage to one monster: the case this exists for ----
    select id into v_row from public.encounter_combatants where encounter_id = v_enc limit 1;
    set local role anon;
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);
    update public.encounter_combatants set current_hit_points = 3 where id = v_row;
    reset role;

    select count(*) into n from realtime.messages
     where topic = v_topic and event = 'change' and private = false
       and payload ->> 'table' = 'encounter_combatants' and payload ->> 'op' = 'UPDATE'
       and payload ->> 'encounter_id' = v_enc::text;
    if n <> 1 then raise exception 'FAIL: one HP change sent % signals, expected exactly 1 naming the encounter', n; end if;

    -- ---- the HP toggle is a change to the encounter ----
    set local role anon;
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);
    update public.encounters set hide_monster_hp = not hide_monster_hp where id = v_enc;
    reset role;

    select count(*) into n from realtime.messages
     where topic = v_topic and payload ->> 'table' = 'encounters' and payload ->> 'op' = 'UPDATE';
    if n <> 1 then raise exception 'FAIL: toggling monster HP sent % signals, expected 1', n; end if;

    -- ---- signals stay in their world, and carry nothing but the id ----
    if exists (select 1 from realtime.messages where topic = v_topic_b) then
      raise exception 'FAIL: world A''s encounter signalled world B''s topic';
    end if;
    if exists (select 1 from realtime.messages where topic = v_topic
                 and (payload - 'id' - 'table' - 'encounter_id' - 'op') <> '{}'::jsonb) then
      raise exception 'FAIL: an encounter signal carried encounter data';
    end if;

    -- ---- a deleted encounter still says so ----
    set local role anon;
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);
    delete from public.encounters where id = v_enc;
    reset role;

    select count(*) into n from realtime.messages
     where topic = v_topic and payload ->> 'table' = 'encounters' and payload ->> 'op' = 'DELETE'
       and payload ->> 'encounter_id' = v_enc::text;
    if n <> 1 then raise exception 'FAIL: deleting an encounter sent % signals, expected 1', n; end if;

    raise exception 'VERIFY_PASS';
  exception when others then
    if sqlerrm <> 'VERIFY_PASS' then raise; end if;
  end;
end $$;
