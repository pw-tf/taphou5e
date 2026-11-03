-- Security hardening after the 2026-09-18 incident. See
-- docs/campaigns-schema-design.md 11.3a19 and 11.3a20.
--
-- The 2026-09-19 lockdown closed the thirteen open policies. A review of what
-- it left found five more ways in:
--
--   1. Anonymous sign-in was enabled, and every *_owner_read policy accepted
--      any auth.uid(). One signInAnonymously() call read every world, every
--      character, and read-and-deleted the whole feedback inbox.
--   2. A DM token could DELETE its own world, cascading to everything in it.
--   3. Nothing bounded what a world could write. world_create hands anyone a
--      DM token, so "create a world, then insert a million rows" was open.
--   4. The campaign player_read policies were not scoped to a world: with no
--      token at all, every world's campaigns, revealed chapters, known NPCs
--      and active encounters were readable.
--   5. world_create and world_login throttled only on x-forwarded-for, which
--      the caller can set, so a rotating header defeated both.
--
-- Rate limits below therefore never rely on the caller's address alone. Every
-- per-address limit is backed by one the caller cannot vary.

-- ============================================================================
-- 1. Admins are a named list, not "anyone signed in"
-- ============================================================================

create table if not exists private.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
revoke all on private.admins from public, anon, authenticated;

insert into private.admins (user_id)
select id from auth.users
 where email = 'brett.perry@live.com.au' and not is_anonymous
on conflict do nothing;

create or replace function private.is_admin()
returns boolean
language sql stable security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from private.admins a where a.user_id = auth.uid())
$$;
-- Evaluated as the calling role inside policies, so both API roles need it.
revoke all on function private.is_admin() from public;
grant execute on function private.is_admin() to anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'game_worlds', 'characters',
    'ability_scores', 'character_details', 'character_effects', 'currency',
    'features_traits', 'inventory_items', 'saving_throws', 'skills',
    'spell_slots', 'spells', 'weapons'
  ] loop
    execute format('drop policy if exists %I_owner_read on public.%I', t, t);
    execute format('drop policy if exists %I_admin_read on public.%I', t, t);
    execute format(
      'create policy %I_admin_read on public.%I for select to authenticated using ((select private.is_admin()))',
      t, t);
  end loop;
end $$;

drop policy if exists feedback_review on public.feedback;
drop policy if exists feedback_admin on public.feedback;
create policy feedback_admin on public.feedback
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- analytics_overview re-checked auth.uid() is not null. Swap that one gate in
-- place rather than restating the 160-line body, and refuse if it has moved.
do $$
declare d text := pg_get_functiondef('public.analytics_overview()'::regprocedure);
begin
  if position('if auth.uid() is null then' in d) = 0 then
    raise exception 'analytics_overview gate not found -- update it by hand';
  end if;
  d := replace(d, 'if auth.uid() is null then', 'if not private.is_admin() then');
  d := replace(d, 'requires an authenticated session', 'requires an admin session');
  execute d;
end $$;

-- ============================================================================
-- 2. Worlds cannot be deleted through the API, and only two fields can change
-- ============================================================================
-- No client deletes a world. A DM PIN is four digits, so "DM only" was one
-- brute force away from cascading a world's whole history away.

drop policy if exists game_worlds_dm_delete on public.game_worlds;
revoke insert, update, delete on public.game_worlds from anon, authenticated;
grant update (leveling_mode, description) on public.game_worlds to anon, authenticated;

alter table public.game_worlds drop constraint if exists game_worlds_leveling_mode_check;
alter table public.game_worlds
  add constraint game_worlds_leveling_mode_check check (leveling_mode in ('milestone', 'exp'));

-- ============================================================================
-- 3. Only a DM deletes a character
-- ============================================================================
-- Players keep read, create and edit. Their sheet's own rows (items, spells,
-- features) stay player-deletable, because editing a sheet needs it.

drop policy if exists characters_session_all on public.characters;
drop policy if exists characters_session_read on public.characters;
drop policy if exists characters_session_insert on public.characters;
drop policy if exists characters_session_update on public.characters;
drop policy if exists characters_dm_delete on public.characters;

create policy characters_session_read on public.characters
  for select to anon, authenticated
  using (game_world_id = (select private.current_world()));

create policy characters_session_insert on public.characters
  for insert to anon, authenticated
  with check (game_world_id = (select private.current_world()));

create policy characters_session_update on public.characters
  for update to anon, authenticated
  using (game_world_id = (select private.current_world()))
  with check (game_world_id = (select private.current_world()));

