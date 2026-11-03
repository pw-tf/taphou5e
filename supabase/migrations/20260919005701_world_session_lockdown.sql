-- Recorded from the project's migration history on 2026-11-03; applied 2026-09-19.

-- World-session lockdown. See docs/campaigns-schema-design.md 11.3a19.
--
-- Thirteen tables carried FOR ALL TO PUBLIC USING (true) WITH CHECK (true).
-- The anon key is published in every page's source, so that let anyone run
-- DELETE FROM game_worlds. On 2026-09-18 someone did: 194 worlds, and by
-- ON DELETE CASCADE all 265 characters and the whole campaign tree.
--
-- The fix extends the mechanism that DID hold -- the x-dm-token world session
-- protecting the campaign layer -- to every remaining table.

-- 1. Sessions carry a role ---------------------------------------------------
alter table public.dm_sessions
  add column if not exists role text not null default 'dm';

alter table public.dm_sessions drop constraint if exists dm_sessions_role_check;
alter table public.dm_sessions
  add constraint dm_sessions_role_check check (role in ('dm', 'player'));

comment on table public.dm_sessions is
  'World sessions for both roles, despite the name. Renaming it would touch world_login and world_create for no behavioural gain; role tells the two apart.';

-- 2. Session helpers ---------------------------------------------------------
-- current_dm_world() keeps its meaning -- "the world this caller DMs" -- and
-- now says so explicitly, because the table holds player rows too. Every
-- campaign-layer policy depends on it and keeps working unchanged.
create or replace function private.current_dm_world()
returns uuid
language sql stable security definer
set search_path = public, extensions
as $$
  select s.game_world_id
  from public.dm_sessions s
  where s.token_hash = extensions.digest(
          coalesce(current_setting('request.headers', true)::json ->> 'x-dm-token', ''), 'sha256')
    and s.expires_at > now()
    and s.role = 'dm'
  limit 1
$$;

create or replace function private.current_world()
returns uuid
language sql stable security definer
set search_path = public, extensions
as $$
  select s.game_world_id
  from public.dm_sessions s
  where s.token_hash = extensions.digest(
          coalesce(current_setting('request.headers', true)::json ->> 'x-dm-token', ''), 'sha256')
    and s.expires_at > now()
  limit 1
$$;

revoke all on function private.current_world() from public, anon, authenticated;

-- 3. Rate-limit table for world creation -------------------------------------
create table if not exists public.world_create_attempts (
  id           bigserial primary key,
  ip           text,
  attempted_at timestamptz not null default now()
);
create index if not exists world_create_attempts_recent_idx
  on public.world_create_attempts (attempted_at desc);
alter table public.world_create_attempts enable row level security;
-- No policies: only world_create (security definer) ever touches it.

