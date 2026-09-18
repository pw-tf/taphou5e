-- feedback
--
-- Applied to project zlsguyiwwwbyoqxdewsd on 2026-09-18. This directory is the
-- record, not a pending queue -- do not re-run it against that project.
--
-- Bug reports and ideas submitted from the v2 Support menu, reviewed on
-- /analytics.html.
--
-- The access shape is the whole point. Anyone using the app holds only the
-- anon key, and they must be able to SEND a report -- but a table anon could
-- also read would hand every report (including whatever someone typed into the
-- contact box) to anyone with the public key, and a table anon could update or
-- delete could be wiped by the same. So:
--
--   anon / authenticated : INSERT only, and only as unread + unarchived
--   authenticated        : everything else
--
-- There is no owner column to check, so `is_read` and `is_archived` are pinned
-- in the insert policy's WITH CHECK instead: a submitter cannot post a report
-- that arrives pre-read, or pre-archived out of sight.

create table if not exists public.feedback (
    id            uuid primary key default gen_random_uuid(),

    kind          text not null check (kind in ('bug', 'idea', 'other')),
    message       text not null check (length(btrim(message)) between 1 and 4000),
    -- Optional, so a report can stay anonymous. Free text rather than an email
    -- column: people give a Discord handle as readily as an address.
    contact       text check (contact is null or length(btrim(contact)) <= 200),

    -- Context captured by the page. The form says plainly that this travels
    -- with the report; it is what makes a bug reproducible.
    game_world_id uuid references public.game_worlds(id) on delete set null,
    world_name    text check (world_name is null or length(world_name) <= 120),
    role          text check (role is null or role in ('dm', 'player')),
    page          text check (page is null or length(page) <= 300),
    user_agent    text check (user_agent is null or length(user_agent) <= 500),
    viewport      text check (viewport is null or length(viewport) <= 40),
    app_version   text check (app_version is null or length(app_version) <= 20),

    -- Triage. Archiving hides a report from the list without losing it, so a
    -- mis-tap costs nothing.
    is_read       boolean not null default false,
    is_archived   boolean not null default false,
    created_at    timestamptz not null default now(),
    read_at       timestamptz
);

-- The list is "unread first, newest first", filtered to unarchived.
create index if not exists feedback_triage_idx
    on public.feedback (is_archived, is_read, created_at desc);

alter table public.feedback enable row level security;

drop policy if exists feedback_submit on public.feedback;
create policy feedback_submit on public.feedback
    for insert to anon, authenticated
    with check (
        coalesce(is_read, false) = false
        and coalesce(is_archived, false) = false
    );

drop policy if exists feedback_review on public.feedback;
create policy feedback_review on public.feedback
    for all to authenticated
    using ((select auth.uid()) is not null)
    with check ((select auth.uid()) is not null);

-- An insert-only table open to the anon key is a spam target. There is no user
-- to rate-limit against, so this limits by origin world (and lumps all
-- world-less submissions together), which is the most identity a report has.
-- security definer because the inserting role cannot read the table to count.
create or replace function private.feedback_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
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

    return new;
end;
$$;

drop trigger if exists feedback_rate_limit on public.feedback;
create trigger feedback_rate_limit
    before insert on public.feedback
    for each row execute function private.feedback_rate_limit();

comment on table public.feedback is
    'Bug reports and ideas from the v2 Support menu. Insert-only for the anon key; reading, marking read and archiving require an authenticated session.';
