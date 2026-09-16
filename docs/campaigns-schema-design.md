# Campaign Layer — Schema Design

**Status:** Proposal for review. No database changes have been applied.
**Target project:** `zlsguyiwwwbyoqxdewsd` (DnD Players)
**Scope:** Data model for the new campaign section of the UI redesign.

---

## 1. Goal

Introduce a campaign layer between a game world and its content, so a DM can open a world,
pick a campaign, and find its storylines, areas, NPCs, monsters, encounters and player
characters under one roof.

```
World  ──▶  Campaign  ──▶  Storylines · Areas · NPCs · Monsters · Encounters · Party
```

## 2. Constraints these decisions impose

| Decision | Consequence for this design |
|---|---|
| Old site stays available as a "v1" users can fall back to | Migration is **strictly additive**. No column is dropped, renamed, or re-typed. No existing constraint changes. |
| Old and new share one live database | Anything the old app writes must remain correct when read by the new app, and vice versa. |
| Characters ↔ campaigns is many-to-many | New `campaign_characters` join table. `characters.game_world_id` **stays** and remains authoritative for v1. |
| Every existing world gets a default campaign | One backfill insert per world plus one membership row per character. |
| Encounters fully persisted | Live combat state (initiative, HP, conditions, round) moves from `localStorage` into Postgres. |
| NPCs are lore + optional stat block | `npcs.monster_id` is a nullable FK to the campaign monster roster. |
| Storylines are freeform body + structured checks | Rich-text beats, with checks as queryable rows. |
| Monsters are API refs + homebrew | One roster table that holds either a `dnd5eapi` index or a full homebrew stat block. |

## 3. Current state (measured, not assumed)

- 191 game worlds, all `is_active = true`.
- 264 characters, **0 with a null `game_world_id`** — the backfill has no orphan case to handle.
- 18 distinct skill names, each appearing exactly 264 times (one full set per character).
- Encounters/monsters have **no persistence today**: encounter state is `localStorage['mt_encounter_state']`,
  and stat blocks are fetched live from `dnd5eapi.co`. The encounter tables below are net-new, not a migration.
- Every existing table's RLS policy is `FOR ALL TO public USING (true) WITH CHECK (true)`. See §7.

---

## 4. New tables

> Sections below are grouped by concept, not execution order. When applied, tables are created in
> dependency order: `campaigns` → `campaign_characters` → `areas` → `campaign_monsters` →
> `storylines` → `storyline_beats` → `npcs` → `encounters` → `encounter_combatants` →
> `campaign_checks` (last, as it references beats, areas, NPCs and encounters).

### 4.1 `campaigns`

```sql
create table public.campaigns (
  id             uuid primary key default gen_random_uuid(),
  game_world_id  uuid not null references public.game_worlds(id) on delete cascade,
  name           text not null,
  summary        text,                      -- player-facing blurb
  dm_notes       text,                      -- DM-only (see §7)
  status         text not null default 'active'
                 check (status in ('planning','active','paused','completed','archived')),
  is_default     boolean not null default false,
  sort_order     integer not null default 0,
  started_at     date,
  ended_at       date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (game_world_id, name)
);

create index on public.campaigns (game_world_id);
```

`is_default` marks the campaign created by the backfill, so the new UI can skip the campaign
picker for worlds that never made a second one.

### 4.2 `campaign_characters` — the many-to-many join

```sql
create table public.campaign_characters (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  character_id  uuid not null references public.characters(id) on delete cascade,
  status        text not null default 'active'
                check (status in ('active','inactive','retired','dead','guest')),
  joined_at     timestamptz not null default now(),
  left_at       timestamptz,
  dm_notes      text,
  created_at    timestamptz not null default now(),
  unique (campaign_id, character_id)
);

create index on public.campaign_characters (campaign_id);
create index on public.campaign_characters (character_id);
```

Transferring a character = insert a row for the new campaign. Leaving one = set `left_at` and
`status`. A character can hold active rows in two campaigns at once, which is what "transferable"
requires. **See §6.2 for the cross-world caveat.**

### 4.3 `areas`

```sql
create table public.areas (
  id             uuid primary key default gen_random_uuid(),
  campaign_id    uuid not null references public.campaigns(id) on delete cascade,
  parent_area_id uuid references public.areas(id) on delete set null,
  name           text not null,
  area_type      text not null default 'location'
                 check (area_type in ('region','settlement','dungeon','landmark','building','plane','location','other')),
  description    text,                      -- player-facing
  read_aloud     text,                      -- boxed text
  dm_notes       text,                      -- DM-only
  map_url        text,
  is_discovered  boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index on public.areas (campaign_id);
create index on public.areas (parent_area_id);
```

