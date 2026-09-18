# Campaign Layer — Schema & Security Design

**Status:** Proposal for review. No database changes have been applied.
**Target project:** `zlsguyiwwwbyoqxdewsd` (DnD Players)
**Revision:** 2 — incorporates decisions on HP ownership, world-locked characters, DM secret protection, and version coexistence.

---

## 1. Goal

A campaign layer between a game world and its content, so a DM opens a world, picks a campaign, and
finds its chapters, areas, NPCs, monsters, encounters and party under one roof.

```
World  ──▶  Campaign  ──▶  Chapters · Areas · NPCs · Monsters · Encounters · Party
```

## 2. Decisions locked

| # | Decision | Effect |
|---|---|---|
| 1 | PC hit points read through to `characters` | `encounter_combatants` stores no HP for player characters (§6.1) |
| 2 | **Characters never leave their world** | Enforced declaratively by composite foreign key, not convention (§6.2) |
| 3 | **Real protection for DM secrets** | Token-based DM sessions + row level security. Requires one scoped exception to the additive rule (§5) |
| 4 | Keep `campaign_sessions` | Rationale in §4.9 |
| 5 | Backfill campaign name: `Main Campaign`, seeded from the world description | §7 |

## 3. Current state (measured)

- 191 game worlds, all active. 264 characters, **0 with a null `game_world_id`**.
- 18 distinct skill names, one full set per character.
- Encounters have no persistence: state is `localStorage['mt_encounter_state']`, stat blocks come live
  from `dnd5eapi.co`. The encounter tables are net-new.
- Every table's policy is `FOR ALL TO public USING (true)`. The client ships the anon key.
- PINs are unsalted client-side SHA-256, stored in `game_worlds.dm_pin_hash` / `player_pin_hash`,
  and those columns are readable by anyone. **A 4-digit PIN has 10,000 possible values — the hash
  is reversible by lookup.** This is the load-bearing problem for decision 3.
- `pgcrypto` 1.3 is installed in the `extensions` schema.

---

## 4. New tables

> Created in dependency order: `campaigns` → `campaign_characters` → `areas` → `campaign_monsters`
> → `chapters` → `chapter_beats` → `npcs` → `encounters` → `encounter_combatants` →
> `campaign_sessions` → `campaign_checks` → `dm_notes`.

Two conventions run through every table below:

1. **Every campaign-owned table carries `game_world_id`**, tied to its parent by composite foreign key.
   This makes the security policy a single indexed column comparison, and makes drift structurally
   impossible rather than merely discouraged.
2. **No table has a `dm_notes` column.** All DM prose lives in one protected table (§5.4). Secret
   *rows* are handled by reveal flags; secret *prose* is handled by that table.

### 4.1 `campaigns`

```sql
create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  game_world_id  uuid not null references public.game_worlds(id) on delete cascade,
  name           text not null,
  summary        text,                      -- player-facing
  status         text not null default 'active'
                 check (status in ('planning','active','paused','completed','archived')),
  is_default     boolean not null default false,
  sort_order     integer not null default 0,
  started_at     date,
  ended_at       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (game_world_id, name),
  unique (id, game_world_id)               -- composite FK target for children
);
create index on public.campaigns (game_world_id);
```

### 4.2 `campaign_characters` — world-locked many-to-many

Decision 2 is enforced here, declaratively:

```sql
-- Composite FK targets (both are redundant-but-required; id is already unique)
alter table public.characters add constraint characters_id_world_uniq unique (id, game_world_id);

create table public.campaign_characters (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null,
  character_id  uuid not null,
  game_world_id uuid not null,
  status        text not null default 'active'
                check (status in ('active','inactive','retired','dead','guest')),
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  created_at    timestamptz not null default now(),
  unique (campaign_id, character_id),
  foreign key (campaign_id,  game_world_id) references public.campaigns(id, game_world_id)  on delete cascade,
  foreign key (character_id, game_world_id) references public.characters(id, game_world_id) on delete cascade
);
create index on public.campaign_characters (campaign_id);
create index on public.campaign_characters (character_id);
```

Because both foreign keys share the same `game_world_id` column, **a character physically cannot be
attached to a campaign in another world.** No trigger, no application check, no way around it.

Two consequences worth knowing:

- A character with a null `game_world_id` can't join any campaign (the composite FK finds no match).
  There are none today, and that's the correct behaviour anyway.
- Joining/leaving a campaign is now purely additive — it never touches `characters.game_world_id`,
  so **v1's roster stays complete and correct at all times.** This is what makes coexistence safe
  rather than merely tolerable (§8).

### 4.3 `areas`

```sql
create table public.areas (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null,
  game_world_id  uuid not null,
  parent_area_id uuid references public.areas(id) on delete set null,
  name           text not null,
  area_type      text not null default 'location'
                 check (area_type in ('region','settlement','dungeon','landmark','building','plane','location','other')),
  description    text,                      -- player-facing
  read_aloud     text,                      -- boxed text
  map_url        text,
  is_discovered  boolean not null default false,   -- reveal flag
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, game_world_id),
  foreign key (campaign_id, game_world_id) references public.campaigns(id, game_world_id) on delete cascade
);
create index on public.areas (campaign_id);
create index on public.areas (parent_area_id);
```

`parent_area_id` gives nesting — Region ▸ City ▸ Tavern — without a separate hierarchy table.

### 4.4 `campaign_monsters`

```sql
create table public.campaign_monsters (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null,
  game_world_id     uuid not null,
  name              text not null,
  source            text not null check (source in ('srd_api','homebrew')),
  api_index         text,                   -- dnd5eapi index, e.g. 'goblin'
  statblock         jsonb,                  -- full block (homebrew) or overrides only (srd_api)
  challenge_rating  numeric,
  creature_type     text,
  size              text,
  armor_class       integer,
  max_hit_points    integer,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, game_world_id),
  foreign key (campaign_id, game_world_id) references public.campaigns(id, game_world_id) on delete cascade,
  constraint campaign_monsters_source_shape check (
    (source = 'srd_api'  and api_index is not null) or
    (source = 'homebrew' and statblock is not null)
  )
);
create index on public.campaign_monsters (campaign_id);
```

`armor_class`, `max_hit_points` and `challenge_rating` are denormalised so the encounter builder can
sort and budget without unpacking JSON or calling the external API. For SRD monsters, `statblock`
holds **only overrides** (an elite variant, buffed HP), keeping the SRD out of your database.

### 4.5 `chapters` and `chapter_beats`

```sql
create table public.chapters (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null,
  game_world_id   uuid not null,
  title           text not null,
  player_summary  text,                     -- what the party knows
  body            text,                     -- freeform DM-facing markdown
  status          text not null default 'planned'
                  check (status in ('planned','active','completed','abandoned')),
  is_revealed     boolean not null default false,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, game_world_id),
  foreign key (campaign_id, game_world_id) references public.campaigns(id, game_world_id) on delete cascade
);

create table public.chapter_beats (
  id            uuid primary key default gen_random_uuid(),
  chapter_id  uuid not null,
  game_world_id uuid not null,
  area_id       uuid references public.areas(id) on delete set null,
  title         text not null,
  body          text,                       -- freeform
  read_aloud    text,
  status        text not null default 'pending'
                check (status in ('pending','in_progress','completed','skipped')),
  is_revealed   boolean not null default false,
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, game_world_id),
  foreign key (chapter_id, game_world_id) references public.chapters(id, game_world_id) on delete cascade
);
```

`is_revealed` is deliberately separate from `status`: a beat can be *completed* and still secret
(the party never learned who was behind it), or *pending* and already revealed (a prophecy).
Overloading `status` for visibility would conflate two independent axes.

### 4.6 `campaign_checks` — structured check / saving throw requirements

Attachable to a beat, area, NPC or encounter — exactly one. **Entirely DM-only** (§5.3): a DC the
players can read is not a DC.

