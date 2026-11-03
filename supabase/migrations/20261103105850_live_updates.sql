-- Live updates for character sheets, through broadcast rather than
-- postgres_changes. See docs/campaigns-schema-design.md 11.3a21.
--
-- postgres_changes checks each change against the subscriber's row level
-- policies, and every character policy is scoped by the x-dm-token request
-- header. A realtime socket carries no request headers, so current_world() is
-- null there and nobody was told about anything -- HP stopped updating live on
-- 2026-09-19, the day the policies were scoped.
--
-- Instead, a statement trigger on each character table broadcasts a bare
-- signal -- which character changed, nothing else -- to a topic named by a
-- random per-world key. Only a session for that world can learn the key, and
-- the client answers a signal by re-reading through the normal API, where the
-- policies apply as always. A public channel also accepts broadcasts from
-- clients, so anyone holding the key could forge a signal; since a signal
-- carries no data, the most a forgery can do is cause a re-read.

alter table public.game_world_secrets
  add column if not exists realtime_key text not null
  default encode(extensions.gen_random_bytes(16), 'hex');

create or replace function public.world_realtime_topic()
returns text
language sql stable security definer
set search_path = public, pg_temp
as $$
  select 'world:' || s.realtime_key
    from public.game_world_secrets s
   where s.game_world_id = private.current_world()
$$;
revoke all on function public.world_realtime_topic() from public;
grant execute on function public.world_realtime_topic() to anon, authenticated;

-- One message per character per statement, not per row: creating a character
-- writes some forty rows, and a long rest touches every feature and slot.
--   TG_ARGV[0]  the column holding the character id: id or character_id
create or replace function private.signal_character_change()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_col  text := TG_ARGV[0];
  v_ids  uuid[];
  r      record;
begin
  -- Transition tables are read only through EXECUTE: the one function serves
  -- twelve tables, and a cached plan must never outlive the table it was made for.

  -- A deleted character is already gone from public.characters, so its world
  -- comes from the deleted row itself. Its cascaded rows find no character
  -- and send nothing, which is right: this one message covers them.
  if TG_OP = 'DELETE' and TG_TABLE_NAME = 'characters' then
    for r in execute
      'select distinct o.id, s.realtime_key from old_rows o
         join public.game_world_secrets s on s.game_world_id = o.game_world_id'
    loop
      perform realtime.send(
        jsonb_build_object('table', TG_TABLE_NAME, 'character_id', r.id, 'op', TG_OP),
        'change', 'world:' || r.realtime_key, false);
    end loop;
    return null;
  end if;

  if TG_OP = 'INSERT' then
    execute format('select array_agg(distinct %I) from new_rows', v_col) into v_ids;
  elsif TG_OP = 'DELETE' then
    execute format('select array_agg(distinct %I) from old_rows', v_col) into v_ids;
  else
    execute format(
      'select array_agg(distinct x) from (select %1$I x from new_rows union select %1$I from old_rows) u',
      v_col) into v_ids;
  end if;

  if v_ids is null then
    return null;
  end if;

  for r in
    select distinct x.id, s.realtime_key
      from unnest(v_ids) as x(id)
      join public.characters c on c.id = x.id
      join public.game_world_secrets s on s.game_world_id = c.game_world_id
  loop
    perform realtime.send(
      jsonb_build_object('table', TG_TABLE_NAME, 'character_id', r.id, 'op', TG_OP),
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
  foreach t in array array[
    'characters',
    'ability_scores', 'character_details', 'character_effects', 'currency',
    'features_traits', 'inventory_items', 'saving_throws', 'skills',
    'spell_slots', 'spells', 'weapons'
  ] loop
    col := case when t = 'characters' then 'id' else 'character_id' end;

    -- A trigger with transition tables may name only one event.
    execute format('drop trigger if exists signal_insert on public.%I', t);
    execute format('drop trigger if exists signal_update on public.%I', t);
    execute format('drop trigger if exists signal_delete on public.%I', t);
    execute format(
      'create trigger signal_insert after insert on public.%I referencing new table as new_rows '
      'for each statement execute function private.signal_character_change(%L)', t, col);
    execute format(
      'create trigger signal_update after update on public.%I referencing old table as old_rows new table as new_rows '
      'for each statement execute function private.signal_character_change(%L)', t, col);
    execute format(
      'create trigger signal_delete after delete on public.%I referencing old table as old_rows '
      'for each statement execute function private.signal_character_change(%L)', t, col);
  end loop;
end $$;

-- postgres_changes on these tables can never deliver anything now, and every
-- change still costs the realtime server a policy check per subscriber.
do $$
declare t text;
begin
  for t in
    select tablename from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
  loop
    execute format('alter publication supabase_realtime drop table public.%I', t);
  end loop;
end $$;