create policy characters_dm_delete on public.characters
  for delete to anon, authenticated
  using (game_world_id = (select private.current_dm_world()));

-- ============================================================================
-- 4. Players read revealed campaign rows of their own world only
-- ============================================================================
-- Each policy keeps its reveal predicate exactly as it stands and gains the
-- world clause in front, so nothing about what a player sees changes inside
-- their world.

do $$
declare p record;
begin
  for p in
    select tablename, qual from pg_policies
     where schemaname = 'public' and policyname = 'player_read'
       and qual not like '%current_world()%'
  loop
    execute format(
      'alter policy player_read on public.%I using ((game_world_id = (select private.current_world())) and (%s))',
      p.tablename, p.qual);
  end loop;
end $$;

-- ============================================================================
-- 5. Bounded writes
-- ============================================================================
-- Three limits, applied by one trigger on every table a session can write:
--   - a row size cap, so no single field can carry megabytes;
--   - a row count cap per world or per character, so a list stays a list;
--   - a byte budget per world per hour, plus a site-wide hourly and daily
--     budget, charged only for growth -- an HP change costs nothing, so play
--     continues even while a flood is being refused.
-- The site-wide budget is the one an attacker cannot route around by making
-- more worlds.

create table if not exists private.write_budget (
  bucket       text        not null,   -- a world id, or 'site-hour' / 'site-day'
  window_start timestamptz not null,
  bytes        bigint      not null default 0,
  primary key (bucket, window_start)
);
revoke all on private.write_budget from public, anon, authenticated;

create or replace function private.charge_write(p_world uuid, p_bytes integer)
returns void
language plpgsql security definer
set search_path = public, pg_temp
as $$
declare
  v_world bigint;
  v_hour  bigint;
  v_day   bigint;
begin
  if p_bytes is null or p_bytes <= 0 then
    return;
  end if;

  insert into private.write_budget as b (bucket, window_start, bytes)
  values (p_world::text, date_trunc('hour', now()), p_bytes)
  on conflict (bucket, window_start) do update set bytes = b.bytes + excluded.bytes
  returning b.bytes into v_world;

  insert into private.write_budget as b (bucket, window_start, bytes)
  values ('site-hour', date_trunc('hour', now()), p_bytes)
  on conflict (bucket, window_start) do update set bytes = b.bytes + excluded.bytes
  returning b.bytes into v_hour;

  insert into private.write_budget as b (bucket, window_start, bytes)
  values ('site-day', date_trunc('day', now()), p_bytes)
  on conflict (bucket, window_start) do update set bytes = b.bytes + excluded.bytes
  returning b.bytes into v_day;

  -- The whole database was 19 MB when these were set; a busy day of real use
  -- writes well under 1 MB.
  if v_world > 1048576 then
    raise exception 'This world has saved a lot in the last hour. Please try again later.'
      using errcode = '53400';
  end if;
  if v_hour > 4194304 or v_day > 16777216 then
    raise exception 'The site is refusing new data for a while. Please try again later.'
      using errcode = '53400';
  end if;

  if random() < 0.01 then
    delete from private.write_budget where window_start < now() - interval '2 days';
  end if;
end;
$$;
revoke all on function private.charge_write(uuid, integer) from public;
grant execute on function private.charge_write(uuid, integer) to anon, authenticated;

-- Runs as the caller (not security definer), so current_user tells API traffic
-- from migrations and definer functions, and the per-scope count sees exactly
-- what the caller's policies let it see -- which, for any write the policies
-- will accept, is that whole world.
--   TG_ARGV[0]  max row size in bytes
--   TG_ARGV[1]  column that scopes the row: game_world_id, character_id, or id
--   TG_ARGV[2]  max rows per scope value, or '' for none
create or replace function private.write_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_max   integer := TG_ARGV[0]::integer;
  v_scope text    := TG_ARGV[1];
  v_cap   integer := nullif(TG_ARGV[2], '')::integer;
  v_size  integer;
  v_key   uuid;
  v_world uuid;
  v_count integer;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  v_size := octet_length(row_to_json(new)::text);
  if v_size > v_max then
    raise exception 'Too much text for one % entry (% bytes, limit %).', TG_TABLE_NAME, v_size, v_max
      using errcode = '54000';
  end if;

  v_key := (to_jsonb(new) ->> v_scope)::uuid;
  if v_scope = 'character_id' then
    select c.game_world_id into v_world from public.characters c where c.id = v_key;
  else
    v_world := v_key;
  end if;

  -- Not a world this caller can see: the row level policy refuses the write
  -- after this trigger, with the right error, so leave it to that.
  if v_world is null then
    return new;
  end if;

  if TG_OP = 'INSERT' and v_cap is not null then
    execute format('select count(*) from public.%I where %I = $1', TG_TABLE_NAME, v_scope)
      into v_count using v_key;
    if v_count >= v_cap then
      raise exception 'Limit reached: at most % % entries here.', v_cap, TG_TABLE_NAME
        using errcode = '53400';
    end if;
  end if;

  perform private.charge_write(
    v_world,
    v_size - case when TG_OP = 'UPDATE' then octet_length(row_to_json(old)::text) else 0 end);

  return new;
