-- Verification for 20261103113540_altcha. Raises on any failure and rolls back
-- everything it creates.
--
-- From here on world_login and world_create need a solved challenge, so the
-- login and creation sections of verify_security_hardening stop at
-- captcha_required. Those limits are restated at the end of this file, each
-- request carrying a payload minted by private.altcha_mint_payload().
--
-- Every comparison is IS DISTINCT FROM, never <>: a check that wrongly
-- succeeds returns no error at all, and null <> 'captcha_required' is null,
-- which IF reads as false -- the assertion would pass exactly when it should fail.

do $$
declare
  v_name    text := '__altcha_' || substr(gen_random_uuid()::text, 1, 8);
  v_world   uuid;
  v_good    text;
  v_ch      json;
  v_p       jsonb;
  v_counter bigint;
  v_payload text;
  v_res     json;
  n         integer;
  i         integer;
begin
  begin
    insert into public.game_worlds (name) values (v_name) returning id into v_world;
    insert into public.game_world_secrets (game_world_id, dm_pin_hash, player_pin_hash)
    values (v_world, encode(extensions.digest('1379', 'sha256'), 'hex'),
                     encode(extensions.digest('2468', 'sha256'), 'hex'));

    -- ---- the old signatures are gone ----------------------------------------
    if to_regprocedure('public.world_login(text, text)') is not null
       or to_regprocedure('public.world_create(text, text, text, text, text)') is not null then
      raise exception 'FAIL: a captcha-free overload of world_login or world_create still exists';
    end if;

    -- ---- the API roles can issue, never verify or mint ------------------------
    if not has_function_privilege('anon', 'public.altcha_challenge()', 'execute') then
      raise exception 'FAIL: anon cannot fetch a challenge';
    end if;
    if has_function_privilege('anon', 'private.altcha_mint_payload()', 'execute')
       or has_function_privilege('anon', 'private.altcha_verify(text)', 'execute')
       or has_function_privilege('authenticated', 'private.altcha_sign(jsonb)', 'execute') then
      raise exception 'FAIL: an API role can reach a private altcha function';
    end if;
    if has_table_privilege('anon', 'private.altcha_secret', 'select') then
      raise exception 'FAIL: anon can read the HMAC secret';
    end if;

    -- ---- a real challenge, solved the slow way ------------------------------
    v_ch := public.altcha_challenge();
    v_p  := (v_ch -> 'parameters')::jsonb;
    if v_ch ->> 'signature' !~ '^[0-9a-f]{64}$' or v_p ->> 'keyPrefix' !~ '^[0-9a-f]{32}$' then
      raise exception 'FAIL: malformed challenge %', v_ch;
    end if;
    if v_ch::text ~ 'counter' then
      raise exception 'FAIL: the challenge gives away its counter';
    end if;

    for i in 0..100000 loop
      if left(private.altcha_key(v_p ->> 'salt', v_p ->> 'nonce', i), 32) = v_p ->> 'keyPrefix' then
        v_counter := i;
        exit;
      end if;
    end loop;
    if v_counter is null or v_counter < 10000 then
      raise exception 'FAIL: counter % is outside 10,000-100,000', v_counter;
    end if;

    v_payload := encode(convert_to(json_build_object('challenge', v_ch,
                   'solution', json_build_object('counter', v_counter))::text, 'UTF8'), 'base64');

    -- ---- as the API sees it -------------------------------------------------
    set local role anon;
    perform set_config('request.headers', '{}', true);

    if (public.world_login(v_name, '1379') ->> 'error') is distinct from 'captcha_required' then
      raise exception 'FAIL: a login with no captcha was not refused';
    end if;
    if (public.world_login(v_name, '1379', 'bm90IGEgcGF5bG9hZA==') ->> 'error') is distinct from 'captcha_invalid' then
      raise exception 'FAIL: a garbage payload was not refused';
    end if;

    v_res := public.world_login(v_name, '1379', v_payload);
    if (v_res ->> 'ok')::boolean is not true or v_res ->> 'role' is distinct from 'dm' then
      raise exception 'FAIL: a solved challenge did not log in: %', v_res;
    end if;

    if (public.world_login(v_name, '1379', v_payload) ->> 'error') is distinct from 'captcha_replayed' then
      raise exception 'FAIL: a spent payload was accepted twice';
    end if;
    reset role;

    -- ---- tampering: each differs from a valid payload in one way -------------
    -- wrong counter
    v_payload := encode(convert_to(json_build_object('challenge', public.altcha_challenge(),
                   'solution', json_build_object('counter', 1))::text, 'UTF8'), 'base64');
    if (public.world_login(v_name, '1379', v_payload) ->> 'error') is distinct from 'captcha_invalid' then
      raise exception 'FAIL: a wrong counter was accepted';
    end if;

    -- an easier prefix the server never signed
    v_good := private.altcha_mint_payload();
    v_p := convert_from(decode(v_good, 'base64'), 'UTF8')::jsonb;
    v_p := jsonb_set(v_p, '{challenge,parameters,keyPrefix}', to_jsonb(repeat('0', 32)));
    if (public.world_login(v_name, '1379', encode(convert_to(v_p::text, 'UTF8'), 'base64')) ->> 'error')
       is distinct from 'captcha_invalid' then
      raise exception 'FAIL: a re-written keyPrefix passed the signature check';
    end if;

    -- extended expiry
    v_p := convert_from(decode(v_good, 'base64'), 'UTF8')::jsonb;
    v_p := jsonb_set(v_p, '{challenge,parameters,expiresAt}', to_jsonb(4102444800));
    if (public.world_login(v_name, '1379', encode(convert_to(v_p::text, 'UTF8'), 'base64')) ->> 'error')
       is distinct from 'captcha_invalid' then
      raise exception 'FAIL: a re-written expiry passed the signature check';
    end if;

    -- genuinely expired: signed by the server, solved, but out of time
    v_p := jsonb_build_object('algorithm', 'SHA-256', 'cost', 1,
             'expiresAt', extract(epoch from now() - interval '1 minute')::bigint, 'keyLength', 32,
             'keyPrefix', left(private.altcha_key(repeat('a', 32), repeat('b', 32), 3), 32),
             'nonce', repeat('b', 32), 'salt', repeat('a', 32));
    v_payload := encode(convert_to(json_build_object(
                   'challenge', json_build_object('parameters', v_p, 'signature', private.altcha_sign(v_p)),
                   'solution', json_build_object('counter', 3))::text, 'UTF8'), 'base64');
    if (public.world_login(v_name, '1379', v_payload) ->> 'error') is distinct from 'captcha_expired' then
      raise exception 'FAIL: an expired challenge was accepted';
    end if;

    -- ---- unsolved requests cannot run a world's failure count up --------------
    for i in 1..40 loop
      perform public.world_login(v_name, '0000', null);
    end loop;
    select count(*) into n from public.pin_attempts where game_world_name = v_name;
    if n <> 0 then
      raise exception 'FAIL: % unsolved requests counted toward the lockout', n;
    end if;

    -- ---- creation needs it too ----------------------------------------------
    if (public.world_create('__altcha_new', null, 'milestone', '1111', '2222') ->> 'error')
       is distinct from 'captcha_required' then
      raise exception 'FAIL: world_create ran without a captcha';
    end if;
    v_res := public.world_create('__altcha_new_' || substr(gen_random_uuid()::text, 1, 6),
                                 null, 'milestone', '1111', '2222', private.altcha_mint_payload());
    if (v_res ->> 'ok')::boolean is not true then
      raise exception 'FAIL: world_create refused a solved captcha: %', v_res;
    end if;

    -- ---- the hardening limits, restated with payloads ---------------------------
    -- 105 logins, one session cap of 100
    for i in 1..105 loop
      perform public.world_login(v_name, '2468', private.altcha_mint_payload());
    end loop;
    select count(*) into n from public.dm_sessions where game_world_id = v_world;
    if n > 100 then raise exception 'FAIL: % live sessions for one world, cap is 100', n; end if;
    if n < 100 then raise exception 'FAIL: only % of 105 solved logins succeeded', n; end if;

    -- 30 failures from 30 addresses lock the world, even for the right PIN
    insert into public.pin_attempts (game_world_name, ip)
    select v_name, '198.51.100.' || g from generate_series(1, 30) g;
    if (public.world_login(v_name, '1379', private.altcha_mint_payload()) ->> 'error') is distinct from 'rate_limited' then
      raise exception 'FAIL: 30 failures in an hour did not lock the world';
    end if;

    -- the site-wide creation limit holds against a fresh address
    insert into public.world_create_attempts (ip)
    select '10.0.0.' || g from generate_series(1, 10) g;
    perform set_config('request.headers', '{"x-forwarded-for":"203.0.113.77"}', true);
    v_res := public.world_create('__altcha_flood', null, 'milestone', '1111', '2222', private.altcha_mint_payload());
    if (v_res ->> 'error') is distinct from 'rate_limited' then
      raise exception 'FAIL: a fresh x-forwarded-for got past the site-wide hourly limit: %', v_res;
    end if;

    raise exception 'VERIFY_PASS';
  exception when others then
    if sqlerrm <> 'VERIFY_PASS' then raise; end if;
  end;
end $$;
