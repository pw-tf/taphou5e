-- Recorded from the project's migration history on 2026-11-03; applied 2026-09-19.

-- Six empty worlds named bait-2 .. bait-20, created 22:19-22:26 on 2026-09-18,
-- numbered with gaps: someone probing to see whether the hole was still open.
-- All six hold no characters, chapters or encounters -- only the default
-- campaign the trigger creates with every world.
--
-- Deleted in batches of three because guard_bulk_delete caps a single DELETE on
-- game_worlds at three rows. That cap is the point, so this works with it
-- rather than around it.

do $$
declare
  n_before integer;
  n_after  integer;
begin
  select count(*) into n_before from public.game_worlds where name ~ '^bait-\d+$';

  -- Refuse to touch anything that turns out to hold real content.
  if exists (
    select 1 from public.game_worlds g
    where g.name ~ '^bait-\d+$'
      and (exists (select 1 from public.characters c where c.game_world_id = g.id)
        or exists (select 1 from public.chapters   c where c.game_world_id = g.id)
        or exists (select 1 from public.encounters e where e.game_world_id = g.id))
  ) then
    raise exception 'Refusing to delete: a bait- world holds real content. Inspect it by hand.';
  end if;

  delete from public.game_worlds
   where id in (select id from public.game_worlds where name ~ '^bait-\d+$' order by created_at limit 3);

  delete from public.game_worlds
   where id in (select id from public.game_worlds where name ~ '^bait-\d+$' order by created_at limit 3);

  select count(*) into n_after from public.game_worlds where name ~ '^bait-\d+$';
  if n_after <> 0 then
    raise exception 'Expected to clear all bait- worlds, % remain (of %)', n_after, n_before;
  end if;

  raise notice 'Removed % bait worlds.', n_before;
end $$;