end;
$$;

do $$
declare
  g record;
begin
  for g in
    select * from (values
      -- table                 max bytes  scope            max rows
      ('game_worlds',            4096,   'id',            null),
      ('characters',            32768,   'game_world_id', 100),
      ('ability_scores',         4096,   'character_id',  null),
      ('character_details',     32768,   'character_id',  null),
      ('character_effects',      4096,   'character_id',  300),
      ('currency',               2048,   'character_id',  null),
      ('features_traits',       16384,   'character_id',  300),
      ('inventory_items',        8192,   'character_id',  500),
      ('saving_throws',          1024,   'character_id',  null),
      ('skills',                 1024,   'character_id',  40),
      ('spell_slots',            1024,   'character_id',  null),
      ('spells',                16384,   'character_id',  400),
      ('weapons',                4096,   'character_id',  100),
      ('campaigns',             16384,   'game_world_id', 50),
      ('campaign_characters',    1024,   'game_world_id', 2000),
      ('areas',                 32768,   'game_world_id', 2000),
      ('campaign_monsters',     65536,   'game_world_id', 2000),
      ('chapters',              16384,   'game_world_id', 1000),
      ('chapter_beats',         32768,   'game_world_id', 3000),
      ('npcs',                  16384,   'game_world_id', 2000),
      ('encounters',            32768,   'game_world_id', 2000),
      ('encounter_combatants',   8192,   'game_world_id', 5000),
      ('campaign_sessions',     65536,   'game_world_id', 2000),
      ('campaign_checks',       16384,   'game_world_id', 5000),
      ('dm_notes',              65536,   'game_world_id', 10000)
    ) as v(tbl, max_bytes, scope, max_rows)
  loop
    execute format('drop trigger if exists write_guard on public.%I', g.tbl);
    execute format(
      'create trigger write_guard before insert or update on public.%I '
      'for each row execute function private.write_guard(%L, %L, %L)',
      g.tbl, g.max_bytes, g.scope, coalesce(g.max_rows::text, ''));

    -- The row cap counts by scope, so make that an index lookup.
    if g.scope = 'game_world_id' then
      execute format('create index if not exists %I on public.%I (game_world_id)',
                     g.tbl || '_game_world_id_idx', g.tbl);
    end if;
  end loop;
end $$;

-- ============================================================================
-- 6. world_create: limits the caller cannot reset by changing a header
-- ============================================================================

create index if not exists world_create_attempts_ip_idx
  on public.world_create_attempts (ip, attempted_at desc);

