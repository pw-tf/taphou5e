-- Recorded from the project's migration history on 2026-11-03; applied 2026-09-19.

-- The lockdown revoked EXECUTE on private.current_world() from anon, which
-- broke every policy that calls it: an RLS expression is evaluated as the
-- CALLING role, not the policy's owner, so anon must be able to execute it.
-- With the grant missing, anon reads raised "permission denied for function
-- current_world" rather than returning rows -- the app was hard-broken for
-- everyone, not merely restricted.
--
-- Exposing it is not a leak. It is security definer and returns only the world
-- id belonging to the caller's own token -- something they already know -- and
-- the private schema is not on the PostgREST surface, so it cannot be called
-- as an RPC. private.current_dm_world() has always been reachable this way,
-- which is why the campaign layer worked.

grant execute on function private.current_world() to anon, authenticated;
