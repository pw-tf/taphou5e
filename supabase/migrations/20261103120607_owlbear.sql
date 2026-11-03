-- The Owlbear Rodeo extension. See docs/campaigns-schema-design.md 11.3a23.
--
-- Two things the extension needs from the database:
--
-- 1. Encounter signals. Live updates cover the character tables only, so a
--    monster damaged on the map, or in the tracker on another device, reached
--    nobody until they reloaded. The same bare signal as
--    signal_character_change now goes out for encounters and their
--    combatants: which encounter changed, nothing else, to the same per-world
--    topic. A player can learn that some encounter id changed and no more;
--    reading it is still up to the policies.
--
-- 2. A player session minted by a DM. The GM's Owlbear client shares one
--    player session with the room, so players at the table never type a PIN.
--    Without this the GM would have to type both PINs. The result is an
--    ordinary player session: twelve hours, counted against the world's 100.

create or replace function private.signal_encounter_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_col text := TG_ARGV[0];
  v_src text;
  r     record;
begin
  -- Both tables carry game_world_id, so the world comes from the row itself,
  -- deleted rows included. Transition tables are read only through EXECUTE,
  -- for the reason given in signal_character_change.
  v_src := case TG_OP
    when 'INSERT' then 'select %1$I x, game_world_id w from new_rows'
    when 'DELETE' then 'select %1$I x, game_world_id w from old_rows'
    else 'select %1$I x, game_world_id w from new_rows union select %1$I, game_world_id from old_rows'
  end;

  -- One message per encounter per statement: a recipe import inserts a whole
  -- encounter's combatants at once.
  for r in execute format(
      'select distinct u.x, s.realtime_key from (' || v_src || ') u
         join public.game_world_secrets s on s.game_world_id = u.w', v_col)
  loop
    perform realtime.send(
      jsonb_build_object('table', TG_TABLE_NAME, 'encounter_id', r.x, 'op', TG_OP),
      'change', 'world:' || r.realtime_key, false);
  end loop;

  return null;
end;
$$;

do $$
declare
  t   text;
  col text;
begin
  foreach t in array array['encounters', 'encounter_combatants'] loop
    col := case when t = 'encounters' then 'id' else 'encounter_id' end;

    execute format('drop trigger if exists signal_insert on public.%I', t);
    execute format('drop trigger if exists signal_update on public.%I', t);
    execute format('drop trigger if exists signal_delete on public.%I', t);
    execute format(
      'create trigger signal_insert after insert on public.%I referencing new table as new_rows '
      'for each statement execute function private.signal_encounter_change(%L)', t, col);
    execute format(
      'create trigger signal_update after update on public.%I referencing old table as old_rows new table as new_rows '
      'for each statement execute function private.signal_encounter_change(%L)', t, col);
    execute format(
      'create trigger signal_delete after delete on public.%I referencing old table as old_rows '
      'for each statement execute function private.signal_encounter_change(%L)', t, col);
  end loop;
end $$;

create or replace function public.world_share_player_session()
returns json
language plpgsql security definer
set search_path = public, extensions
as $function$
declare
  v_world public.game_worlds%rowtype;
  v_token text;
begin
  select * into v_world from public.game_worlds
   where id = private.current_dm_world() and is_active;
  if not found then
    return json_build_object('ok', false, 'error', 'not_dm');
  end if;

  -- The client asks once per twelve hours. A loop would only churn the
  -- world's own sessions, since the cap below logs out the oldest, but there
  -- is no reason to let it.
  if (select count(*) from public.dm_sessions
       where game_world_id = v_world.id
         and created_at > now() - interval '10 minutes') >= 20 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.dm_sessions (token_hash, game_world_id, role)
  values (extensions.digest(v_token, 'sha256'), v_world.id, 'player');
  delete from public.dm_sessions where expires_at < now();

  -- The same 100-session ceiling world_login keeps.
  delete from public.dm_sessions s
   where s.game_world_id = v_world.id
     and s.token_hash not in (
       select k.token_hash from public.dm_sessions k
        where k.game_world_id = v_world.id
        order by k.created_at desc
        limit 100);

  return json_build_object(
    'ok',              true,
    'role',            'player',
    'game_world_id',   v_world.id,
    'game_world_name', v_world.name,
    'dm_token',        v_token
  );
end $function$;
revoke all on function public.world_share_player_session() from public;
grant execute on function public.world_share_player_session() to anon, authenticated;
