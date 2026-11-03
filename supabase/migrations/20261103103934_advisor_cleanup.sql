-- Security advisor cleanup after 20261103102913_security_hardening.
--
-- Two helper functions resolved names through the caller's search_path, and a
-- trigger function sat on the API surface as a callable RPC. None was
-- exploitable as it stood; all three are cheaper to close than to re-argue.

alter function private.share_code() set search_path = pg_catalog;
alter function private.guard_bulk_delete() set search_path = pg_catalog;

-- Only ever fired by the trigger on game_worlds, which needs no EXECUTE grant.
revoke execute on function public.ensure_default_campaign() from public, anon, authenticated;

-- A world still gets its default campaign when created through the API.
do $$
declare v_res json;
begin
  begin
    perform set_config('request.headers', '{"x-forwarded-for":"192.0.2.1"}', true);
    v_res := public.world_create('__cleanup_' || substr(gen_random_uuid()::text, 1, 8),
                                 null, 'milestone', '1379', '2468');
    if (v_res ->> 'ok')::boolean is not true then
      raise exception 'FAIL: world_create refused: %', v_res ->> 'error';
    end if;
    if not exists (select 1 from public.campaigns
                    where game_world_id = (v_res ->> 'game_world_id')::uuid and is_default) then
      raise exception 'FAIL: the new world has no default campaign';
    end if;
    raise exception 'VERIFY_PASS';
  exception when others then
    if sqlerrm <> 'VERIFY_PASS' then raise; end if;
  end;
end $$;
