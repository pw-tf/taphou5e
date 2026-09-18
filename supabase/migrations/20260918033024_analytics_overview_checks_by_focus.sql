-- analytics_overview()
--
-- Applied to project zlsguyiwwwbyoqxdewsd on 2026-09-18. This directory is the
-- record, not a pending queue -- do not re-run it against that project.
--
-- The campaign layer (campaigns, chapters, chapter_beats, campaign_checks,
-- areas, npcs, campaign_monsters, encounters, encounter_combatants,
-- campaign_sessions, dm_notes) is dm_all: a client holding only the anon key
-- sees nothing, by design. The owner dashboard at /analytics.html needs global
-- numbers across every world, so this function reads them as the definer and
-- returns COUNTS ONLY -- no names, no summaries, no read-aloud text, no DM
-- notes, no world secrets. Nothing it returns would tell a caller what any DM
-- actually wrote.
--
-- Access: execute is granted to `authenticated` alone (never anon or public),
-- and the body re-checks auth.uid() so a mis-grant cannot open it up.
--
-- Supersedes 20260918032350_analytics_overview_aggregates, which grouped checks
-- on `ability` alone. A skill check stores skill_name and leaves ability null,
-- so that reported 11 of 12 checks as "unset"; `checks_by_focus` takes whichever
-- column carries what the DM actually calls for.

create or replace function public.analytics_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
    result jsonb;
