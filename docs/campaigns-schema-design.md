# Campaign Layer — Schema & Security Design

**Status:** Proposal for review. No database changes have been applied.
**Target project:** `zlsguyiwwwbyoqxdewsd` (DnD Players)
**Revision:** 2 — incorporates decisions on HP ownership, world-locked characters, DM secret protection, and version coexistence.

---

## 1. Goal

A campaign layer between a game world and its content, so a DM opens a world, picks a campaign, and
finds its storylines, areas, NPCs, monsters, encounters and party under one roof.

```
World  ──▶  Campaign  ──▶  Storylines · Areas · NPCs · Monsters · Encounters · Party
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
> → `storylines` → `storyline_beats` → `npcs` → `encounters` → `encounter_combatants` →
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

### 4.5 `storylines` and `storyline_beats`

```sql
create table public.storylines (
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

create table public.storyline_beats (
  id            uuid primary key default gen_random_uuid(),
  storyline_id  uuid not null,
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
  foreign key (storyline_id, game_world_id) references public.storylines(id, game_world_id) on delete cascade
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
  storyline_beat_id  uuid references public.storyline_beats(id) on delete cascade,
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
    num_nonnulls(storyline_beat_id, area_id, npc_id, encounter_id) = 1
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
  storyline_beat_id    uuid references public.storyline_beats(id) on delete set null,
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

You left this to me: **keep it.** Without it, session recaps end up crammed into a storyline beat,
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
| `storylines` | `is_revealed` | no |
| `storyline_beats` | `is_revealed` | no |
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
  storyline_id        uuid references public.storylines(id)         on delete cascade,
  storyline_beat_id   uuid references public.storyline_beats(id)    on delete cascade,
  npc_id              uuid references public.npcs(id)               on delete cascade,
  encounter_id        uuid references public.encounters(id)         on delete cascade,
  campaign_session_id uuid references public.campaign_sessions(id)  on delete cascade,
  body                text not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint dm_notes_one_parent check (
    num_nonnulls(campaign_id, area_id, storyline_id, storyline_beat_id,
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

### 9.1 Layout

```
/index.html             login + router      (v1 file, lightly extended)
/characters.html        v1                  (frozen)
/monster-tracker.html   v1                  (frozen)
/app.js, /styles.css …  v1                  (frozen)
/v2/…                   new UI
```

v1 keeps its current URLs so existing bookmarks, the PWA `start_url` and any shared links stay valid.
Beyond the `login.js` change §5.5 forces, **no v1 file is edited** — a fallback you have been
modifying is not a fallback, because every edit is a chance to regress the thing people fell back to.

### 9.2 Recommended flow — route after login, don't prompt before it

Your instinct (choose a version, remember it in localStorage) is right. One refinement: put the
choice **after** authentication, not in front of it.

A pre-login chooser asks people to pick between two things they cannot see yet, and it adds a step to
the one task they actually came to do. After login you can make the offer concrete, against their own
world, and let them ignore it.

```
index.html
  ├─ read localStorage['taphou5e-ui']
  ├─ login as today
  └─ on success:
       'classic' → characters.html
       'next'    → /v2/
       unset     → characters.html, plus a one-time dismissible "Try the new layout" card
```

Three properties that matter more than the mechanism:

1. **Dismissible card, not a blocking modal.** A modal in front of a DM mid-session is a tax on
   everyone to benefit the curious.
2. **The switch is permanent and two-way**, living in the side menu on *both* versions. Anyone who
   tries v2 and dislikes it must be one tap from classic, or they won't try it at all.
3. **Default for unchosen users stays `classic` during rollout**, and flips to `next` once v2 is
   proven. That ordering means a bug in v2 is an opt-in problem, not an incident across 191 worlds.

### 9.3 Why localStorage is the right store here — and its one consequence

Login is world + PIN, not per-person. There is no user identity to hang a preference on, so a
server-side preference would have to live on `game_worlds` — forcing an entire world onto one version,
including players who never chose. Per-device localStorage is the correct granularity.

The consequence: a DM on both phone and laptop chooses twice. That's the right trade, and worth a
line of copy rather than an engineering fix.

### 9.4 What each version sees of the other's data

Because of decision 2, this stays simple. A character never leaves its world, so **v1's roster is
never wrong — only less detailed.** A DM can build campaigns, NPCs and encounters in v2 all day and
v1 carries on showing the same flat character list it always has.

The DM token and the version choice are independent: switching versions does not log anyone out,
since both read the same `dnd-session` key.

---

## 10. Navigation model (input for the UI redesign)

```
Login (world + PIN)
  └─ World
       ├─ Campaigns  ← landing screen when a world has more than one
       │    └─ Campaign
       │         ├─ Overview      — summary, status, recent sessions
       │         ├─ Storylines    — beats, with inline check requirements
       │         ├─ Areas         — nested tree, descriptions, maps
       │         ├─ NPCs          — lore cards; stat block if attached
       │         ├─ Monsters      — roster: SRD refs + homebrew
       │         ├─ Encounters    — builder → launches the tracker
       │         └─ Party         — campaign_characters, join/leave within the world
       └─ Characters              — v1-compatible world-level roster
```

Worlds holding only the backfilled default campaign should skip the picker and land straight on that
campaign, so existing users don't meet a new empty screen on first login.

---

## 11. Open items

1. **DM token lifetime** — drafted at 12 hours. A long session runs past that; shorter is safer.
2. **Rate limiting thresholds** for `world_login` (§5.5) — suggest 10 failures per world per 15 minutes.
3. **Player PIN** currently grants read access to everything via the anon key regardless of this
   design. Worth deciding whether players should also carry a token, so player-tier reads can be
   scoped to their own world rather than every world.
4. Confirm the `login.js` change in §5.5 is acceptable — decision 3 cannot be delivered without it.