`parent_area_id` gives nesting — Region ▸ City ▸ Tavern — without a separate hierarchy table.

### 4.4 `campaign_monsters` — roster of API refs and homebrew

```sql
create table public.campaign_monsters (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  name              text not null,
  source            text not null check (source in ('srd_api','homebrew')),
  api_index         text,                   -- dnd5eapi index, e.g. 'goblin'
  statblock         jsonb,                  -- full block (homebrew) or overrides (srd_api)
  challenge_rating  numeric,
  creature_type     text,
  size              text,
  armor_class       integer,
  max_hit_points    integer,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint campaign_monsters_source_shape check (
    (source = 'srd_api'  and api_index is not null) or
    (source = 'homebrew' and statblock is not null)
  )
);

create index on public.campaign_monsters (campaign_id);
```

`armor_class`, `max_hit_points` and `challenge_rating` are denormalised so the encounter builder
can sort and budget without unpacking `statblock` or hitting the external API. For `source='srd_api'`,
`statblock` holds **only overrides** (renamed elite variant, buffed HP), keeping the SRD out of your DB.

### 4.5 `storylines` and `storyline_beats`

```sql
create table public.storylines (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid not null references public.campaigns(id) on delete cascade,
  title           text not null,
  player_summary  text,                     -- what the party knows
  body            text,                     -- freeform DM-facing rich text / markdown
  status          text not null default 'planned'
                  check (status in ('planned','active','completed','abandoned')),
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.storyline_beats (
  id            uuid primary key default gen_random_uuid(),
  storyline_id  uuid not null references public.storylines(id) on delete cascade,
  area_id       uuid references public.areas(id) on delete set null,
  title         text not null,
  body          text,                       -- freeform
  read_aloud    text,
  dm_notes      text,
  status        text not null default 'pending'
                check (status in ('pending','in_progress','completed','skipped')),
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index on public.storylines (campaign_id);
create index on public.storyline_beats (storyline_id);
```

### 4.6 `campaign_checks` — structured check / saving throw requirements

Attachable to a beat, an area, an NPC, or an encounter — exactly one.

```sql
create table public.campaign_checks (
  id                 uuid primary key default gen_random_uuid(),
  campaign_id        uuid not null references public.campaigns(id) on delete cascade,
  storyline_beat_id  uuid references public.storyline_beats(id) on delete cascade,
  area_id            uuid references public.areas(id) on delete cascade,
  npc_id             uuid references public.npcs(id) on delete cascade,
  encounter_id       uuid references public.encounters(id) on delete cascade,
  label              text not null,          -- "Spot the tripwire"
  check_type         text not null
                     check (check_type in ('ability_check','skill_check','saving_throw','contested')),
  ability            text check (ability in ('str','dex','con','int','wis','cha')),
  skill_name         text,                   -- must match public.skills.skill_name vocabulary
  dc                 integer not null check (dc between 1 and 40),
  success_text       text,
  failure_text       text,
  is_group_check     boolean not null default false,
  is_secret          boolean not null default false,   -- DM rolls on the party's behalf
  is_repeatable      boolean not null default false,
  sort_order         integer not null default 0,
  created_at         timestamptz not null default now(),
  constraint campaign_checks_one_parent check (
    num_nonnulls(storyline_beat_id, area_id, npc_id, encounter_id) = 1
  ),
  constraint campaign_checks_shape check (
    (check_type = 'skill_check'  and skill_name is not null) or
    (check_type in ('ability_check','saving_throw') and ability is not null) or
    (check_type = 'contested')
  )
);

create index on public.campaign_checks (campaign_id);
```

`skill_name` deliberately reuses the exact 18-value vocabulary already in `public.skills`
(Acrobatics … Survival), so a check can be resolved straight against a character's proficiency
and expertise rows without a lookup table.

### 4.7 `npcs`

```sql
create table public.npcs (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references public.campaigns(id) on delete cascade,
  area_id              uuid references public.areas(id) on delete set null,
  monster_id           uuid references public.campaign_monsters(id) on delete set null,  -- optional stat block
  name                 text not null,
  title                text,                 -- "Harbourmaster of Sel"
  faction              text,
  description          text,                 -- player-facing
  dm_notes             text,                 -- true motives, secrets
  disposition          text not null default 'neutral'
                       check (disposition in ('friendly','neutral','hostile','unknown')),
  status               text not null default 'alive'
                       check (status in ('alive','dead','missing','unknown')),
  is_known_to_players  boolean not null default false,
  portrait_url         text,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index on public.npcs (campaign_id);
create index on public.npcs (area_id);
```