create or replace function public.world_create(
  p_name text, p_description text, p_leveling_mode text, p_dm_pin text, p_player_pin text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $function$
declare
  v_id     uuid;
  v_mode   text := coalesce(nullif(p_leveling_mode, ''), 'milestone');
  v_token  text;
  v_ip     text;
  v_recent integer;
begin
  if p_name is null or length(trim(p_name)) < 3 or length(trim(p_name)) > 50 then
    return json_build_object('ok', false, 'error', 'bad_name');
  end if;
  if p_description is not null and length(p_description) > 500 then
    return json_build_object('ok', false, 'error', 'bad_description');
  end if;
  if p_dm_pin !~ '^\d{4}$' or p_player_pin !~ '^\d{4}$' then
    return json_build_object('ok', false, 'error', 'bad_pin');
  end if;
  if p_dm_pin = p_player_pin then
    return json_build_object('ok', false, 'error', 'pins_identical');
  end if;
  if v_mode not in ('milestone', 'exp') then
    return json_build_object('ok', false, 'error', 'bad_mode');
  end if;

  -- Unthrottled, this ran ~132,000 times in an afternoon. The per-address
  -- limit stops a casual repeat; the site-wide ones stop a caller who rotates
  -- x-forwarded-for, which they control. Real creation runs well under one a
  -- day, so a flood can at worst delay a new world, never fill the database.
  v_ip := nullif(split_part(coalesce(
            current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');
  delete from public.world_create_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_recent
    from public.world_create_attempts
   where attempted_at > now() - interval '1 hour'
     and ip is not distinct from v_ip;
  if v_recent >= 5 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select count(*) into v_recent
    from public.world_create_attempts
   where attempted_at > now() - interval '1 hour';
  if v_recent >= 10 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select count(*) into v_recent from public.world_create_attempts;   -- the last day
  if v_recent >= 30 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into public.world_create_attempts (ip) values (v_ip);

  begin
    insert into public.game_worlds (name, description, leveling_mode)
    values (trim(p_name), nullif(trim(coalesce(p_description, '')), ''), v_mode)
    returning id into v_id;
  exception when unique_violation then
    return json_build_object('ok', false, 'error', 'name_taken');
  end;

  insert into public.game_world_secrets (game_world_id, dm_pin_hash, player_pin_hash)
  values (v_id,
          encode(extensions.digest(p_dm_pin, 'sha256'), 'hex'),
          encode(extensions.digest(p_player_pin, 'sha256'), 'hex'));

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.dm_sessions (token_hash, game_world_id, role)
  values (extensions.digest(v_token, 'sha256'), v_id, 'dm');

  return json_build_object(
    'ok',              true,
    'role',            'dm',
    'game_world_id',   v_id,
    'game_world_name', trim(p_name),
    'leveling_mode',   v_mode,
    'dm_token',        v_token
  );
end $function$;

-- ============================================================================
-- 7. world_login: a slower brute force, bounded inputs, bounded sessions
-- ============================================================================
-- The per-world limit is the one that protects a PIN, because the per-address
-- one can be reset with a header. It was 60 failures per 15 minutes: a 4-digit
-- PIN fell in about a day. 30 per hour makes the average a week of continuous,
-- visible lockout. Longer PINs are the real fix; see 11.3a20.

create index if not exists dm_sessions_world_idx
  on public.dm_sessions (game_world_id, created_at desc);

create or replace function public.world_login(p_world_name text, p_pin text)
returns json
language plpgsql security definer
set search_path = public, extensions
as $function$
declare
  v_world       public.game_worlds%rowtype;
  v_secrets     public.game_world_secrets%rowtype;
  v_hash        text;
  v_ip          text;
  v_ip_fails    integer;
  v_world_fails integer;
  v_role        text;
  v_token       text := null;
begin
  -- Neither can match anything, so answer without recording an attempt:
  -- pin_attempts would otherwise store a name of whatever size was sent.
  if p_world_name is null or length(p_world_name) > 50 then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return json_build_object('ok', false, 'error', 'bad_pin');
  end if;

  v_ip := nullif(split_part(coalesce(
            current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');

  delete from public.pin_attempts where attempted_at < now() - interval '1 hour';

  select count(*) into v_ip_fails
    from public.pin_attempts
   where ip = v_ip and v_ip is not null
     and attempted_at > now() - interval '15 minutes';

  select count(*) into v_world_fails
    from public.pin_attempts
   where game_world_name = p_world_name;   -- the last hour, after the prune

  if v_ip_fails >= 10 or v_world_fails >= 30 then
    return json_build_object('ok', false, 'error', 'rate_limited');
  end if;

  select * into v_world from public.game_worlds
   where name = p_world_name and is_active limit 1;

  if not found then
    insert into public.pin_attempts (game_world_name, ip) values (p_world_name, v_ip);
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  select * into v_secrets from public.game_world_secrets where game_world_id = v_world.id;
  if not found then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  v_hash := encode(extensions.digest(p_pin, 'sha256'), 'hex');

  if v_hash = v_secrets.dm_pin_hash then
    v_role := 'dm';
  elsif v_hash = v_secrets.player_pin_hash then
    v_role := 'player';
  else
    insert into public.pin_attempts (game_world_name, ip) values (p_world_name, v_ip);
    return json_build_object('ok', false, 'error', 'bad_pin');
  end if;

  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.dm_sessions (token_hash, game_world_id, role)
  values (extensions.digest(v_token, 'sha256'), v_world.id, v_role);
  delete from public.dm_sessions where expires_at < now();

  -- Anyone holding a PIN could otherwise mint sessions without end. 100 live
  -- devices is far past any real table; past it, the oldest is logged out.
  delete from public.dm_sessions s
   where s.game_world_id = v_world.id
     and s.token_hash not in (
       select k.token_hash from public.dm_sessions k
        where k.game_world_id = v_world.id
        order by k.created_at desc
        limit 100);

  return json_build_object(
    'ok',              true,
    'role',            v_role,
    'game_world_id',   v_world.id,
    'game_world_name', v_world.name,
    'leveling_mode',   v_world.leveling_mode,
    -- Named dm_token for both roles: both clients already store and send this
    -- field. Role lives in dm_sessions.role.
    'dm_token',        v_token
  );
end $function$;

-- ============================================================================
-- 8. Feedback and encounter shares: site-wide and per-world ceilings
-- ============================================================================

create index if not exists feedback_created_idx on public.feedback (created_at desc);

create or replace function private.feedback_rate_limit()
returns trigger
language plpgsql security definer
set search_path = public, pg_temp
as $function$
declare
    recent integer;
begin
    select count(*) into recent
    from public.feedback f
    where f.created_at > now() - interval '10 minutes'
      and f.game_world_id is not distinct from new.game_world_id;

    if recent >= 5 then
        raise exception 'Too many reports from here in the last few minutes. Please try again shortly.'
            using errcode = '53400';
    end if;

    -- game_world_id is whatever the submitter sends, so the per-world limit
    -- alone is as many limits as there are worlds.
    select count(*) into recent
    from public.feedback f
    where f.created_at > now() - interval '1 hour';

    if recent >= 30 then
        raise exception 'Too many reports in the last hour. Please try again later.'
            using errcode = '53400';
    end if;

    return new;
end;
$function$;

create or replace function public.encounter_share_create(p_encounter_id uuid)
returns json
language plpgsql security definer
set search_path = public, private, extensions
as $function$
declare
  v_world   uuid;
  v_enc     public.encounters%rowtype;
  v_payload jsonb;
  v_code    text;
  v_tries   integer := 0;
begin
  -- Sharing is a DM action: it publishes the encounter to anyone holding the
  -- code, so the caller must hold a token for the world that owns it.
  v_world := private.current_dm_world();
  if v_world is null then
    return json_build_object('ok', false, 'error', 'not_dm');
  end if;

  select * into v_enc from public.encounters where id = p_encounter_id;
  if not found or v_enc.game_world_id <> v_world then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;

  -- Codes last a while and nothing else bounds how many a DM can mint.
  if (select count(*) from public.shared_encounters
       where game_world_id = v_world and expires_at > now()) >= 50 then
    return json_build_object('ok', false, 'error', 'too_many_shares');
  end if;

  -- The recipe, not the state: what to put on the table, at full health.
  -- Player characters are left out -- they are other people's characters, and
  -- the recipient has their own party.
  select jsonb_build_object(
           'name', v_enc.name,
           'read_aloud', v_enc.read_aloud,
           'combatants', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'name',   c.display_name,
               'api',    m.api_index,
               'hp',     c.max_hit_points,
               'ac',     c.armor_class,
               'color',  c.color,
               'group',  c.group_label
           )) order by c.sort_order) filter (where c.id is not null), '[]'::jsonb))
    into v_payload
    from public.encounter_combatants c
    left join public.campaign_monsters m on m.id = c.campaign_monster_id
   where c.encounter_id = v_enc.id
     and c.combatant_type in ('monster', 'npc');

  loop
    v_code := private.share_code();
    begin
      insert into public.shared_encounters (code, game_world_id, name, payload)
      values (v_code, v_world, v_enc.name, v_payload);
      exit;
    exception when unique_violation then
      v_tries := v_tries + 1;
      if v_tries > 5 then
        return json_build_object('ok', false, 'error', 'code_collision');
      end if;
    end;
  end loop;

  delete from public.shared_encounters where expires_at < now();

  return json_build_object('ok', true, 'code', v_code,
                           'count', jsonb_array_length(v_payload -> 'combatants'));
end $function$;

create index if not exists shared_encounters_world_idx
  on public.shared_encounters (game_world_id, expires_at);

-- ============================================================================
-- 9. Grants the API never needs
-- ============================================================================
-- TRUNCATE bypasses row level security entirely. PostgREST cannot issue it
-- today, but nothing should rest on that.

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, references, trigger on public.%I from anon, authenticated', t);
  end loop;
end $$;

revoke all on public.world_create_attempts from anon, authenticated;
revoke all on sequence public.world_create_attempts_id_seq from anon, authenticated;
