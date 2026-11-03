-- Verification for 20261103105850_live_updates. Raises on any failure, and
-- rolls back everything it creates, including the broadcast messages.

do $$
declare
  v_a      uuid;
  v_b      uuid;
  v_char   uuid;
  v_play_a text := encode(extensions.gen_random_bytes(32), 'hex');
  v_dm_a   text := encode(extensions.gen_random_bytes(32), 'hex');
  v_play_b text := encode(extensions.gen_random_bytes(32), 'hex');
  v_topic  text;
  n        integer;
begin
  begin
    insert into public.game_worlds (name) values ('__live_A_' || gen_random_uuid()) returning id into v_a;
    insert into public.game_worlds (name) values ('__live_B_' || gen_random_uuid()) returning id into v_b;
    insert into public.game_world_secrets (game_world_id, dm_pin_hash, player_pin_hash)
    values (v_a, 'x', 'y'), (v_b, 'x', 'y');
    insert into public.dm_sessions (token_hash, game_world_id, role) values
      (extensions.digest(v_play_a, 'sha256'), v_a, 'player'),
      (extensions.digest(v_dm_a,   'sha256'), v_a, 'dm'),
      (extensions.digest(v_play_b, 'sha256'), v_b, 'player');

    -- ---- the topic is a session's to learn, and only its own world's ----
    set local role anon;
    perform set_config('request.headers', '{}', true);
    if public.world_realtime_topic() is not null then
      raise exception 'FAIL: a tokenless caller learned a realtime topic';
    end if;

    perform set_config('request.headers', json_build_object('x-dm-token', v_play_b)::text, true);
    v_topic := public.world_realtime_topic();

    perform set_config('request.headers', json_build_object('x-dm-token', v_play_a)::text, true);
    if public.world_realtime_topic() is null then
      raise exception 'FAIL: a player session got no realtime topic';
    end if;
    if public.world_realtime_topic() = v_topic then
      raise exception 'FAIL: two worlds share a realtime topic';
    end if;
    v_topic := public.world_realtime_topic();
    if v_topic !~ '^world:[0-9a-f]{32}$' then
      raise exception 'FAIL: topic % is not world:<128-bit key>', v_topic;
    end if;

    -- realtime.send turns a failed insert into a warning, so a missing day
    -- partition would read as "no signal" below. Say which it is.
    if not exists (select 1 from pg_inherits i join pg_class c on c.oid = i.inhrelid
                    where i.inhparent = 'realtime.messages'::regclass
                      and c.relname = 'messages_' || to_char(now(), 'YYYY_MM_DD')) then
      raise exception 'FAIL: no realtime.messages partition for today -- realtime has not run; connect a client and retry';
    end if;

    -- ---- a player creating a character: one signal, not forty ----
    insert into public.characters (name, player_name, race, class, game_world_id)
    values ('Live', 't', 'Human', 'Fighter', v_a) returning id into v_char;
    insert into public.skills (character_id, skill_name)
    select v_char, 'Skill ' || g from generate_series(1, 18) g;
    reset role;

    -- The topic belongs to this fixture world alone, so it needs no time filter.
    select count(*) into n from realtime.messages
     where topic = v_topic and payload ->> 'table' = 'skills';
    if n <> 1 then raise exception 'FAIL: 18 skills in one statement sent % signals, expected 1', n; end if;

    -- ---- an HP change: the case this exists for ----
    set local role anon;
    update public.characters set current_hit_points = 4 where id = v_char;
    reset role;

    select count(*) into n from realtime.messages
     where topic = v_topic and event = 'change' and private = false
       and payload ->> 'table' = 'characters' and payload ->> 'op' = 'UPDATE'
       and payload ->> 'character_id' = v_char::text;
    if n <> 1 then raise exception 'FAIL: an HP change sent % signals, expected exactly 1 naming the character', n; end if;

    -- the signal carries nothing but which character changed
    if exists (select 1 from realtime.messages where topic = v_topic
                 and (payload - 'id' - 'table' - 'character_id' - 'op') <> '{}'::jsonb) then
      raise exception 'FAIL: a signal carried character data';
    end if;

    -- ---- a DM deleting the character: one signal, from the character ----
    set local role anon;
    perform set_config('request.headers', json_build_object('x-dm-token', v_dm_a)::text, true);
    delete from public.characters where id = v_char;
    reset role;

    select count(*) into n from realtime.messages
     where topic = v_topic and payload ->> 'op' = 'DELETE';
    if n <> 1 then raise exception 'FAIL: deleting a character sent % signals, expected 1', n; end if;

    -- ---- nothing still relies on postgres_changes for these tables ----
    if exists (select 1 from pg_publication_tables
                where pubname = 'supabase_realtime' and tablename = 'characters') then
      raise exception 'FAIL: characters is still in the supabase_realtime publication';
    end if;

    raise exception 'VERIFY_PASS';
  exception when others then
    if sqlerrm <> 'VERIFY_PASS' then raise; end if;
  end;
end $$;