A shopkeeper stays three fields. A villain gets `monster_id` set and drops straight into an encounter.

### 4.8 `encounters` and `encounter_combatants`

```sql
create table public.encounters (
  id                   uuid primary key default gen_random_uuid(),
  campaign_id          uuid not null references public.campaigns(id) on delete cascade,
  area_id              uuid references public.areas(id) on delete set null,
  storyline_beat_id    uuid references public.storyline_beats(id) on delete set null,
  name                 text not null,
  description          text,
  read_aloud           text,
  dm_notes             text,
  difficulty           text check (difficulty in ('trivial','easy','medium','hard','deadly')),
  status               text not null default 'planned'
                       check (status in ('planned','active','completed','abandoned')),
  round                integer not null default 0,
  active_combatant_id  uuid,                 -- FK added after encounter_combatants exists
  started_at           timestamptz,
  completed_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.encounter_combatants (
  id                   uuid primary key default gen_random_uuid(),
  encounter_id         uuid not null references public.encounters(id) on delete cascade,
  combatant_type       text not null check (combatant_type in ('monster','npc','character')),
  campaign_monster_id  uuid references public.campaign_monsters(id) on delete set null,
  npc_id               uuid references public.npcs(id) on delete set null,
  character_id         uuid references public.characters(id) on delete cascade,
  display_name         text not null,        -- "Goblin 2"
  initiative           integer,
  armor_class          integer,
  max_hit_points       integer,              -- null for characters, see §6.1
  current_hit_points   integer,              -- null for characters, see §6.1
  temporary_hit_points integer,
  conditions           text[] not null default '{}',
  concentrating_on     text,
  is_defeated          boolean not null default false,
  has_acted            boolean not null default false,
  notes                text,
  sort_order           integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint encounter_combatants_one_ref check (
    num_nonnulls(campaign_monster_id, npc_id, character_id) = 1
  )
);

alter table public.encounters
  add constraint encounters_active_combatant_fkey
  foreign key (active_combatant_id)
  references public.encounter_combatants(id) on delete set null;

create index on public.encounters (campaign_id);
create index on public.encounter_combatants (encounter_id);
```

`round`, `initiative`, `has_acted` and `active_combatant_id` are what make combat survive a refresh
or a device switch, which is the full-persistence choice.

### 4.9 `campaign_sessions` — optional, flagged for your call

Not in your original list; included because "maintaining campaigns" usually means session recaps.
**Cut this table if you don't want it** — nothing else depends on it.

```sql
create table public.campaign_sessions (
  id            uuid primary key default gen_random_uuid(),
  campaign_id   uuid not null references public.campaigns(id) on delete cascade,
  session_number integer,
  title         text,
  played_on     date,
  recap         text,                        -- player-facing
  dm_notes      text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
```

---

## 5. Backfill migration

Safe to run as-is: there are no orphan characters and no name collisions, since each world gets
exactly one campaign named `Main Campaign` and `unique (game_world_id, name)` is per-world.

```sql
-- 1. One default campaign per existing world (191 rows)
insert into public.campaigns (game_world_id, name, summary, status, is_default)
select gw.id,
       'Main Campaign',
       gw.description,
       'active',
       true
from public.game_worlds gw;

-- 2. Attach every existing character to its world's default campaign (264 rows)
insert into public.campaign_characters (campaign_id, character_id, status)
select c.id, ch.id, 'active'
from public.campaigns c
join public.characters ch on ch.game_world_id = c.game_world_id
where c.is_default;
```

Verification after running:

```sql
select
  (select count(*) from campaigns where is_default)                          as default_campaigns,  -- expect 191
  (select count(*) from campaign_characters)                                 as memberships,        -- expect 264
  (select count(*) from characters ch
     where not exists (select 1 from campaign_characters cc
                       where cc.character_id = ch.id))                       as unattached;         -- expect 0
```

Rollback is a plain `drop table ... cascade` on the new tables only — no existing row is touched by
this migration, so v1 cannot be broken by it.

---

## 6. Three design tensions worth your decision

### 6.1 Character HP has two possible homes — pick one