begin
    if auth.uid() is null then
        raise exception 'analytics_overview requires an authenticated session'
            using errcode = '42501';
    end if;

    with per_world as (
        select
            g.id,
            (select count(*) from campaigns c where c.game_world_id = g.id) as campaigns,
            (select count(*) from campaigns c where c.game_world_id = g.id
                 and not coalesce(c.is_default, false))                     as authored_campaigns,
            (select count(*) from chapters x where x.game_world_id = g.id)  as chapters,
            (select count(*) from chapter_beats x where x.game_world_id = g.id) as beats,
            (select count(*) from campaign_checks x where x.game_world_id = g.id) as checks,
            (select count(*) from areas x where x.game_world_id = g.id)     as areas,
            (select count(*) from npcs x where x.game_world_id = g.id)      as npcs,
            (select count(*) from campaign_monsters x where x.game_world_id = g.id) as monsters,
            (select count(*) from encounters x where x.game_world_id = g.id) as encounters,
            (select count(*) from campaign_sessions x where x.game_world_id = g.id) as sessions,
            (select count(*) from dm_notes x where x.game_world_id = g.id)  as notes
        from game_worlds g
    )
    select jsonb_build_object(
        'generated_at', now(),

        'totals', jsonb_build_object(
            'campaigns',            (select count(*) from campaigns),
            -- Every world is created with a default campaign, so a raw count
            -- reads as adoption and means nothing. This is the real number.
            'authored_campaigns',   (select count(*) from campaigns where not coalesce(is_default, false)),
            'chapters',             (select count(*) from chapters),
            'beats',                (select count(*) from chapter_beats),
            'checks',               (select count(*) from campaign_checks),
            'areas',                (select count(*) from areas),
            'npcs',                 (select count(*) from npcs),
            'monsters',             (select count(*) from campaign_monsters),
            'encounters',           (select count(*) from encounters),
            'combatants',           (select count(*) from encounter_combatants),
            'sessions',             (select count(*) from campaign_sessions),
            'notes',                (select count(*) from dm_notes),
            'party_links',          (select count(*) from campaign_characters),
            'shared_encounters',    (select count(*) from shared_encounters)
        ),

        'campaigns_by_status', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(status), ''), 'unset') k, count(*) n
            from campaigns group by 1) s),

        'chapters_by_status', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(status), ''), 'unset') k, count(*) n
            from chapters group by 1) s),

        'beats_by_status', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(status), ''), 'unset') k, count(*) n
            from chapter_beats group by 1) s),

        'checks_by_type', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(check_type), ''), 'unset') k, count(*) n
            from campaign_checks group by 1) s),

        -- Whatever the check is called for: the skill when there is one, the
        -- bare ability otherwise.
        'checks_by_focus', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(skill_name), ''), nullif(trim(ability), ''), 'unset') k, count(*) n
            from campaign_checks group by 1) s),

        'checks', jsonb_build_object(
            'group',        (select count(*) from campaign_checks where is_group_check),
            'secret',       (select count(*) from campaign_checks where is_secret),
            'repeatable',   (select count(*) from campaign_checks where is_repeatable),
            'with_success', (select count(*) from campaign_checks where coalesce(trim(success_text), '') <> ''),
            'with_failure', (select count(*) from campaign_checks where coalesce(trim(failure_text), '') <> ''),
            'avg_dc',       (select round(avg(dc)::numeric, 1) from campaign_checks where dc is not null),
            'min_dc',       (select min(dc) from campaign_checks),
            'max_dc',       (select max(dc) from campaign_checks)
        ),

        'npcs_by_disposition', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(disposition), ''), 'unset') k, count(*) n
            from npcs group by 1) s),

        'npcs_by_status', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(status), ''), 'unset') k, count(*) n
            from npcs group by 1) s),

        'areas_by_type', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(area_type), ''), 'unset') k, count(*) n
            from areas group by 1) s),

        'monsters_by_source', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(source), ''), 'unset') k, count(*) n
            from campaign_monsters group by 1) s),

        'monsters_by_cr', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select case
                     when challenge_rating is null then 'unset'
                     when challenge_rating < 1 then 'under 1'
                     when challenge_rating <= 4 then '1-4'
                     when challenge_rating <= 10 then '5-10'
                     when challenge_rating <= 16 then '11-16'
                     else '17+'
                   end k,
                   count(*) n
            from campaign_monsters group by 1) s),

        'encounters_by_status', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(status), ''), 'unset') k, count(*) n
            from encounters group by 1) s),

        'encounters_by_difficulty', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(difficulty), ''), 'unset') k, count(*) n
            from encounters group by 1) s),

        'combatants_by_type', (select coalesce(jsonb_object_agg(k, n), '{}'::jsonb) from (
            select coalesce(nullif(trim(combatant_type), ''), 'unset') k, count(*) n
            from encounter_combatants group by 1) s),

        -- How much of the authored material the party has actually been shown.
        'reveals', jsonb_build_object(
            'chapters_revealed', (select count(*) from chapters where is_revealed),
            'beats_revealed',    (select count(*) from chapter_beats where is_revealed),
            'areas_discovered',  (select count(*) from areas where is_discovered),
            'npcs_known',        (select count(*) from npcs where is_known_to_players),
            'sessions_published',(select count(*) from campaign_sessions where is_published)
        ),

        'sharing', jsonb_build_object(
            'total',   (select count(*) from shared_encounters),
            'live',    (select count(*) from shared_encounters where expires_at > now()),
            'imports', (select coalesce(sum(import_count), 0) from shared_encounters)
        ),

        -- Keyed by game_world_id so the page can join to the world names it
        -- already reads directly. Counts only; no world content crosses here.
        'worlds', (select coalesce(jsonb_agg(jsonb_build_object(
                'id',                 id,
                'campaigns',          campaigns,
                'authored_campaigns', authored_campaigns,
                'chapters',           chapters,
                'beats',              beats,
                'checks',             checks,
                'areas',              areas,
                'npcs',               npcs,
                'monsters',           monsters,
                'encounters',         encounters,
                'sessions',           sessions,
                'notes',              notes
            )), '[]'::jsonb) from per_world)
    ) into result;

    return result;
end;
$$;

revoke all on function public.analytics_overview() from public, anon;
grant execute on function public.analytics_overview() to authenticated;

comment on function public.analytics_overview() is
    'Owner dashboard aggregates for the DM-only campaign layer. Returns counts only -- never names, notes, read-aloud text or secrets. Authenticated callers only.';
