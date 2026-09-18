-- World-session lockdown
--
-- NOT YET APPLIED. Apply this only AFTER the point-in-time restore has landed,
-- because a restore rolls the database back past anything applied before it.
--
-- ---------------------------------------------------------------------------
-- What went wrong
-- ---------------------------------------------------------------------------
-- Thirteen tables carried one policy each: FOR ALL TO PUBLIC USING (true)
-- WITH CHECK (true). The anon key is published in the source of every page --
-- it has to be, this is a static site -- so that policy let anyone with a
-- browser run DELETE FROM game_worlds. On 2026-09-18 someone did: 194 worlds
-- and, by ON DELETE CASCADE, all 265 characters and the entire campaign tree.
-- They then bulk-inserted ~416,000 junk worlds through the same opening.
--
-- It was NOT SQL injection. No function in public or private uses dynamic SQL,
-- and PostgREST parameterises, so the `; drop table ;` world name was stored as
-- an inert string. The -N suffixes on the junk names are the attacker working
-- around the UNIQUE index on game_worlds.name.
--
-- The campaign layer's own security held: dm_all / player_read keyed on the
-- x-dm-token header was never bypassed. It simply did not matter, because the
-- parent worlds were deletable by anyone and the foreign keys did the rest.
--
-- ---------------------------------------------------------------------------
-- The fix: extend the DM-token model to every table
-- ---------------------------------------------------------------------------
-- world_login already issues a DM a random token, stored hashed in dm_sessions
-- and sent back as the x-dm-token request header. That mechanism is sound --
-- it is what protected the campaign layer. It only ever covered DMs, so this
-- migration issues players a session too, and scopes all thirteen tables to
-- "the world this session belongs to".
--
-- The wire field stays named `dm_token` deliberately. Both clients already do
-- `if (result.dm_token) session.dmToken = ...` and send it as x-dm-token, so
-- players get a working session with no change to either login.js -- and v1's
-- login.js is frozen. The role lives server-side in dm_sessions.role; both
-- clients gate DM-only UI on session.role, never on token presence, so a
-- player holding a token exposes no DM surface.

begin;

-- ---------------------------------------------------------------------------
-- 1. Sessions carry a role
-- ---------------------------------------------------------------------------
alter table public.dm_sessions
  add column if not exists role text not null default 'dm';

alter table public.dm_sessions drop constraint if exists dm_sessions_role_check;
alter table public.dm_sessions
  add constraint dm_sessions_role_check check (role in ('dm', 'player'));

comment on table public.dm_sessions is
  'World sessions for both roles, despite the name. Renaming it would touch world_login and world_create for no behavioural gain; role tells the two apart.';

-- ---------------------------------------------------------------------------
-- 2. Session helpers
--
-- current_dm_world() keeps its meaning -- "the world this caller DMs" -- and
-- now says so explicitly, because the table holds player rows too. Every
-- campaign-layer policy already depends on it and keeps working unchanged.
-- ---------------------------------------------------------------------------
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

-- The world this caller may touch at all, whichever role they hold.
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

-- ---------------------------------------------------------------------------
-- 3. world_login issues a session to players too
-- ---------------------------------------------------------------------------
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

  -- Both roles now get a session. Without one a player cannot write anything,
  -- because every table below is scoped to a session's world.
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
    -- Named dm_token for both roles on purpose; see the header note.
    'dm_token',        v_token
  );
end $function$;

-- world_create's session is a DM session explicitly.
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

  -- Unthrottled, this ran 132,000 times in an afternoon. Nobody legitimately
  -- creates six worlds an hour from one address.
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

create table if not exists public.world_create_attempts (
  id           bigserial primary key,
  ip           text,
  attempted_at timestamptz not null default now()
);
create index if not exists world_create_attempts_recent_idx
  on public.world_create_attempts (attempted_at desc);
alter table public.world_create_attempts enable row level security;
-- No policies: only world_create (security definer) ever touches it.

-- ---------------------------------------------------------------------------
-- 4. A mass delete fails loudly instead of succeeding silently
--
-- Statement-level, using a transition table, so it costs nothing per row and
-- catches exactly the shape of this attack: one DELETE taking out everything.
-- A DM clearing out their own world row by row is unaffected.
-- ---------------------------------------------------------------------------
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
      'Refusing to delete % rows from % in one statement (limit %). Delete in smaller batches, or do it from the SQL editor as the service role.',
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

-- ---------------------------------------------------------------------------
-- 5. Replace the thirteen open policies
--
-- Wrapped as (select private.current_world()) so the planner evaluates the
-- session lookup once per statement rather than once per row.
-- ---------------------------------------------------------------------------

-- game_worlds -------------------------------------------------------------
drop policy if exists "Allow all access to game_worlds" on public.game_worlds;

-- The owner dashboard reads every world; it holds a real auth session.
create policy game_worlds_owner_read on public.game_worlds
  for select to authenticated using ((select auth.uid()) is not null);

create policy game_worlds_session_read on public.game_worlds
  for select to anon, authenticated
  using (id = (select private.current_world()));

-- Only world_create (definer) inserts. No INSERT policy at all, on purpose.

create policy game_worlds_dm_update on public.game_worlds
  for update to anon, authenticated
  using (id = (select private.current_dm_world()))
  with check (id = (select private.current_dm_world()));

create policy game_worlds_dm_delete on public.game_worlds
  for delete to anon, authenticated
  using (id = (select private.current_dm_world()));

-- characters --------------------------------------------------------------
drop policy if exists "Allow all access to characters" on public.characters;

create policy characters_owner_read on public.characters
  for select to authenticated using ((select auth.uid()) is not null);

create policy characters_session_all on public.characters
  for all to anon, authenticated
  using (game_world_id = (select private.current_world()))
  with check (game_world_id = (select private.current_world()));

-- The eleven per-character tables -----------------------------------------
-- They carry character_id and no world column, so the scope is reached
-- through the character. Generated rather than written out eleven times, so a
-- future table cannot be added to the list and quietly miss a clause.
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

commit;