```sql
create table public.campaign_checks (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null,
  game_world_id      uuid not null,
  chapter_beat_id  uuid references public.chapter_beats(id) on delete cascade,
  area_id            uuid references public.areas(id) on delete cascade,
  npc_id             uuid references public.npcs(id) on delete cascade,
  encounter_id       uuid references public.encounters(id) on delete cascade,
  label              text not null,          -- "Spot the tripwire"
  check_type         text not null
                     check (check_type in ('ability_check','skill_check','saving_throw','contested')),
  ability            text check (ability in ('str','dex','con','int','wis','cha')),
  skill_name         text,                   -- matches public.skills.skill_name vocabulary
  dc                 integer not null check (dc between 1 and 40),
  success_text       text,
  failure_text       text,
  is_group_check     boolean not null default false,
  is_secret          boolean not null default false,   -- DM rolls on the party's behalf
  is_repeatable      boolean not null default false,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  foreign key (campaign_id, game_world_id) references public.campaigns(id, game_world_id) on delete cascade,
  constraint campaign_checks_one_parent check (
    num_nonnulls(chapter_beat_id, area_id, npc_id, encounter_id) = 1
  ),
  constraint campaign_checks_shape check (
    (check_type = 'skill_check' and skill_name is not null) or
    (check_type in ('ability_check','saving_throw') and ability is not null) or
    (check_type = 'contested')
  )
);
create index on public.campaign_checks (campaign_id);
```

`skill_name` reuses the exact 18-value vocabulary already in `public.skills` (Acrobatics … Survival),
so a check resolves straight against a character's proficiency and expertise rows — no lookup table.

### 4.7 `npcs`

```sql
create table public.npcs (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null,
  game_world_id        uuid not null,
  area_id              uuid references public.areas(id) on delete set null,
  monster_id           uuid references public.campaign_monsters(id) on delete set null,  -- optional stat block
  name                 text not null,
  title                text,                 -- "Harbourmaster of Sel"
  faction              text,
  description          text,                 -- player-facing
  disposition          text not null default 'neutral'
                       check (disposition in ('friendly','neutral','hostile','unknown')),
  status               text not null default 'alive'
                       check (status in ('alive','dead','missing','unknown')),
  is_known_to_players  boolean not null default false,
  portrait_url         text,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, game_world_id),
  foreign key (campaign_id, game_world_id) references public.campaigns(id, game_world_id) on delete cascade
);
```

A shopkeeper stays three fields. A villain gets `monster_id` set and drops straight into an encounter.

### 4.8 `encounters` and `encounter_combatants`

```sql
create table public.encounters (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null,
  game_world_id        uuid not null,
  area_id              uuid references public.areas(id) on delete set null,
  chapter_beat_id    uuid references public.chapter_beats(id) on delete set null,
  name                 text not null,
  description          text,
  read_aloud           text,
  difficulty           text check (difficulty in ('trivial','easy','medium','hard','deadly')),
  status               text not null default 'planned'
                       check (status in ('planned','active','completed','abandoned')),
  round                integer not null default 0,
  active_combatant_id  uuid,                 -- FK added after encounter_combatants exists
  hide_monster_hp      boolean not null default true,   -- see note below
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (id, game_world_id),
  foreign key (campaign_id, game_world_id) references public.campaigns(id, game_world_id) on delete cascade
);

create table public.encounter_combatants (
  id                   uuid primary key default gen_random_uuid(),
  encounter_id         uuid not null,
  game_world_id        uuid not null,
  combatant_type       text not null check (combatant_type in ('monster','npc','character')),
  campaign_monster_id  uuid references public.campaign_monsters(id) on delete set null,
  npc_id               uuid references public.npcs(id) on delete set null,
  character_id         uuid references public.characters(id) on delete cascade,
  display_name         text not null,        -- "Goblin 2"
  initiative           integer,
  armor_class          integer,
  max_hit_points       integer,              -- null for characters (decision 1)
  current_hit_points   integer,              -- null for characters (decision 1)
  temporary_hit_points integer,
  conditions           text[] not null default '{}',
  concentrating_on     text,
  is_defeated          boolean not null default false,
  has_acted            boolean not null default false,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  foreign key (encounter_id, game_world_id) references public.encounters(id, game_world_id) on delete cascade,
  constraint encounter_combatants_one_ref check (
    num_nonnulls(campaign_monster_id, npc_id, character_id) = 1
  ),
  -- Decision 1: player character HP lives on the character record, nowhere else
  constraint encounter_combatants_pc_hp_passthrough check (
    combatant_type <> 'character' or (max_hit_points is null and current_hit_points is null)
  )
);

alter table public.encounters
  add constraint encounters_active_combatant_fkey
  foreign key (active_combatant_id)
  references public.encounter_combatants(id) on delete set null;
```

`round`, `initiative`, `has_acted` and `active_combatant_id` are what make combat survive a refresh
or a device switch.

`hide_monster_hp` exists because players can read *active* encounters (§5.3) in order to see the
initiative order. Defaulting it to true keeps monster HP a DM-side detail; the app should omit those
columns from player queries when it is set.

### 4.9 `campaign_sessions` — keeping it

You left this to me: **keep it.** Without it, session recaps end up crammed into a chapter beat,
where they fight with the beat's own body text and break the ordering of the story. It's one cheap
table that nothing else depends on, and "maintaining campaigns" is most of what a DM actually does
between games.

```sql
create table public.campaign_sessions (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null,
  game_world_id  uuid not null,
  session_number integer,
  title          text,
  played_on      date,
  recap          text,                       -- player-facing once published
  is_published   boolean not null default false,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, game_world_id),
  foreign key (campaign_id, game_world_id) references public.campaigns(id, game_world_id) on delete cascade
);
```

---

## 5. DM secret protection (decision 3)

### 5.1 Why the current model can't carry this

Row level security can only distinguish callers that *are* distinguishable. Today every request
carries the same anon key, so Postgres sees DM and player as identical — no policy can separate them.

Worse, the PIN itself is not a secret: `dm_pin_hash` is an unsalted SHA-256 over a 10,000-value
space, stored in a world-readable table. Anyone can fetch it and recover the PIN by lookup.

So decision 3 needs two things: **a per-request DM identity**, and **a PIN hash nobody can read.**

### 5.2 Mechanism: request-scoped DM tokens

```sql
create table public.dm_sessions (
  token_hash    bytea primary key,
  game_world_id uuid not null references public.game_worlds(id) on delete cascade,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default now() + interval '12 hours'
);
alter table public.dm_sessions enable row level security;
-- no policies: unreachable via the API by design
revoke all on public.dm_sessions from anon, authenticated;

create or replace function public.current_dm_world()
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
```

The client obtains a token from a `security definer` login function and sets it as a header:

```js
createClient(URL, ANON_KEY, { global: { headers: { 'x-dm-token': token } } })
```

PostgREST exposes request headers as `request.headers`, so policies can read the token without any
change to how the app queries tables — `.from('npcs').select()` keeps working, it just returns
different rows depending on whether a valid token is present.

### 5.3 Policy shape

Applied to every new table. The `(select …)` wrapper matters: it makes Postgres evaluate the token
lookup **once per statement** instead of once per row.

```sql
-- DM: full access to their own world
create policy dm_all on public.npcs for all to public
  using      (game_world_id = (select public.current_dm_world()))
  with check (game_world_id = (select public.current_dm_world()));

-- Players: read only what has been revealed
create policy player_read on public.npcs for select to public
  using (is_known_to_players);
```

Per-table player read predicates:

| Table | Players may read | Players may write |
|---|---|---|
| `campaigns` | all rows (name/summary only — no secrets remain on this table) | no |
| `campaign_characters` | all rows | no |
| `areas` | `is_discovered` | no |
| `chapters` | `is_revealed` | no |
| `chapter_beats` | `is_revealed` | no |
| `npcs` | `is_known_to_players` | no |
| `campaign_sessions` | `is_published` | no |
| `encounters` | `status = 'active'` | no |
| `encounter_combatants` | those of an active encounter | no |
| `campaign_monsters` | **nothing** | no |
| `campaign_checks` | **nothing** | no |
| `dm_notes` | **nothing** | no |

Multiple permissive policies OR together, so a DM token grants full access while the player predicate
independently grants the revealed subset. Writes are DM-only across the board — player character HP
continues to be written through the existing wide-open character tables, so nothing in v1 changes.

### 5.4 `dm_notes` — one protected home for DM prose

