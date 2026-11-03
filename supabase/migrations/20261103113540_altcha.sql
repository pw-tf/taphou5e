-- ALTCHA proof of work in front of world_login and world_create. See
-- docs/campaigns-schema-design.md 11.3a22.
--
-- The rate limits in 20261103102913 bound how often a request may succeed;
-- they do nothing about the cost of sending one. A captcha checked in the
-- browser would change nothing either, because the API is reachable without
-- the browser. So the server signs the challenge, the browser solves it, and
-- these functions verify the solution before they look at a name or a PIN.
--
-- Protocol: ALTCHA v3 (widget altcha@3.4.1), algorithm SHA-256, cost 1.
--   challenge  { parameters, signature }
--              signature = hex(HMAC-SHA256(canonical JSON of parameters))
--              canonical = keys sorted, no whitespace, as JSON.stringify
--   solution   counter such that SHA-256(salt || nonce || uint32be(counter))
--              starts with keyPrefix
--   payload    base64(JSON { challenge, solution }), sent as p_altcha
--
-- The server picks the counter at random and publishes only the first 16
-- bytes of its key, so the browser has to walk to it: 10,000 to 100,000
-- hashes, about a second on a phone. The counter comes from gen_random_bytes,
-- not random(), because a predictable counter is a skippable one.

-- 1. Secrets ------------------------------------------------------------------

create table if not exists private.altcha_secret (
  id       boolean primary key default true check (id),
  hmac_key text not null default encode(extensions.gen_random_bytes(32), 'hex')
);
insert into private.altcha_secret default values on conflict do nothing;
revoke all on private.altcha_secret from public, anon, authenticated;

-- One row per solution accepted, kept until its challenge would have expired
-- anyway, so a solved payload cannot be replayed into a second login.
create table if not exists private.altcha_spent (
  signature  text primary key,
  expires_at timestamptz not null
);
create index if not exists altcha_spent_expiry_idx on private.altcha_spent (expires_at);
revoke all on private.altcha_spent from public, anon, authenticated;

-- 2. Primitives ---------------------------------------------------------------

-- jsonb::text sorts keys by length and adds spaces, so it cannot reproduce
-- JSON.stringify. The parameter set is fixed, so the canonical form is too.
create or replace function private.altcha_canonical(p jsonb)
returns text
language sql immutable
set search_path = pg_catalog
as $$
  select format(
    '{"algorithm":"%s","cost":%s,"expiresAt":%s,"keyLength":%s,"keyPrefix":"%s","nonce":"%s","salt":"%s"}',
    p ->> 'algorithm', p ->> 'cost', p ->> 'expiresAt', p ->> 'keyLength',
    p ->> 'keyPrefix', p ->> 'nonce', p ->> 'salt')
$$;

create or replace function private.altcha_key(p_salt text, p_nonce text, p_counter bigint)
returns text
language sql immutable
set search_path = pg_catalog
as $$
  select encode(extensions.digest(
    decode(p_salt, 'hex') || decode(p_nonce, 'hex') || substring(int8send(p_counter) from 5 for 4),
    'sha256'), 'hex')
$$;

create or replace function private.altcha_sign(p jsonb)
returns text
language sql stable security definer
set search_path = pg_catalog
as $$
  select encode(extensions.hmac(private.altcha_canonical(p), s.hmac_key, 'sha256'), 'hex')
    from private.altcha_secret s
$$;

revoke all on function private.altcha_canonical(jsonb) from public, anon, authenticated;
revoke all on function private.altcha_key(text, text, bigint) from public, anon, authenticated;
revoke all on function private.altcha_sign(jsonb) from public, anon, authenticated;

-- 3. Issue --------------------------------------------------------------------
-- Stateless: issuing writes nothing, so asking for challenges costs the
-- database one hash and one HMAC, and an unsolved one leaves no trace.