-- 4. world_login issues a session to players too -----------------------------
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
  v_ip := nullif(split_part(coalesce(
            current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');

  delete from public.pin_attempts where attempted_at < now() - interval '1 hour';

  select count(*) into v_ip_fails
    from public.pin_attempts
   where ip = v_ip and v_ip is not null
     and attempted_at > now() - interval '15 minutes';

  select count(*) into v_world_fails
    from public.pin_attempts
   where game_world_name = p_world_name
     and attempted_at > now() - interval '15 minutes';

  if v_ip_fails >= 10 or v_world_fails >= 60 then
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

  -- Both roles now get a session. Without one a player can neither read nor
  -- write, because every table below is scoped to a session's world.
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.dm_sessions (token_hash, game_world_id, role)
  values (extensions.digest(v_token, 'sha256'), v_world.id, v_role);
  delete from public.dm_sessions where expires_at < now();

  return json_build_object(
    'ok',              true,
    'role',            v_role,
    'game_world_id',   v_world.id,
    'game_world_name', v_world.name,
    'leveling_mode',   v_world.leveling_mode,
    -- Named dm_token for both roles on purpose: both clients already store and
    -- send this field, so players get a session without touching either
    -- login.js, and v1's is frozen. Role lives in dm_sessions.role.
    'dm_token',        v_token
  );
end $function$;

-- 5. world_create is rate limited and tags its session as a DM ---------------
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
  if p_dm_pin !~ '^\d{4}$' or p_player_pin !~ '^\d{4}$' then
    return json_build_object('ok', false, 'error', 'bad_pin');
  end if;
  if p_dm_pin = p_player_pin then
    return json_build_object('ok', false, 'error', 'pins_identical');
  end if;
  if v_mode not in ('milestone', 'exp') then
    return json_build_object('ok', false, 'error', 'bad_mode');
  end if;

  -- Unthrottled, this ran ~132,000 times in an afternoon.
  v_ip := nullif(split_part(coalesce(
            current_setting('request.headers', true)::json ->> 'x-forwarded-for', ''), ',', 1), '');
  delete from public.world_create_attempts where attempted_at < now() - interval '1 day';

  select count(*) into v_recent
    from public.world_create_attempts
   where attempted_at > now() - interval '1 hour'
     and ((v_ip is not null and ip = v_ip) or (v_ip is null and ip is null));

  if v_recent >= 5 then
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

-- 6. A mass delete fails loudly instead of succeeding silently ---------------
-- Statement-level with a transition table, so it costs nothing per row and
-- catches exactly this attack's shape. Row-by-row deletion is unaffected.
create or replace function private.guard_bulk_delete()
returns trigger
language plpgsql
as $$
declare
  n integer;
  cap integer := coalesce(nullif(TG_ARGV[0], '')::integer, 25);
begin
  select count(*) into n from deleted_rows;
  if n > cap then
    raise exception
      'Refusing to delete % rows from % in one statement (limit %). Delete in smaller batches, or do it as the service role.',
      n, TG_TABLE_NAME, cap
      using errcode = '53400';
  end if;
  return null;
end;
$$;

drop trigger if exists guard_bulk_delete on public.game_worlds;
create trigger guard_bulk_delete
  after delete on public.game_worlds
  referencing old table as deleted_rows
  for each statement execute function private.guard_bulk_delete('3');

drop trigger if exists guard_bulk_delete on public.characters;
create trigger guard_bulk_delete
  after delete on public.characters
  referencing old table as deleted_rows
  for each statement execute function private.guard_bulk_delete('25');

-- 7. Replace the thirteen open policies --------------------------------------
-- Wrapped as (select private.current_world()) so the planner evaluates the
-- session lookup once per statement rather than once per row.

-- game_worlds
drop policy if exists "Allow all access to game_worlds" on public.game_worlds;
drop policy if exists game_worlds_owner_read on public.game_worlds;
drop policy if exists game_worlds_session_read on public.game_worlds;
drop policy if exists game_worlds_dm_update on public.game_worlds;
drop policy if exists game_worlds_dm_delete on public.game_worlds;

create policy game_worlds_owner_read on public.game_worlds
  for select to authenticated using ((select auth.uid()) is not null);

create policy game_worlds_session_read on public.game_worlds
  for select to anon, authenticated
  using (id = (select private.current_world()));

-- No INSERT policy on purpose: world_create (definer) is the only way in.

create policy game_worlds_dm_update on public.game_worlds
  for update to anon, authenticated
  using (id = (select private.current_dm_world()))
  with check (id = (select private.current_dm_world()));

create policy game_worlds_dm_delete on public.game_worlds
  for delete to anon, authenticated
  using (id = (select private.current_dm_world()));

-- characters
drop policy if exists "Allow all access to characters" on public.characters;
drop policy if exists characters_owner_read on public.characters;
drop policy if exists characters_session_all on public.characters;

create policy characters_owner_read on public.characters
  for select to authenticated using ((select auth.uid()) is not null);

create policy characters_session_all on public.characters
  for all to anon, authenticated
  using (game_world_id = (select private.current_world()))
  with check (game_world_id = (select private.current_world()));

-- The eleven per-character tables. They carry character_id and no world
-- column, so the scope is reached through the character. Generated rather than
-- written out eleven times, so no table can quietly miss a clause.
do $$
declare t text;
begin
  foreach t in array array[
    'ability_scores', 'character_details', 'character_effects', 'currency',
    'features_traits', 'inventory_items', 'saving_throws', 'skills',
    'spell_slots', 'spells', 'weapons'
  ] loop
    execute format('drop policy if exists %I on public.%I', 'Allow all access to ' || t, t);
    execute format('drop policy if exists %I_owner_read on public.%I', t, t);
    execute format('drop policy if exists %I_session_all on public.%I', t, t);

    execute format($f$
      create policy %I_owner_read on public.%I
        for select to authenticated using ((select auth.uid()) is not null)
    $f$, t, t);

    execute format($f$
      create policy %I_session_all on public.%I
        for all to anon, authenticated
        using (exists (select 1 from public.characters c
                        where c.id = character_id
                          and c.game_world_id = (select private.current_world())))
        with check (exists (select 1 from public.characters c
                        where c.id = character_id
                          and c.game_world_id = (select private.current_world())))
    $f$, t, t);
  end loop;
end $$;