Rather than a `dm_notes` column on seven tables (which row level security cannot protect — RLS is
row-level, and column grants can't vary by token), all DM prose lives in one table that players
simply cannot reach.

```sql
create table public.dm_notes (
  id                  uuid primary key default gen_random_uuid(),
  game_world_id       uuid not null references public.game_worlds(id) on delete cascade,
  campaign_id         uuid references public.campaigns(id)          on delete cascade,
  area_id             uuid references public.areas(id)              on delete cascade,
  chapter_id        uuid references public.chapters(id)         on delete cascade,
  chapter_beat_id   uuid references public.chapter_beats(id)    on delete cascade,
  npc_id              uuid references public.npcs(id)               on delete cascade,
  encounter_id        uuid references public.encounters(id)         on delete cascade,
  campaign_session_id uuid references public.campaign_sessions(id)  on delete cascade,
  body                text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint dm_notes_one_parent check (
    num_nonnulls(campaign_id, area_id, chapter_id, chapter_beat_id,
                 npc_id, encounter_id, campaign_session_id) = 1
  )
);
alter table public.dm_notes enable row level security;
create policy dm_only on public.dm_notes for all to public
  using      (game_world_id = (select public.current_dm_world()))
  with check (game_world_id = (select public.current_dm_world()));
```

Real foreign keys per parent type (rather than a generic `entity_type`/`entity_id` pair) mean
deleting an NPC takes its notes with it, instead of leaving orphans behind.

The cost is one extra query per screen (`select * from dm_notes where npc_id = any(...)`), which is
negligible against the benefit: DM secrets are unreadable without a valid token, full stop.

### 5.5 Relocating the PIN hashes — the one exception to the additive rule

The token scheme is worthless while the PIN it's derived from is recoverable. So:

```sql
create table public.game_world_secrets (
  game_world_id   uuid primary key references public.game_worlds(id) on delete cascade,
  dm_pin_hash     text not null,
  player_pin_hash text not null
);
alter table public.game_world_secrets enable row level security;
-- no policies, no grants: reachable only from security definer functions
revoke all on public.game_world_secrets from anon, authenticated;

insert into public.game_world_secrets (game_world_id, dm_pin_hash, player_pin_hash)
select id, dm_pin_hash, player_pin_hash from public.game_worlds;

alter table public.game_worlds drop column dm_pin_hash, drop column player_pin_hash;
```

Login and world creation move into `security definer` functions that verify server-side and never
return a hash:

- `public.world_login(world_name text, pin_hash text) returns json` — returns `{ role, game_world_id, dm_token? }`.
  A DM token is minted only when the hash matches `dm_pin_hash`.
- `public.world_create(name text, description text, leveling_mode text, dm_pin_hash text, player_pin_hash text) returns json`

**Rate limiting is mandatory, not optional.** A 4-digit PIN is 10,000 guesses; without throttling,
moving verification server-side just relocates the brute force. The login function must record
failed attempts per world and back off — a `pin_attempts (game_world_id, attempted_at, ip)` table,
with lockout after N failures in a window, reading the caller address from
`request.headers ->> 'x-forwarded-for'`.

**What this costs in v1:** `login.js` only. Its two call sites (join at line ~267, create at ~373)
swap a `.from('game_worlds').select('*')` plus client-side hash comparison for a single `.rpc()` call.
The user-facing flow is identical. `app.js`, `characters.html`, `monster-tracker.html` and
`sidemenu.js` are untouched — notably `app.js:540`'s `select('*')` keeps working, because the hash
columns are gone from that table rather than merely revoked. (Revoking column privileges instead
would have broken that `select('*')`, which is why relocation is the better shape.)

**Two pre-existing holes this does not close**, worth a follow-up: `game_worlds` still accepts
UPDATE and DELETE from anyone, and the 11 character tables remain fully open. Neither is new, and
neither is made worse by this design.

### 5.6 Cutover — complete (2026-09-16)

Decision 3 is in effect. `game_worlds.dm_pin_hash` and `player_pin_hash` are **dropped**; the hashes
live only in `game_world_secrets`, which has no policies and no grants:

| Table | anon privileges | policies |
|---|---|---|
| `game_world_secrets` | NONE | 0 |
| `dm_sessions` | NONE | 0 |
| `pin_attempts` | NONE | 0 |

The transition scaffolding is gone: `sync_game_world_secrets_trg` and its function were dropped in the
same transaction as the columns, and `world_create` was rewritten first — in that same transaction —
so it writes `game_world_secrets` directly instead of the columns it used to fill. There was never a
moment where creation was broken.

Verified after the drop, against a throwaway world: creation, DM login, player login, wrong PIN, the
secrets row landing without a trigger to place it, and the default campaign still being created.
Final state: 191 worlds, 191 secrets rows, 0 missing secrets, 0 missing campaigns, 264 characters,
264 memberships, no test data left behind.

**What this does and does not fix.** DM PINs are no longer recoverable by looking up a readable hash,
and DM-only campaign content is unreadable without a valid token. Two pre-existing holes remain,
neither new nor worsened: `game_worlds` still accepts UPDATE and DELETE from anyone, and the 11
character tables are still fully open. See §12.

### 5.6a Default campaign for new worlds

The §7 backfill covered the 191 worlds that existed when it ran, but nothing gave a campaign to
worlds created afterwards -- so a newly created world would land in v2 with an empty campaign list
while every older world had one.

Fixed with an `after insert` trigger on `game_worlds` rather than inside `world_create`, so it covers
**every** creation path: the new RPC, and the old client's direct insert, which main still uses for as
long as the transition lasts.

```sql
create trigger ensure_default_campaign_trg
after insert on public.game_worlds
for each row execute function public.ensure_default_campaign();
```

Unlike the PIN sync trigger, this one is permanent -- it is not transition scaffolding.

### 5.7 Cutover checklist

1. ✅ `game_world_secrets` created and populated, sync trigger live
2. ✅ `world_login` / `world_create` created, rate limited, round-trip tested
3. ✅ New `login.js` written to the branch
4. ✅ Deployed to GitHub Pages from the branch
5. ✅ Verified live: DM login, player login, wrong PIN, and world creation
6. ✅ Merged to main (PR #12); every `.js`/`.html` on main swept for the old column reads — zero hits
7. ✅ Columns, sync trigger and function dropped; `world_create` rewritten; re-verified after

---

## 6. Resolved design tensions

### 6.1 Player character HP — resolved: read through

`encounter_combatants` stores no HP for `combatant_type = 'character'`; the tracker reads and writes
`characters.current_hit_points` directly, exactly as v1 does. Enforced by the
`encounter_combatants_pc_hp_passthrough` check constraint in §4.8.

Monsters and NPCs use the local columns, since they have nowhere else to live. The cost is one extra
write path in the tracker. The benefit is that v1 and v2 can never disagree about whether a player
character is alive — which matters a great deal while both versions are live.

### 6.2 Cross-world transfer — resolved: structurally impossible

Characters exist within a world and may join or leave campaigns inside that world only. Enforced by
the shared `game_world_id` in `campaign_characters`' two composite foreign keys (§4.2) — not by
application logic that a future refactor could quietly drop.

### 6.3 DM secrets — resolved: §5 in full.

---

## 7. Backfill migration

No orphan characters and no possible name collision (`unique (game_world_id, name)` is per-world).

```sql
-- 1. One default campaign per world (191 rows)
insert into public.campaigns (game_world_id, name, summary, status, is_default)
select gw.id, 'Main Campaign', gw.description, 'active', true
from public.game_worlds gw;

-- 2. Attach every character to its world's default campaign (264 rows)
insert into public.campaign_characters (campaign_id, character_id, game_world_id, status)
select c.id, ch.id, ch.game_world_id, 'active'
from public.campaigns c
join public.characters ch on ch.game_world_id = c.game_world_id
where c.is_default;
```

Verification:

```sql
select
  (select count(*) from campaigns where is_default)        as default_campaigns,  -- expect 191
  (select count(*) from campaign_characters)               as memberships,        -- expect 264
  (select count(*) from characters ch
     where not exists (select 1 from campaign_characters cc
                       where cc.character_id = ch.id))     as unattached;         -- expect 0
```

Rollback is `drop table … cascade` on the new tables, plus re-adding the two PIN columns from
`game_world_secrets` and reverting `login.js`. Nothing else in v1 is touched by this migration.

---

## 8. Backward-compatibility contract

Must not change while v1 is available:

- `characters.game_world_id` — v1's roster depends on it. Campaign membership never writes to it.
- `characters.current_hit_points` / `temporary_hit_points` / `death_save_*` — v1 writes these directly.
- `game_worlds.name`, `description`, `is_active`, `leveling_mode` — v1 login and DM panel.
- All 11 character sub-tables keep their `character_id` foreign key shape.
- The `dnd-session` localStorage shape `{gameWorldId, gameWorldName, role, timestamp}` — v2 should
  **extend** it (adding `campaignId`, `dmToken`) rather than replace it, so a user moving between
  versions stays logged in.

Changing exactly once, for decision 3: `game_worlds.dm_pin_hash` and `player_pin_hash` relocate to
`game_world_secrets`, and `login.js` moves to RPC-based login (§5.5).

---

## 9. Running v1 and v2 side by side

### 9.1 Layout — v2 lives under /v2/

The Ember handoff reuses v1's filenames (`index.html`, `characters.html`, `monster-tracker.html`),
so v2 is namespaced to keep every one of them free:

```
/index.html             v1 login + router      (v1 file, one small addition)
/characters.html        v1                     (frozen)
/monster-tracker.html   v1                     (frozen)
/app.js /styles.css …   v1                     (frozen)

/v2/index.html          hub (Ember)
/v2/login.html          login (Ember)
/v2/characters.html     world roster
/v2/campaigns.html      campaigns
/v2/character-sheet.html
/v2/monster-tracker.html
/v2/dm-panel.html
/v2/tokens.css /v2/ember.css /v2/theme.js
```

This matters more than it looks. Frozen `sidemenu.js` hard-codes `window.location.href = 'index.html'`
on logout, and the PWA `start_url` plus every existing bookmark points at the same root paths. Had v2
taken those filenames, v1's logout would land on the new hub and the fallback would be unreachable.

Beyond the `login.js` change §5.5 forces and a small router snippet in `index.html`, **no v1 file is
edited.** A fallback you have been modifying is not a fallback — every edit is a chance to regress the
thing people fell back to.

### 9.2 v1 keeps its current appearance

The handoff's step 1 is "swap the `:root` block in styles.css", which would re-theme v1 wholesale.
**We are not doing that.** `tokens.css` and `ember.css` are loaded by `/v2/` pages only; v1 keeps its
blue-on-zinc palette untouched.

The visual difference is a feature, not an oversight: when someone reports a bug, the screenshot says
immediately which version they were on.

### 9.3 Routing

```
index.html
  ├─ read localStorage['taphou5e-ui']
  ├─ login as today
  └─ on success:
       'classic' → characters.html
       'next'    → /v2/
       unset     → characters.html, plus a one-time dismissible "Try the new layout" card
```

Three properties matter more than the mechanism:

1. **Dismissible card, not a blocking modal.** A modal in front of a DM mid-session taxes everyone to
   serve the curious.
2. **The switch is two-way and permanent**, in the side menu on both versions. Anyone who tries v2 and
   dislikes it must be one tap from classic, or they will not try it at all.
3. **`classic` stays the default for unchosen users during rollout**, flipping to `next` once v2 is
   proven. That ordering makes a v2 bug an opt-in problem rather than an incident across 191 worlds.

Two independent localStorage keys, no collision: `taphou5e-ui` (version) and `taphou5e-theme` (Ember's
own, from `theme.js`). Both versions read the same `dnd-session` key, so switching never logs anyone out.

### 9.3a The invite, and the second classic edit

The router in §9.3 only acts for people who have already opted in, which left
nobody a way to find out v2 exists. `v2-invite.js` is the offer.

It is the **second and last** change to the frozen classic version, after the
`login.js` PIN cutover. The footprint is deliberately one file plus one script
tag on each of two pages: it touches no `app.js` state, adds one namespaced
global, and reuses the classic modal markup so it looks native rather than
bolted on. Deleting the file and the two tags removes it completely.

**Where it appears.** Two screens, because there are two ways into the classic
app: the login page for someone signing in, and the character page's home
screen for someone whose session is still valid and who therefore never sees a
login page at all.

**What it waits for.** On the character page it watches for the home screen to
actually become visible rather than firing on load. That means it never appears
over the redirect to the login page when a session has expired, and never over
a character sheet restored from the last visit — someone opening a character is
mid-task. If the home screen never appears, it gives up after fifteen seconds
rather than firing over whatever the person ended up on.

**What each answer means.**

| Answer | Stored | Effect |
|---|---|---|
| Try it | `taphou5e-ui = next` | The router takes over from now on; v2's side menu is the way back |
| Not now | `taphou5e-invite = <now>` | Asked again after seven days |
| Not now, with the box ticked | `taphou5e-invite = never` | Never asked again |
| Tapping away or Escape | as "Not now" | Honours the checkbox if it was ticked first |

Dismissing deliberately does **not** write `taphou5e-ui = classic`: choosing
classic is a decision, and "not now" is not one. A corrupt timestamp in
`taphou5e-invite` falls through to asking rather than wedging the prompt off
forever.

**The handoff carries a DM's session.** `dnd-session` is shared, so accepting
the invite lands a DM in v2 already signed in. v1 stores `dmToken` but not
`dmTokenIssued`; `dmTokenExpired()` falls back to `session.timestamp`, which v1
does store, so a DM whose token has aged out still gets told rather than
silently seeing empty campaign data.

### 9.3b Switching, and the shared look

The prompt (§9.3a) is the offer; these are the doors that stay open after it
has been answered or turned off.

- **The classic sidebar** carries "Switch to V2.0" on both pages that have a
  side menu.
- **The classic login** carries a button under the form.

Both go through `Taphou5eInvite.switchToV2()`, so the storage key is written in
one place and cannot drift. `sidemenu.js` falls back to the same two lines
inline, because it also loads on pages where the invite file might not.

The prompt's copy now leads with **"TAPHOU5E V2.0 now available!"** over a short
list of what is new, rather than a paragraph.

**The logo.** The mark sits beside the wordmark on the v2 login screen, and
again beside it in the sidebar and the mobile drawer. There is deliberately
**no background watermark**: v1 fades the logo behind every page, and it was
tried here, but it reads as noise on a light theme and washes over the accent
button on a dark one. The mark earns its place in the chrome instead.

One thing the classic CSS could take for granted and v2 cannot: **the art is
black on transparent.** v1 only ever renders on a dark shell, so it inverts the
logo to white unconditionally. v2 has a light theme, so the filter is a token
that resolves per theme -- and the selector has to cover *both* an explicit
`data-theme` and the system preference, because `theme.js` **removes** the
attribute for "system". `[data-theme="light"]` alone would never match the most
common case, and the logo would render white on cream.

### 9.4 What each version sees of the other's data

Because of decision 2, this stays simple. A character never leaves its world, so **v1's roster is never
wrong — only less detailed.** A DM can build campaigns, NPCs and encounters in v2 all day and v1 carries
on showing the flat character list it always has.

---

## 10. Navigation model

Campaigns are their own nav item. The world roster stays world-level, and characters are **pulled** from
it into a campaign — which is exactly what `campaign_characters` is (§4.2): an additive membership row
that never touches `characters.game_world_id`.

```
Login (world + PIN)  →  /v2/  hub
  │
  ├─ Overview        — party state, live encounter, DM panel card
  ├─ Characters      — world roster (every character in the world)
  ├─ Campaigns       ← own nav item
  │    └─ Campaign
  │         ├─ Overview     — summary, status, recent sessions
  │         ├─ Party        — pull characters in from the world roster; set status
  │         ├─ Chapters   — beats, with their check requirements
  │         ├─ Areas        — nested tree, descriptions, maps
  │         ├─ NPCs         — lore cards; stat block if attached
  │         ├─ Monsters     — roster: SRD refs + homebrew
  │         └─ Encounters   — this campaign's encounters
  ├─ Encounters      — every encounter in the world, grouped by campaign, live one surfaced
  ├─ Compendium      — SRD browse/search; the write path into campaign Monsters
  └─ DM panel
```

"Pull from world" is the core party gesture: a picker listing world characters not yet in this campaign,
inserting `campaign_characters` rows. Removing is a `left_at` timestamp, not a delete, so a character who
rejoins keeps their history.

**Dice & tools is cut** — removed from the sidebar and from the hub tiles, which drop to 2-up.

Encounters are reachable two ways against one `campaign_id`-owned table: the world-level item lists all
of them grouped by campaign, a campaign's own tab filters to that campaign. Both open the same tracker.

---

## 11. Ember handoff integration

`design_handoff_ember/` is high fidelity and its scope line is explicit: *"visual + layout only. No new
features."* It was written without knowledge of the campaign layer, so it is authoritative on appearance
and silent on everything in §4.

### 11.1 Adopted as-is

- **`tokens.css` is the token source of truth** for `/v2/`. Variable names already match v1's, so the
  Ember pages re-theme rather than being restyled.
- **The single `.hp` component** (§ "The HP bar" in the handoff) replaces all three current bars,
  including the per-hit-point `div.health-segment` loop in `renderMonsters` — a 300 HP creature is
  currently 300 hairline divs.
- **`theme.js`**, `data-theme` on `<html>`, `taphou5e-theme` in localStorage, set before first paint.
- The 900px breakpoint, sidebar/rail/pane shells, and the 1360px content cap replacing the 600px
  `--max-width`.
- `:focus-visible` outlines in the accent colour throughout — the handoff notes the current build has
  no focus ring at all.

### 11.2 What the design does not cover, and needs new work

| Gap | What it needs |
|---|---|
| No campaign screens exist | Campaign list, campaign detail with seven tabs, all built in the Ember component language |
| `<a href="#notes">Campaign notes</a>` is a dead anchor in three pages | Becomes the real DM notes surface, backed by §5.4 |
| No affordance for reveal flags | `is_revealed`, `is_known_to_players`, `is_discovered` each need a DM toggle and a player-side empty state |
| `hide_monster_hp` | Player view of an active encounter must omit monster HP when set (§4.8) |
| No DM/player content distinction | The design shows a role pill only. Every campaign surface needs a "players can see this" state |
| Compendium is a dead anchor | Scoped as the browse/search/homebrew front end for `campaign_monsters` — see §11.3 |

### 11.3 Build status

The `/v2/` foundation is in place and covered by `v2/test/smoke.py` (274 assertions):

| Built | Not yet |
|---|---|
| Shell, tokens, theme control, root router | Flipping the default for devices that never chose |
| Login and world creation on the RPCs | |
| Overview hub | |
| Party roster | |
| Character sheet: six tabs, HP controls, rests, conditions, detail pane | |
| Campaigns list, campaign detail with seven tabs | |
| Party membership: pull from world, remove, re-add | |
| Reveal toggles and DM notes on every hideable row | |
| Compendium: SRD browse, add to roster, homebrew | |
| Encounter tracker at parity with the classic version | |
| DM panel: levelling mode, milestone and EXP grants | |
| Check authoring on beats and areas | |
| Campaign and encounter deletion | |
| Encounter ↔ chapter beat linking | |
| Encounter sharing by code | |
| Character creation wizard | |
| Level-up wizard, multi-level aware | |
| Press-and-hold card menus | |
| A writable character sheet | |
| The invite to try v2, on both classic screens | |

Every hub tile and navigation item links to a real page.

### 11.3c DM panel

Matches the classic panel's write semantics, because both versions write the
same columns: milestone grants set `level + 1` and `pending_level_up`; EXP grants
add to `experience_points` and recompute the level from the 5e thresholds,
setting `pending_level_up` **only if the level actually moved**.

Two things worth recording:

- **The classic level-up wizard reads `localStorage['preGrantLevel_<id>']`** to
  know the range to walk, written before the grant. v2 writes the same key. It
  is per-device, so it only helps when the same browser grants and then runs the
  wizard — a limitation of the classic design, not something introduced here.
- **v2 has no level-up wizard.** It lives in `level-up-engine.js` and
  `feature-registry.js`, which pick new features and hit points. So v2 grants the
  level and flags it, and the panel says plainly that levelling finishes in the
  classic version rather than leaving a player wondering why nothing happened.

The page guards itself rather than relying on the nav hiding it: a player
reaching `/v2/dm-panel.html` by URL gets an explanation and no controls.

### 11.3d Check authoring

`campaign_checks` had a schema and a renderer but no way to create a row outside
SQL. Checks can now be added to a chapter beat or to an area — a trap needs no
beat — with the type, DC, outcome text and the secret and group flags.

The form sends only the field its type uses: a skill check stores `skill_name`
and leaves `ability` null, a saving throw the reverse. That is what
`campaign_checks_shape` requires, and it stops a stale select from landing a
contradictory row. The DC range is checked before the insert rather than letting
the column constraint produce an opaque failure.

Unbuilt destinations render as inert rows marked "soon" rather than links, so
the nav shows the shape of the finished app without pointing at a 404.

Two things worth recording from building it:

- **Grid blowout.** `1fr` is `minmax(auto, 1fr)`, so a grid item's min-content
  width sets a floor on its track. The four stat chips in a roster card pushed
  that floor past half the viewport and gave the page 156px of horizontal scroll
  at 390px — exactly what the handoff forbids. Fixed with `min-width: 0` on the
  grid items, plus dropping the SP chip below the breakpoint, which the handoff
  explicitly allows.
- **`theme.js` marks its control on `DOMContentLoaded`,** but the shell rebuilds
  `document.body` after that, so the marking was lost. It now exposes
  `window.markThemeButtons()` for the shell to re-run.
- **The sheet's rails are siblings of `.app-main`,** not children of it. Nesting
  them made the sticky combat header stretch the full viewport and the HP amount
  field grow to ~1000px. The handoff's own reference page has the structure; it
  is worth reading the markup rather than inferring layout from the prose.

Two more worth recording from the campaign screens:

- **Reveal state needs to be visible to the DM.** Hidden rows are invisible to
  players *at the database level*, so without an explicit marker on each row a DM
  can only discover what is hidden by logging in as a player. Every hideable row
  carries a visibility pill that doubles as the toggle.
- **Re-adding a former party member must update, not insert.**
  `unique (campaign_id, character_id)` means a character who left already has a
  row; inserting a second one fails. The party picker reactivates it instead.

Sheet write semantics deliberately mirror v1: HP clamps to `[0, max]`, updates
are optimistic then persisted, and temporary hit points sit alongside rather than
absorbing damage first. That last one departs from the rulebook, but both
versions write the same columns and a divergence would surface as the two
disagreeing about whether a character is alive.

### 11.3a Encounter tracker — built, and where decision 1 pays off

Combat state lives in the database: round, initiative, whose turn it is,
conditions and hit points all survive a refresh or a change of device. The
classic tracker holds all of it in `localStorage`.

**The hit point split from §6.1 is what makes this safe.** A combatant row holds
hit points for monsters and NPCs, because they have nowhere else to live. A
player character's row holds none — the `encounter_combatants_pc_hp_passthrough`
constraint rejects them — so damage dealt to a PC in the tracker writes to
`characters.current_hit_points`, the same column the classic app and the v2 sheet
write. Three assertions pin this: that a PC's displayed HP comes from the
character record, that damaging them writes to `characters`, and that damaging a
monster writes to `encounter_combatants` instead.

Other behaviour worth recording:

- Damage clamps at zero and marks a combatant down rather than going negative.
  A downed row dims and is struck through instead of disappearing, so a DM can
  still see what was in the fight.
- The turn order skips downed combatants, and wrapping past the last one
  increments the round.
- Rolling initiative fills only the blanks, so a DM who has typed some values
  does not lose them.
- `hide_monster_hp` is honoured for players: they see the initiative order, who
  is down, and their own party's hit points, but not monster hit points. It
  defaults to on.
- `ember.css` fixes the identity column at 180px, which does not fit beside the
  HP rail and the controls on a phone; below the breakpoint the row wraps and the
  HP rail takes its own line.

### 11.3a2 Tracker parity with the classic version

Reviewing `monster-tracker.html` against v2 found the real friction: **the
schema was forcing a detour**. `encounter_combatants` requires a reference to a
roster monster, an NPC or a character, so adding a creature meant visiting the
Compendium first to create the roster row. The classic tracker just lets a DM
type a name and add.

Resolved without weakening the constraint: picking an SRD creature that is not
on the campaign's roster **creates that roster row silently**, then adds the
combatants against it. The roster fills itself from actual use, and the
Compendium becomes curation rather than a required first step.

What was ported across:

| Classic behaviour | In v2 |
|---|---|
| Type-ahead monster search in the tracker | Searches the campaign roster first, then the SRD, then offers to add the typed name as your own |
| Add several at once | Count field, one hit point row per creature, each numbered |
| Hit points rolled from hit dice | `rollHitPoints` parses `2d6 + 2`, rolls per creature, and adds the constitution bonus per die unless `hit_points_roll` shows it is already folded in |
| Initiative auto-rolled | d20 **plus the dexterity modifier**, per creature, not a flat d20 |
| Border colour per combatant | Swatch palette, set when adding or per row afterwards; stored in `encounter_combatants.color` behind a hex check constraint |
| Encounter grouping | `group_label`, rendered as a collapsible heading with a live count |
| Notes per combatant | `encounter_combatants.notes` — specified in §4.8 but missed when the table was created; restored |
| Inline armor class editing | Tap the AC to change it |
| Five status tiers | HEALTHY / INJURED / BLOODIED / CRITICAL / DOWN, replacing a three-tier split. The bar colour still uses `hpClass`, so word and colour agree |

**One conflict the classic version never had.** Grouping reorders the list, but
turn order is global, so a grouped list would send the active-turn highlight
jumping between headings. The classic tracker has no turn tracking, so it never
met this. The rule now: **groups show while an encounter is being prepared, and
the list goes flat in initiative order once it is running.** Waves are a
planning tool; initiative is a combat one.

SRD access, hit point rolling and armor-class normalisation moved into `core.js`
so the tracker and Compendium share one cache — two copies would have meant two
sets of requests to a free public API.

### 11.3a3 Encounter fixes before merge

- **The search box kept the fragment that was typed.** Picking Bandit after
  typing "ban" added the right creature but left the box reading "ban", which
  looked like the pick had not registered. It now shows the chosen name.
- **A colour marks a set, not a row.** Four monsters added in one colour were
  drawing four separate stripes. Same-coloured combatants now gather into one
  bordered block, and rows inside it drop their individual stripe — one border,
  not four. A lone coloured combatant gets no box, since there is no set to mark.

Colour blocks follow the same rule as groups: they apply while preparing, and a
running encounter goes flat in initiative order with the colour back to a
per-row stripe. Anything that reorders the list has to stand down once turn
order matters.

### 11.3a4 Row wrapping, deletes and story links

**Row wrapping.** `.list-row` puts fixed-width columns either side of the
identity block — avatar, a 120px hit point column, two buttons — which at 390px
left the name almost no room, so "Elowen Thorne / Lv 2 Fighter · Stacey" broke
across four lines and tangled with the bar. Names and meta lines now truncate
rather than wrap, and below the breakpoint the party row wraps into two tidy
lines: identity first, hit points and buttons second.

**Deletes.** Campaigns and encounters can now be deleted, and the confirmation
says what goes with them, because "delete campaign" does not look like it means
its chapters, areas, NPCs, monsters, encounters and session recaps as well.
The campaign dialog counts each of those and states plainly that **characters
survive** — only the membership rows go, since characters belong to the world.
The encounter dialog says the campaign's monster roster is left alone.

**Story links.** `encounters.chapter_beat_id` had a foreign key and no UI. An
encounter can now be tied to the beat it belongs to, and the campaign's
Chapters tab lists the encounters hanging off each beat, with a live marker.
The picker only offers beats from the same campaign: nothing in the schema stops
a cross-campaign link, and one would be nonsense.

### 11.3a5 Encounter sharing — a code, not a URL

v1 shared an encounter as `btoa(JSON.stringify(monsters))` in a query parameter:
roughly two kilobytes for six creatures, carrying live hit points and internal
ids, and breaking outright on a non-ASCII monster name. **It did that because v1
had no server.** v2 does, so the recipe lives in a row and the thing a person
shares is a **ten-character code** they can read aloud.

`shared_encounters` holds the code as its primary key, the world it came from,
a name, the recipe as `jsonb`, an expiry a year out and an import counter. It
carries no policies and no grants — nothing reaches it except the two functions:

- `public.encounter_share_create(uuid)` requires a DM token, and writes a
  recipe rather than a snapshot: **maximum** hit points, not current ones, and
  no player characters. What travels is the monsters, their colours, their group
  labels and their count.
- `public.encounter_share_get(text)` needs no token at all — **the code is the
  permission**. It trims and upper-cases what was typed, since a code that is
  read aloud gets retyped, and bumps `import_count`.

`private.share_code()` draws from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`, which has
no `O`/`0` or `I`/`1`/`l` in it, for the same reason.

Importing asks only which campaign to put it in, then creates the encounter and
resolves each creature against that campaign's roster, creating the roster row
where it is missing — the same auto-create the tracker already does (§11.3a2),
so a recipient never has to build a roster before they can run what they were
sent. The instance number is stripped on the way in: "Goblin 1" is an instance,
`Goblin` is the creature. Everything arrives at full health.

**A schema bug this uncovered.** Verifying the import path turned up that
`encounter_combatants.campaign_monster_id` and `.npc_id` were `ON DELETE SET
NULL`, which nulls the only reference a combatant has and so violates
`encounter_combatants_one_ref`. Deleting a roster monster that appeared in any
encounter therefore **failed outright**, and would have broken the campaign
deletion shipped in §11.3a4 the moment a campaign had one. Both are now
`ON DELETE CASCADE`.

### 11.3a6 Character creation and levelling

**The rules engine is shared, not copied.** `level-up-engine.js` and
`feature-registry.js` stay at the repository root and both versions load them,
so a rules fix lands in v1 and v2 at once. The engine was written against
`app.js` and expects `db`, `getModifier`, `HIT_DICE`, `ABILITIES` and
`ABILITY_FULL`; `v2/js/rules.js` supplies them under those names, so the shared
file needs no knowledge of which version loaded it. The engine's own modal
(feat ability choice) builds a `.modal > .modal-backdrop + .modal-content`
overlay where v2's `.modal` is the card, so v2 restyles that shape rather than
editing a file v1 owns. Every custom property it uses was already an Ember token.

`rules.js` also copies seven constants out of `app.js` — `SKILLS`, `ABILITIES`,
`ABILITY_FULL`, `HIT_DICE`, `ASI_LEVELS`, `SUBCLASSES`, `FEATS` — because
`app.js` is 5,000 lines with side effects and cannot be loaded by a v2 page. A
copy that silently drifts would be a rules bug in both versions at once, so the
suite compares the text of each declaration across the two files.

**Creation** is a four-step wizard: identity, abilities, review, campaign. v1's
single long form is fine on a desktop and miserable at 390px. Abilities offer
standard array, point buy, roll 4d6 and manual entry; v1 had only the last two.
Point buy enforces the PHB cost table, where 14 and 15 cost two points each —
the whole reason the table exists — and the review step shows every derived
number before anything is written. The campaign step is offered to DMs only,
because `campaign_characters` is `dm_all` / `player_read` and a player's insert
would be refused by the policy.

**Levelling** opens from a banner on the sheet. It is multi-level aware exactly
as v1 is: a DM granting three levels at once gets three hit point choices and
every ASI in the range, driven by the `preGrantLevel_<id>` key v2's DM panel
already writes. The completion path mirrors `app.js`'s `completeLevelUp` step
for step, including Tough's retroactive hit points and the single ability score
write after every ASI has been folded in.

Two deliberate differences from v1:

- **No auto-opening wizard.** v1 opens the wizard over the sheet when a
  subclass is missing. A modal that appears over the sheet traps someone who
  opened it to check their hit points mid-fight, and the banner puts the choice
  one tap away regardless.
- **Subclass features actually save.** v1 matches the chosen subclass against
  the SRD by exact name, but the SRD says "Berserker" where the app says "Path
  of the Berserker" — so it finds a match for only four of the twelve classes
  and silently saves no subclass features for the rest. v2 falls back to
  matching the SRD name as a whole phrase inside the chosen one, which resolves
  all twelve.

### 11.3a7 What reading the engine turned up

Three findings, all confirmed against the live database.

**v1 loads the engine and never calls it.** `characters.html` includes both
files, but `app.js` contains no reference to `window.LevelUpEngine`. It reaches
`FeatureRegistry` directly for feat effects and does everything else by hand.
`character_effects` has **0 rows across 264 characters**, which is what that
looks like from the data side.

The consequence is that v1 has never applied racial ability bonuses, class
saving throw proficiencies or racial speed at creation. Of 264 characters, 27
have a proficient saving throw, and those were toggled by hand on the sheet.
`showHalfElfAbilityChoice` is exported and called from nowhere, so a Half-Elf's
two +1s have never been collected at all.

v2 calls `enhanceCharacterCreation`, so a character made in v2 gets all of it.
That is a **behaviour change against §8's contract**, and the mitigation is
that it is never a surprise: the wizard shows the racial bonus on each score as
you set it, and the review step shows the adjusted totals with the breakdown
(`15 +2 race`) before anything is written.

**`enhanceLevelUpCompletion` cannot work against this schema.** Its last step is
`recalculateCharacterStats`, which writes `passive_perception` — a column
`characters` does not have. It also recomputes `armor_class` from equipment,
which would discard the AC the tracker lets a DM set by hand. v2 therefore does
**not** call it, and applies feat and feature effects the way v1 does, straight
from `FeatureRegistry`. Fixing the engine would mean editing a file v1 loads;
since v1 never calls the function, the fix is safe but not urgent, and it is
left as a decision rather than taken quietly.

**The engine keys ability scores by their long names.** `applyRacialBonuses`
does `result[ability] += bonus` against `RACIAL_ABILITY_BONUSES`, whose keys are
`strength`, `dexterity` and so on. Hand it the short keys the rest of v2 uses
and every bonus silently misses — and then `applyRacialEffects` writes
`finalScores.strength` and friends, which are all `undefined`, over the six
ability scores. The suite asserts the written scores are numbers, not just that
the call happened.

### 11.3a8 Card menus, and where actions live

Three complaints with one cause: **actions had nowhere good to live.** The
topbar was desktop-only and unbounded, so the tracker grew ten buttons across
the top of the screen. The FAB menu sized each action to its own label, so ten
of them read as ten unrelated bubbles. And editing or deleting a single card
had no home at all on a phone -- some of it only existed inside the thing being
edited, and some of it did not exist anywhere.

**The card is now the control.** Press and hold a card, or right-click it,
and the actions for that one thing come up. Three things decide whether the
gesture is usable rather than infuriating:

- **A hold that survives a scroll is a trap.** Every scroll starts as a touch
  on a card, so movement past ten pixels cancels the timer.
- **The browser fires a click after the touch ends**, which would follow the
  card's own link and open the thing behind the menu. The next click is
  swallowed in the capture phase.
- **iOS shows its own selection callout** on a long press, so `.holdable`
  suppresses it -- while leaving inputs inside a holdable list selectable.

**Actions this had to create.** The gesture was only worth adding if it led
somewhere, and several of its destinations did not exist:

| Action | Before |
|---|---|
| Edit or delete a campaign from the list | Only from inside the campaign |
| Delete or share an encounter from the list | Only with it open |
| Edit an NPC | Could be created, never edited |
| Delete a chapter, beat, area or NPC | Not possible |
| Remove a monster from a roster | Not possible |
| Delete a character | Not possible in v2 at all |

Campaign-detail rows all declare a `data-kind` and share one resolver, so a new
tab wires nothing: it marks its rows and adds a case.

**Deleting a character asks for the name to be typed.** It is the largest thing
a person builds here, thirteen tables cascade off it (verified against the live
database), and a press-and-hold is easy to trigger by accident. A red button
behind one tap is too thin a guard for that combination, so `confirmByName`
requires the name, matched ignoring case and surrounding spaces.

**Crowding is now bounded.** Above three actions a page keeps the + menu on
desktop too and shows nothing in the topbar. A threshold rather than a per-page
flag, so an eleventh tracker action cannot bring the problem back. The menu
itself is one panel -- fixed width, full-width rows, hairline separators, one
shadow -- instead of a stack of pills.

### 11.3a9 The sheet was read-only

Caught on review, and it was worse than it looked. v2's sheet could change hit
points, death saves, conditions, proficiency toggles, and take rests. Everything
else it **displayed and could not touch** -- ten capabilities v1 had:

| | v1 | v2 before |
|---|---|---|
| Add or delete a spell | yes | no |
| Mark a spell prepared | yes | no |
| Spend or restore a spell slot | yes | showed them only |
| Add or delete a weapon | yes | no |
| Add or delete an item | yes | no |
| Quantity, equipped, attuned | yes | no |
| Edit currency | yes | no |
| Add or delete a feature | yes | no |
| Spend a feature's charges | yes | no |
| Edit notes, backstory, appearance | yes | no |

The notes tab told people to "add them in the classic version", which is the
tell: the sheet was built as a play-from view and the write paths were never
added. A sheet you have to leave to record a spell you just learned is not a
sheet.

**Adding is SRD-backed, with the search separate from the name.** `openSrdForm`
puts a lookup above the form's own fields: pick an entry and the fields fill,
or ignore it and type your own. v1 made the name field itself the search box,
so a custom name and a lookup fought over one input. Filling never overwrites
what has already been typed by hand, and if the SRD is unreachable the form
still works -- the search is a convenience, not the way in.

**Slots and charges are tap to spend, hold to restore.** Spending is what
happens during a session, so it costs one tap; restoring is the correction, so
it costs the gesture. Neither opens the detail pane behind the row, which is
the bug that would make both useless. A rest still resets them wholesale.

**Dropping the last of an item deletes it** rather than leaving a row reading
zero, because nothing else would ever tidy that row up.

### 11.3a10 Two tables, one list of attacks

Raised on review: should an equipped weapon in inventory show as an action?

It should, and it could not. **The two tabs read two different tables.** Actions
reads `weapons`; Inventory reads `inventory_items`. An item typed `Weapon` in
inventory had no path to Actions whatever its `equipped` flag said. In the live
database that is **39 inventory rows typed Weapon** -- Greatsword, Longsword,
Shortbow, Scimitar, Dagger, Quarterstaff -- and **not one** has a matching
`weapons` row. Those characters were carrying weapons with no way to attack
with them.

`equipped` was decorative on the other side too. Actions listed every weapon
regardless and only badged the equipped ones, and nothing in either version
could toggle the flag -- v1's starting equipment writes `equipped: false` for
everything, and 207 of 208 rows are still false.

**The rule now:** a `weapons` row is always an action, equipped sorted to the
top; an `inventory_items` row typed `Weapon` is an action **only while
equipped**. Picking a dagger up and equipping it puts it on the tab; unequipping
takes it off. Weapons proper are never hidden for being unequipped, because a
Barbarian mid-fight should still see the javelins they are about to throw.

**Damage for a carried weapon comes from the SRD.** `inventory_items` has no
`damage` or `damage_type` column, so there is nowhere to store it; the name is
matched against the SRD equipment index and the numbers filled in after the
fact, with a redraw when they land. A name the SRD does not know is cached as
empty so it is not looked up again, and the row still lists -- without numbers,
which is what it did before any of this existed.

This needed no schema change and no backfill, which is why the sort was chosen
over filtering Actions down to equipped weapons: filtering would have emptied
almost every character's Actions tab on deploy.

### 11.3a11 Two ways a number field fights you

Reported from a phone: typing a level during character creation closes the
keyboard. Both causes were mine, and the second was app-wide.

**A redraw on every keystroke.** `wireIdentity` called `render()` on the level
field's `input` event, and `render()` goes through `renderShell`, which replaces
`document.body`. The focused input is destroyed mid-word, which on a phone
means the keyboard closes. The comment directly above the line said *"free text
does not, so leave the caret where it is"* -- and the line included the level
field anyway.

Nothing on the identity step displays the level, so it never needed the redraw.
The two selects still redraw, because their hints change and choosing from a
select has already taken focus off it. Everything else now updates the Next
button and the blocker note **in place**, which is all a keystroke can change.

The same line also clamped to 1--20 on every keystroke, which makes a two-digit
level impossible: clearing the field to retype snaps it straight back to 1.
The value is now held as typed and tidied on blur, and every read of it
downstream goes through `clampLevel`, so a half-typed level can never reach the
database or render as the string `"null"`.

**Pre-filled number fields appended.** A sweep that types into every field in
v2 and checks what comes out turned up the bigger problem:

| Field | Typed | Became |
|---|---|---|
| Currency (gold, showing 137) | `250` | `137250` |
| Level (showing 1) | `12` | `112` |
| Creature count (showing 1) | `12` | `112` |
| Rolled hit points (showing 9) | `15` | `915` |

Tapping a pre-filled number field puts a caret where the finger landed and
leaves the value in place. Nobody taps a number field meaning to splice digits
into the middle of it. A `focusin` handler in core now selects the contents of
any non-empty `input[type=number]`, which fixes every such field at once,
including ones not written yet.

Scoped to numbers deliberately: selecting a name or a note on focus would
destroy someone's text the moment they tapped in to fix one word. The suite
asserts both halves -- numbers replace, text does not.

The select is **synchronous**, not on a timer. The first attempt deferred it
with `setTimeout(..., 0)`, which can land after the first keystroke: it then
selects the character just typed and lets the second replace it, so typing 12
gives 2. That is the same bug wearing a different hat.

### 11.3a12 Chapters, and a leak in the reveal

A review pass over the campaign screens. The heading is the rename; the first
item is the one that mattered.

**DM notes were readable by players.** `storylines.body` and
`storyline_beats.body` were labelled "Your notes" and "DM-facing", and the UI
hid them behind `isDM`. But `player_read` on both tables is
`USING (is_revealed)` — a **row** filter, not a column one. Revealing a
storyline handed a player every column on it, notes included, straight from the
API. Hidden in the page, exactly what §5 exists to prevent — and the DM-note
dialog was meanwhile telling people their notes were "stored in a table players
cannot reach", which was true of `dm_notes` and false of `body`.

Both columns are gone. The prose moved into `dm_notes`, which is `dm_all` only
with no reveal path, and the forms write there instead. Two rows of existing
notes migrated.

**Storylines are chapters.** The campaign is the storyline; what sits inside it
is a chapter. `storylines` → `chapters`, `storyline_beats` → `chapter_beats`,
and the columns on `campaign_checks`, `encounters` and `dm_notes` followed.
Renaming a table leaves its constraints and indexes named after the old one, so
those were renamed too — a stale name is a trap for whoever reads it next.

**Things collected and never shown.** Three of them, all the same shape: a form
gathered something, stored it, and no screen rendered it.

| Collected | Where it went |
|---|---|
| A beat's "Your notes" | Written to `body`, never rendered |
| A check's success and failure text | Stored, never rendered |
| A chapter's "What the party knows" | Rendered, then clamped to two lines with an ellipsis |

All three now render in full. `.campaign-card .summary` kept its two-line clamp
for the campaigns grid, where it belongs; the chapter card uses `.prose`.

**Nothing could be edited.** Chapters, beats and checks could be created and
deleted and nothing in between. All three have an edit route now, and the check
form is shared between create and edit so the two cannot drift on which fields
exist or how a type maps onto them.

**Smaller things.** "Its 1 beat go too" now agrees with itself. The Monsters tab
no longer claims the Compendium does not exist, and monsters can be put on the
roster from the campaign as well as from the Compendium. The Compendium gained
an Items tab over SRD equipment, with add-to-character. The desktop sidebar
gained logout and the switch to classic, which had lived only in the mobile
drawer — hidden above the breakpoint, so a desktop had no way out.

### 11.3a13 Two input bugs behind one report

**A dialog closed when you selected text in it.** A click fires on the nearest
common ancestor of where the press began and where it ended, so pressing inside
a dialog, dragging past its edge and releasing put the click on the backdrop —
and `e.target === host` threw the dialog away mid-edit. It now dismisses only
when the press *started* on the backdrop too. The same gesture explains the
mobile report: press a field, the keyboard opens and the layout shifts under
your finger, and the release lands outside.

**A number field silently refused to submit.** `<input type="number">` carries
an implicit `step="1"`, so any fractional value fails native validation and the
browser blocks the form — with no error the page can see. A goblin's challenge
rating of 1/4 hit it, and so would any SRD item weighing 0.25 lb. Every number
field here validates in its own `onSubmit`, so the browser's step check only
ever bought a silent dead end; number inputs now carry `step="any"`.

### 11.3a14 Starting gear, and levelling during creation

**The starting kit is back.** v1 offers the class and background kit on
creation; v2 dropped it. `CLASS_STARTING_EQUIPMENT` and
`BACKGROUND_STARTING_EQUIPMENT` are copied into `rules.js` verbatim, under the
same parity check as the other rules constants (now nine of them, compared as
text so a silent divergence fails the suite). 5e gives real choices here — "a
martial weapon and a shield OR two martial weapons" — and v1 flattens each class
to one representative list. Matching v1 matters more than being thorough: a
character created in either version should arrive carrying the same thing.

A Gear step lists exactly what it would add, and is offered at any level with a
line noting it is the level 1 kit when the character is higher. Weapons go to
`weapons`, armour and gear to `inventory_items`, coin onto the purse — the same
split v1 writes, which is also why an equipped inventory weapon counts as an
action (§11.3a10).

**Levels above the first are the level-up wizard's.** Creating a level 10
character used to write the level 10 row and skip everything a level brings:
three ability score improvements, a subclass, features, spells. Creation now
writes the character at **level 1 hit points** with `pending_level_up` set and
`preGrantLevel` at 1, then opens the multi-level wizard for levels 2..N before
the sheet is ever reached.

That is deliberately the same path a DM's grant takes, so a level 10 character
built here is indistinguishable from one levelled up to 10 — rather than a
second implementation of the rules to keep in step with the first.

Two things this had to get right:

- **The engine is told level 1, not the target.** `enhanceCharacterCreation`
  sizes hit points for whatever level it is given; handing it the target would
  have it write the average for every level and the wizard would then add them
  again. The insert writes level 1 hit points explicitly too, so the double
  count cannot happen even if the engine fails to load.
- **The dialog can be closed.** Someone who dismisses it mid-flow would
  otherwise be left with a level 10 character carrying level 1 hit points and
  nothing on screen saying so. The campaign step behind it now says what is
  still owed and offers to resume; the sheet's banner catches it as well.

### 11.3b Review fixes

Five problems found by using it on a phone, and what each turned out to be:

| Reported | Cause |
|---|---|
| Tapping a character underlined all its text | `ember.css` sets `a:hover { text-decoration: underline }`. A card is a block-level `<a>`, so the rule propagates to every descendant — and on touch the hover state sticks after a tap |
| No way to add a campaign on mobile | **Systemic**: the topbar is `display: none` below 900px, so every action rendered only there was unreachable. It affected new campaign, edit campaign, new homebrew, new encounter and add character |
| Compendium details unreadable on mobile | The detail pane sat *below* a list of up to 150 rows, so picking something looked like nothing happened |
| PIN boxes overflowed the page | An `<input>` carries an intrinsic width from its default `size="20"`, and a flex item's `min-width` is `auto` — so at 22px mono they refused to shrink below ~207px each. The same class of bug as the grid blowout, and no test covered the login page |
| Encounter buttons too crowded | Seven buttons in one row |

The topbar and crowded-buttons problems share a fix: actions are now **declared
once** as `renderShell({ actions: [...] })` and rendered twice — as topbar
buttons above the breakpoint, as a floating button with a flip-up menu below it.
That removes the whole class of "action only exists on desktop" bug rather than
patching the campaigns screen alone.

The FAB menu hides with `visibility`, not `opacity` alone: a transparent menu
still sits in the tab order and the accessibility tree.

### 11.4 Compendium — built

The write path for §4.4, as scoped. Browse and search SRD monsters and spells,
add a monster to a campaign roster, or author a homebrew stat block.

Three details worth recording:

- **The SRD is never copied in.** Adding an SRD monster stores `source='srd_api'`
  with its `api_index`, and `statblock` holds **only the fields the DM changed**
  — rename it, buff its hit points, and those two keys are all that persist.
  Untouched entries store `null`.
- **`armor_class` has shipped as both a number and an array** of `{type, value}`
  across SRD revisions, so it is normalised to an integer before it reaches the
  `armor_class` column. Fractional challenge ratings render as `1/4`, not `0.25`.
- **The index is fetched once per tab session** and cached in `sessionStorage`,
  not re-fetched per keystroke as the classic tracker does on every search.

Monsters already on a campaign's roster are marked in the list, so a DM does not
add the same creature twice.

Spells are reference only. They belong to a character and are added from the
sheet; the compendium closes the standing v1 gap where a spell could only be read
if it was already on someone's sheet.

### 11.5 Compendium — original rationale

Not a standalone reference section: it is the write path for §4.4. Browse and search SRD monsters and
spells from `dnd5eapi.co`, "Add to campaign" inserting a `campaign_monsters` row with an `api_index`,
and a homebrew authoring form producing `source = 'homebrew'` rows. Without it, `source = 'homebrew'` is
unreachable and adding an SRD monster means typing an index by hand.

The design already built its entry point — the topbar search field reads "Search monsters, spells,
items…". It also closes a standing v1 gap: today a stat block can only be seen by adding the monster to
a live encounter, and a spell only if it is already on a character sheet.

---

## 12. Open items

1. ~~**`login.js` change (§5.5) needs sign-off**~~ — approved, shipped and merged to `main`. The PIN
   hashes are gone from `game_worlds` and both versions log in through `world_login`.
2. **Fix `recalculateCharacterStats`?** It writes a `passive_perception` column that does not exist and
   recomputes `armor_class` over a manually set value (§11.3a7). v1 never calls it, so the fix is safe —
   but it means editing a file v1 loads, which needs sign-off.
3. **DM token lifetime** — drafted at 12 hours. A long session runs past that; shorter is safer.
4. **Rate limiting thresholds** for `world_login` — suggest 10 failures per world per 15 minutes.
5. **Player tokens.** The player PIN currently grants read access to every world's data via the anon key.
   Worth deciding whether players should also carry a token so player-tier reads scope to their own world.