Full encounter persistence means `encounter_combatants` wants `current_hit_points`. But a player
character's real HP already lives in `characters.current_hit_points`, and **the old v1 app writes
that column directly**. If both stores hold PC HP, a player healing on v1 and a DM applying damage
on v2 will silently disagree.

**Recommendation:** for `combatant_type = 'character'`, leave the HP columns null and read/write
through to `characters.current_hit_points`. Monsters and NPCs use the local columns, since they have
nowhere else to live. Optionally enforce it:

```sql
alter table public.encounter_combatants
  add constraint encounter_combatants_pc_hp_passthrough check (
    combatant_type <> 'character' or (max_hit_points is null and current_hit_points is null)
  );
```

The cost is one extra write path in the tracker. The benefit is that v1 and v2 can never disagree
about whether a PC is alive — which matters a lot while both versions are live.

### 6.2 Cross-world transfer will look wrong in v1

`characters.game_world_id` is a single FK and v1 renders the roster from it. If v2 lets a character
join a campaign in a *different* world, v1 still shows them under their old world.

**Recommendation:** treat campaign membership as within-world by default, and make cross-world moves
an explicit "change home world" action that updates `game_world_id` too — keeping both versions
consistent. If you'd rather allow free cross-world membership, that's fine, but v1's roster becomes
an incomplete view and we should say so in the UI.

### 6.3 DM secrets are not currently secret

Every table is `FOR ALL TO public USING (true)`, and the client ships the anon key. Today that's
tolerable because all the data is party-shared anyway. This design adds `dm_notes` to campaigns,
areas, beats, NPCs and encounters — content whose entire purpose is that players can't see it.
**Hiding it in the UI does not hide it**; anyone can read it from devtools or curl.

Three honest options:

| Option | What it gives you | Cost |
|---|---|---|
| **A. Match the status quo** — new tables get `USING (true)` | Ships fastest, consistent with today | DM secrets readable by any player who looks |
| **B. Secrets behind an RPC** (recommended) — `dm_notes` columns readable only via a `security definer` function that checks the DM PIN hash | Real protection, no auth rework, PIN model unchanged | One RPC per read path that touches DM content |
| **C. Full Supabase Auth** — real accounts, per-user policies | Correct long-term answer | Large; replaces the whole PIN login flow. Out of scope here. |

If you pick A for now, I'd still recommend keeping every DM-only field in its own dedicated column
(as drafted) rather than mixed into a shared blob, so B remains a policy change later rather than a
restructure.

---

## 7. Backward-compatibility contract

For as long as v1 stays available, these must not change:

- `characters.game_world_id` — nullable uuid FK to `game_worlds(id)`. v1's roster depends on it.
- `characters.current_hit_points` / `temporary_hit_points` / `death_save_*` — v1 writes these directly.
- `game_worlds.name`, `dm_pin_hash`, `player_pin_hash`, `is_active` — v1's entire login flow.
- All 11 character sub-tables keep their `character_id` FK shape.
- The `dnd-session` localStorage shape `{gameWorldId, gameWorldName, role, timestamp}` — v2 should
  **extend** it (add `campaignId`) rather than replace it, so a user bouncing between versions stays logged in.

Everything in §4 is new. Nothing in §5 mutates an existing row.

---

## 8. Navigation model (input for the UI redesign)

```
Login (world + PIN)
  └─ World
       ├─ Campaigns  ← new landing screen when a world has >1 campaign
       │    └─ Campaign
       │         ├─ Overview      — summary, status, recent sessions
       │         ├─ Storylines    — beats, with inline check requirements
       │         ├─ Areas         — nested tree, descriptions, maps
       │         ├─ NPCs          — lore cards; stat block if attached
       │         ├─ Monsters      — roster: SRD refs + homebrew
       │         ├─ Encounters    — builder → launches the tracker
       │         └─ Party         — campaign_characters, transfer in/out
       └─ Characters              — v1-compatible world-level roster
```

Worlds with only the backfilled default campaign should skip the campaign picker and land straight
on that campaign, so existing users don't meet a new empty screen on first login.

---

## 9. Before I apply anything

Open items for your review:

1. §6.1 — confirm PC HP read-through (recommended) vs. storing it per-encounter.
2. §6.2 — confirm within-world transfers by default.
3. §6.3 — pick A, B, or C for DM secrets.
4. §4.9 — keep or cut `campaign_sessions`.
5. Confirm "Main Campaign" as the backfill name, and whether existing world descriptions should be
   copied into `campaigns.summary` as drafted.