create or replace function public.altcha_challenge()
returns json
language plpgsql volatile security definer
set search_path = pg_catalog
as $$
declare
  v_salt    text   := encode(extensions.gen_random_bytes(16), 'hex');
  v_nonce   text   := encode(extensions.gen_random_bytes(16), 'hex');
  v_counter bigint := 10000 + (('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint % 90000);
  v_params  jsonb;
begin
  v_params := jsonb_build_object(
    'algorithm', 'SHA-256',
    'cost',      1,
    'expiresAt', extract(epoch from now() + interval '10 minutes')::bigint,
    'keyLength', 32,
    'keyPrefix', left(private.altcha_key(v_salt, v_nonce, v_counter), 32),
    'nonce',     v_nonce,
    'salt',      v_salt);
  return json_build_object('parameters', v_params, 'signature', private.altcha_sign(v_params));
end;
$$;
revoke all on function public.altcha_challenge() from public;
grant execute on function public.altcha_challenge() to anon, authenticated;

-- 4. Verify -------------------------------------------------------------------
-- Null when the payload is good, otherwise the error code the client shows.
-- Only the exact parameter set altcha_challenge issues is accepted.

create or replace function private.altcha_verify(p_payload text)
returns text
language plpgsql volatile security definer
set search_path = pg_catalog
as $$
declare
  v       jsonb;
  p       jsonb;
  v_sig   text;
  v_exp   bigint;
  v_count bigint;
begin
  if p_payload is null or p_payload = '' then
    return 'captcha_required';
  end if;
  if length(p_payload) > 4000 then
    return 'captcha_invalid';
  end if;

  begin
    v := convert_from(decode(p_payload, 'base64'), 'UTF8')::jsonb;
  exception when others then
    return 'captcha_invalid';
  end;

  p     := v #> '{challenge,parameters}';
  v_sig := v #>> '{challenge,signature}';

  if jsonb_typeof(p) is distinct from 'object'
     or coalesce(v_sig, '') !~ '^[0-9a-f]{64}$'
     or p ->> 'algorithm' is distinct from 'SHA-256'
     or p ->> 'cost'      is distinct from '1'
     or p ->> 'keyLength' is distinct from '32'
     or coalesce(p ->> 'nonce', '')     !~ '^[0-9a-f]{32}$'
     or coalesce(p ->> 'salt', '')      !~ '^[0-9a-f]{32}$'
     or coalesce(p ->> 'keyPrefix', '') !~ '^[0-9a-f]{32}$'
     or coalesce(p ->> 'expiresAt', '') !~ '^[0-9]{1,12}$'
     or coalesce(v #>> '{solution,counter}', '') !~ '^[0-9]{1,10}$' then
    return 'captcha_invalid';
  end if;

  if private.altcha_sign(p) <> v_sig then
    return 'captcha_invalid';
  end if;

  v_exp := (p ->> 'expiresAt')::bigint;
  if v_exp < extract(epoch from now()) then
    return 'captcha_expired';
  end if;

  v_count := (v #>> '{solution,counter}')::bigint;
  if v_count > 4294967295
     or left(private.altcha_key(p ->> 'salt', p ->> 'nonce', v_count), 32) <> p ->> 'keyPrefix' then
    return 'captcha_invalid';
  end if;

  delete from private.altcha_spent where expires_at < now();
  insert into private.altcha_spent (signature, expires_at)
  values (v_sig, to_timestamp(v_exp))
  on conflict do nothing;
  if not found then
    return 'captcha_replayed';
  end if;

  return null;
end;
$$;
revoke all on function private.altcha_verify(text) from public, anon, authenticated;

-- For the verification scripts: a solved payload, minted with the secret
-- rather than worked for. Owner only; private is not on the API surface.
create or replace function private.altcha_mint_payload()
returns text
language plpgsql volatile security definer
set search_path = pg_catalog
as $$
declare
  v_salt   text := encode(extensions.gen_random_bytes(16), 'hex');
  v_nonce  text := encode(extensions.gen_random_bytes(16), 'hex');
  v_params jsonb;
begin
  v_params := jsonb_build_object(
    'algorithm', 'SHA-256', 'cost', 1,
    'expiresAt', extract(epoch from now() + interval '10 minutes')::bigint,
    'keyLength', 32,
    'keyPrefix', left(private.altcha_key(v_salt, v_nonce, 7), 32),
    'nonce', v_nonce, 'salt', v_salt);
  return encode(convert_to(json_build_object(
    'challenge', json_build_object('parameters', v_params, 'signature', private.altcha_sign(v_params)),
    'solution',  json_build_object('counter', 7))::text, 'UTF8'), 'base64');
end;
$$;
revoke all on function private.altcha_mint_payload() from public, anon, authenticated;

-- 5. world_login and world_create require it ---------------------------------
-- Dropped and recreated rather than replaced: adding a parameter makes a new
-- overload, and the old two-argument world_login would stay callable without
-- a captcha. The checks run before any limit is counted, so unsolved requests
-- can neither guess a PIN nor run a world's failure count up to its lockout.

drop function if exists public.world_login(text, text);
drop function if exists public.world_create(text, text, text, text, text);

create or replace function public.world_login(p_world_name text, p_pin text, p_altcha text default null)
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
  v_captcha     text;
begin
  -- Neither can match anything, so answer without recording an attempt:
  -- pin_attempts would otherwise store a name of whatever size was sent.
  if p_world_name is null or length(p_world_name) > 50 then
    return json_build_object('ok', false, 'error', 'not_found');
  end if;
  if p_pin is null or p_pin !~ '^\d{4}$' then
    return json_build_object('ok', false, 'error', 'bad_pin');
  end if;

  v_captcha := private.altcha_verify(p_altcha);
  if v_captcha is not null then
    return json_build_object('ok', false, 'error', v_captcha);
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

create or replace function public.world_create(
  p_name text, p_description text, p_leveling_mode text, p_dm_pin text, p_player_pin text,
  p_altcha text default null)
returns json
language plpgsql security definer
set search_path = public, extensions
as $function$
declare
  v_id      uuid;
  v_mode    text := coalesce(nullif(p_leveling_mode, ''), 'milestone');
  v_token   text;
  v_ip      text;
  v_recent  integer;
  v_captcha text;
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

  v_captcha := private.altcha_verify(p_altcha);
  if v_captcha is not null then
    return json_build_object('ok', false, 'error', v_captcha);
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

revoke all on function public.world_login(text, text, text) from public;
revoke all on function public.world_create(text, text, text, text, text, text) from public;
grant execute on function public.world_login(text, text, text) to anon, authenticated;
grant execute on function public.world_create(text, text, text, text, text, text) to anon, authenticated;
