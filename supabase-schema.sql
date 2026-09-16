-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.ability_scores (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL UNIQUE,
  strength integer DEFAULT 10 CHECK (strength >= 1 AND strength <= 30),
  dexterity integer DEFAULT 10 CHECK (dexterity >= 1 AND dexterity <= 30),
  constitution integer DEFAULT 10 CHECK (constitution >= 1 AND constitution <= 30),
  intelligence integer DEFAULT 10 CHECK (intelligence >= 1 AND intelligence <= 30),
  wisdom integer DEFAULT 10 CHECK (wisdom >= 1 AND wisdom <= 30),
  charisma integer DEFAULT 10 CHECK (charisma >= 1 AND charisma <= 30),
  CONSTRAINT ability_scores_pkey PRIMARY KEY (id),
  CONSTRAINT ability_scores_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.character_details (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL UNIQUE,
  age text,
  height text,
  weight text,
  eyes text,
  skin text,
  hair text,
  personality_traits text,
  ideals text,
  bonds text,
  flaws text,
  backstory text,
  allies_organizations text,
  additional_features text,
  treasure text,
  CONSTRAINT character_details_pkey PRIMARY KEY (id),
  CONSTRAINT character_details_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.characters (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text NOT NULL,
  player_name text NOT NULL,
  race text NOT NULL,
  class text NOT NULL,
  subclass text,
  level integer DEFAULT 1 CHECK (level >= 1 AND level <= 20),
  experience_points integer DEFAULT 0,
  background text,
  alignment text,
  armor_class integer DEFAULT 10,
  initiative_bonus integer DEFAULT 0,
  speed integer DEFAULT 30,
  hit_point_maximum integer DEFAULT 1,
  current_hit_points integer DEFAULT 1,
  temporary_hit_points integer DEFAULT 0,
  hit_dice_total text,
  hit_dice_remaining integer DEFAULT 1,
  death_save_successes integer DEFAULT 0 CHECK (death_save_successes >= 0 AND death_save_successes <= 3),
  death_save_failures integer DEFAULT 0 CHECK (death_save_failures >= 0 AND death_save_failures <= 3),
  proficiency_bonus integer DEFAULT 2,
  inspiration boolean DEFAULT false,
  active_conditions ARRAY DEFAULT '{}'::text[],
  avatar_url text,
  notes text,
  game_world_id uuid,
  pending_level_up boolean DEFAULT false,
  CONSTRAINT characters_pkey PRIMARY KEY (id),
  CONSTRAINT characters_game_world_id_fkey FOREIGN KEY (game_world_id) REFERENCES public.game_worlds(id)
);
CREATE TABLE public.currency (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL UNIQUE,
  copper integer DEFAULT 0,
  silver integer DEFAULT 0,
  electrum integer DEFAULT 0,
  gold integer DEFAULT 0,
  platinum integer DEFAULT 0,
  CONSTRAINT currency_pkey PRIMARY KEY (id),
  CONSTRAINT currency_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.features_traits (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  source text,
  uses_total integer,
  uses_remaining integer,
  uses_per_rest text CHECK (uses_per_rest = ANY (ARRAY['short'::text, 'long'::text, 'short_or_long'::text, NULL::text])),
  is_bonus_action boolean DEFAULT false,
  CONSTRAINT features_traits_pkey PRIMARY KEY (id),
  CONSTRAINT features_traits_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
-- PIN hashes moved out to public.game_world_secrets at the 2026-09-16 cutover.
-- They are no longer readable through the API: a 4-digit PIN is only 10,000
-- values, so a readable hash was a readable PIN.
CREATE TABLE public.game_worlds (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text NOT NULL UNIQUE,
  is_active boolean DEFAULT true,
  description text,
  leveling_mode text DEFAULT 'milestone'::text,
  CONSTRAINT game_worlds_pkey PRIMARY KEY (id)
);
CREATE TABLE public.inventory_items (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  quantity integer DEFAULT 1,
  weight numeric,
  equipped boolean DEFAULT false,
  attuned boolean DEFAULT false,
  item_type text DEFAULT 'Gear'::text,
  CONSTRAINT inventory_items_pkey PRIMARY KEY (id),
  CONSTRAINT inventory_items_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.saving_throws (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL,
  ability text NOT NULL CHECK (ability = ANY (ARRAY['str'::text, 'dex'::text, 'con'::text, 'int'::text, 'wis'::text, 'cha'::text])),
  proficient boolean DEFAULT false,
  CONSTRAINT saving_throws_pkey PRIMARY KEY (id),
  CONSTRAINT saving_throws_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.skills (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL,
  skill_name text NOT NULL,
  proficient boolean DEFAULT false,
  expertise boolean DEFAULT false,
  CONSTRAINT skills_pkey PRIMARY KEY (id),
  CONSTRAINT skills_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.spell_slots (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL,
  slot_level integer NOT NULL CHECK (slot_level >= 1 AND slot_level <= 9),
  total integer DEFAULT 0,
  used integer DEFAULT 0,
  CONSTRAINT spell_slots_pkey PRIMARY KEY (id),
  CONSTRAINT spell_slots_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.spells (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL,
  name text NOT NULL,
  level integer DEFAULT 0 CHECK (level >= 0 AND level <= 9),
  school text,
  casting_time text,
  range text,
  components text,
  duration text,
  description text,
  prepared boolean DEFAULT false,
  api_index text,
  CONSTRAINT spells_pkey PRIMARY KEY (id),
  CONSTRAINT spells_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.weapons (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  character_id uuid NOT NULL,
  name text NOT NULL,
  attack_bonus integer DEFAULT 0,
  damage text NOT NULL,
  damage_type text,
  properties text,
  equipped boolean DEFAULT false,
  CONSTRAINT weapons_pkey PRIMARY KEY (id),
  CONSTRAINT weapons_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
-- ============================================================================
-- CAMPAIGN LAYER  (applied 2026-09-16, migrations 20260916111102-20260916111336)
-- Full annotated DDL and rationale: docs/campaigns-schema-design.md
--
-- Two conventions run through every table here:
--   1. game_world_id is carried on every campaign-owned table and tied to its
--      parent by composite foreign key, so the security policy is one indexed
--      column comparison and cross-world drift is structurally impossible.
--   2. No table has a dm_notes column. Row level security is row-level, so it
--      cannot protect a DM-only column on a player-readable row. All DM prose
--      lives in public.dm_notes; secret rows use the reveal flags.
-- ============================================================================

CREATE TABLE public.campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_world_id uuid NOT NULL,
  name text NOT NULL,
  summary text,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['planning','active','paused','completed','archived'])),
  is_default boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  started_at date,
  ended_at date,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaigns_pkey PRIMARY KEY (id),
  CONSTRAINT campaigns_game_world_id_name_key UNIQUE (game_world_id, name),
  CONSTRAINT campaigns_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT campaigns_game_world_id_fkey FOREIGN KEY (game_world_id) REFERENCES public.game_worlds(id) ON DELETE CASCADE
);

-- Characters never leave their world. Both foreign keys below share the same
-- game_world_id column, so a character cannot join another world's campaign.
CREATE TABLE public.campaign_characters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  character_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status = ANY (ARRAY['active','inactive','retired','dead','guest'])),
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  left_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_characters_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_characters_campaign_id_character_id_key UNIQUE (campaign_id, character_id),
  CONSTRAINT campaign_characters_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE,
  CONSTRAINT campaign_characters_character_fkey FOREIGN KEY (character_id, game_world_id) REFERENCES public.characters(id, game_world_id) ON DELETE CASCADE
);

CREATE TABLE public.areas (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  parent_area_id uuid,
  name text NOT NULL,
  area_type text NOT NULL DEFAULT 'location' CHECK (area_type = ANY (ARRAY['region','settlement','dungeon','landmark','building','plane','location','other'])),
  description text,
  read_aloud text,
  map_url text,
  is_discovered boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT areas_pkey PRIMARY KEY (id),
  CONSTRAINT areas_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT areas_parent_area_id_fkey FOREIGN KEY (parent_area_id) REFERENCES public.areas(id) ON DELETE SET NULL,
  CONSTRAINT areas_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE
);

CREATE TABLE public.campaign_monsters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  name text NOT NULL,
  source text NOT NULL CHECK (source = ANY (ARRAY['srd_api','homebrew'])),
  api_index text,
  statblock jsonb,
  challenge_rating numeric,
  creature_type text,
  size text,
  armor_class integer,
  max_hit_points integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_monsters_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_monsters_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT campaign_monsters_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE,
  CONSTRAINT campaign_monsters_source_shape CHECK (
    (source = 'srd_api' AND api_index IS NOT NULL) OR (source = 'homebrew' AND statblock IS NOT NULL))
);

CREATE TABLE public.storylines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  title text NOT NULL,
  player_summary text,
  body text,
  status text NOT NULL DEFAULT 'planned' CHECK (status = ANY (ARRAY['planned','active','completed','abandoned'])),
  is_revealed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT storylines_pkey PRIMARY KEY (id),
  CONSTRAINT storylines_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT storylines_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE
);

-- is_revealed is deliberately separate from status: a beat can be completed and
-- still secret, or pending and already revealed. Two independent axes.
CREATE TABLE public.storyline_beats (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  storyline_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  area_id uuid,
  title text NOT NULL,
  body text,
  read_aloud text,
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending','in_progress','completed','skipped'])),
  is_revealed boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT storyline_beats_pkey PRIMARY KEY (id),
  CONSTRAINT storyline_beats_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT storyline_beats_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL,
  CONSTRAINT storyline_beats_storyline_fkey FOREIGN KEY (storyline_id, game_world_id) REFERENCES public.storylines(id, game_world_id) ON DELETE CASCADE
);

CREATE TABLE public.npcs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  area_id uuid,
  monster_id uuid,
  name text NOT NULL,
  title text,
  faction text,
  description text,
  disposition text NOT NULL DEFAULT 'neutral' CHECK (disposition = ANY (ARRAY['friendly','neutral','hostile','unknown'])),
  status text NOT NULL DEFAULT 'alive' CHECK (status = ANY (ARRAY['alive','dead','missing','unknown'])),
  is_known_to_players boolean NOT NULL DEFAULT false,
  portrait_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT npcs_pkey PRIMARY KEY (id),
  CONSTRAINT npcs_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT npcs_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL,
  CONSTRAINT npcs_monster_id_fkey FOREIGN KEY (monster_id) REFERENCES public.campaign_monsters(id) ON DELETE SET NULL,
  CONSTRAINT npcs_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE
);

CREATE TABLE public.encounters (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  area_id uuid,
  storyline_beat_id uuid,
  name text NOT NULL,
  description text,
  read_aloud text,
  difficulty text CHECK (difficulty = ANY (ARRAY['trivial','easy','medium','hard','deadly'])),
  status text NOT NULL DEFAULT 'planned' CHECK (status = ANY (ARRAY['planned','active','completed','abandoned'])),
  round integer NOT NULL DEFAULT 0,
  active_combatant_id uuid,
  hide_monster_hp boolean NOT NULL DEFAULT true,
  started_at timestamp with time zone,
  completed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT encounters_pkey PRIMARY KEY (id),
  CONSTRAINT encounters_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT encounters_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE SET NULL,
  CONSTRAINT encounters_storyline_beat_id_fkey FOREIGN KEY (storyline_beat_id) REFERENCES public.storyline_beats(id) ON DELETE SET NULL,
  CONSTRAINT encounters_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE,
  CONSTRAINT encounters_active_combatant_fkey FOREIGN KEY (active_combatant_id) REFERENCES public.encounter_combatants(id) ON DELETE SET NULL
);

-- Player character hit points live on public.characters and nowhere else, so v1
-- and v2 can never disagree about whether a character is alive.
CREATE TABLE public.encounter_combatants (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  encounter_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  combatant_type text NOT NULL CHECK (combatant_type = ANY (ARRAY['monster','npc','character'])),
  campaign_monster_id uuid,
  npc_id uuid,
  character_id uuid,
  display_name text NOT NULL,
  initiative integer,
  armor_class integer,
  max_hit_points integer,
  current_hit_points integer,
  temporary_hit_points integer,
  conditions ARRAY NOT NULL DEFAULT '{}'::text[],
  concentrating_on text,
  is_defeated boolean NOT NULL DEFAULT false,
  has_acted boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT encounter_combatants_pkey PRIMARY KEY (id),
  CONSTRAINT encounter_combatants_campaign_monster_id_fkey FOREIGN KEY (campaign_monster_id) REFERENCES public.campaign_monsters(id) ON DELETE SET NULL,
  CONSTRAINT encounter_combatants_npc_id_fkey FOREIGN KEY (npc_id) REFERENCES public.npcs(id) ON DELETE SET NULL,
  CONSTRAINT encounter_combatants_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id) ON DELETE CASCADE,
  CONSTRAINT encounter_combatants_encounter_fkey FOREIGN KEY (encounter_id, game_world_id) REFERENCES public.encounters(id, game_world_id) ON DELETE CASCADE,
  CONSTRAINT encounter_combatants_one_ref CHECK (num_nonnulls(campaign_monster_id, npc_id, character_id) = 1),
  CONSTRAINT encounter_combatants_pc_hp_passthrough CHECK (
    combatant_type <> 'character' OR (max_hit_points IS NULL AND current_hit_points IS NULL))
);

CREATE TABLE public.campaign_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  session_number integer,
  title text,
  played_on date,
  recap text,
  is_published boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_sessions_id_game_world_id_key UNIQUE (id, game_world_id),
  CONSTRAINT campaign_sessions_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE
);

-- Attaches to exactly one of a beat, area, NPC or encounter.
-- skill_name reuses the 18-value vocabulary already in public.skills.
CREATE TABLE public.campaign_checks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL,
  game_world_id uuid NOT NULL,
  storyline_beat_id uuid,
  area_id uuid,
  npc_id uuid,
  encounter_id uuid,
  label text NOT NULL,
  check_type text NOT NULL CHECK (check_type = ANY (ARRAY['ability_check','skill_check','saving_throw','contested'])),
  ability text CHECK (ability = ANY (ARRAY['str','dex','con','int','wis','cha'])),
  skill_name text,
  dc integer NOT NULL CHECK (dc >= 1 AND dc <= 40),
  success_text text,
  failure_text text,
  is_group_check boolean NOT NULL DEFAULT false,
  is_secret boolean NOT NULL DEFAULT false,
  is_repeatable boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT campaign_checks_pkey PRIMARY KEY (id),
  CONSTRAINT campaign_checks_campaign_fkey FOREIGN KEY (campaign_id, game_world_id) REFERENCES public.campaigns(id, game_world_id) ON DELETE CASCADE,
  CONSTRAINT campaign_checks_storyline_beat_id_fkey FOREIGN KEY (storyline_beat_id) REFERENCES public.storyline_beats(id) ON DELETE CASCADE,
  CONSTRAINT campaign_checks_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE CASCADE,
  CONSTRAINT campaign_checks_npc_id_fkey FOREIGN KEY (npc_id) REFERENCES public.npcs(id) ON DELETE CASCADE,
  CONSTRAINT campaign_checks_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES public.encounters(id) ON DELETE CASCADE,
  CONSTRAINT campaign_checks_one_parent CHECK (num_nonnulls(storyline_beat_id, area_id, npc_id, encounter_id) = 1),
  CONSTRAINT campaign_checks_shape CHECK (
    (check_type = 'skill_check' AND skill_name IS NOT NULL) OR
    (check_type = ANY (ARRAY['ability_check','saving_throw']) AND ability IS NOT NULL) OR
    (check_type = 'contested'))
);

-- All DM prose, in the one table players cannot reach. Real foreign keys per
-- parent type so deleting an NPC takes its notes with it.
-- Partial unique indexes give one note per entity, like the column it replaces.
CREATE TABLE public.dm_notes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  game_world_id uuid NOT NULL,
  campaign_id uuid,
  area_id uuid,
  storyline_id uuid,
  storyline_beat_id uuid,
  npc_id uuid,
  encounter_id uuid,
  campaign_session_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT dm_notes_pkey PRIMARY KEY (id),
  CONSTRAINT dm_notes_game_world_id_fkey FOREIGN KEY (game_world_id) REFERENCES public.game_worlds(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_area_id_fkey FOREIGN KEY (area_id) REFERENCES public.areas(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_storyline_id_fkey FOREIGN KEY (storyline_id) REFERENCES public.storylines(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_storyline_beat_id_fkey FOREIGN KEY (storyline_beat_id) REFERENCES public.storyline_beats(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_npc_id_fkey FOREIGN KEY (npc_id) REFERENCES public.npcs(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_encounter_id_fkey FOREIGN KEY (encounter_id) REFERENCES public.encounters(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_campaign_session_id_fkey FOREIGN KEY (campaign_session_id) REFERENCES public.campaign_sessions(id) ON DELETE CASCADE,
  CONSTRAINT dm_notes_one_parent CHECK (num_nonnulls(campaign_id, area_id, storyline_id, storyline_beat_id, npc_id, encounter_id, campaign_session_id) = 1)
);

-- Request-scoped DM identity. No policies and no grants: unreachable via the API.
-- private.current_dm_world() reads the x-dm-token request header and is used by
-- every dm_all policy on the tables above.
CREATE TABLE public.dm_sessions (
  token_hash bytea NOT NULL,
  game_world_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  expires_at timestamp with time zone NOT NULL DEFAULT (now() + '12:00:00'::interval),
  CONSTRAINT dm_sessions_pkey PRIMARY KEY (token_hash),
  CONSTRAINT dm_sessions_game_world_id_fkey FOREIGN KEY (game_world_id) REFERENCES public.game_worlds(id) ON DELETE CASCADE
);

-- ============================================================================
-- AUTH  (cutover 2026-09-16)
-- Verified server-side by public.world_login / public.world_create, both
-- SECURITY DEFINER. The tables below have no policies and no grants to anon,
-- so they are reachable only from those functions.
-- Triggers on game_worlds: ensure_default_campaign_trg (permanent).
-- ============================================================================

CREATE TABLE public.game_world_secrets (
  game_world_id uuid NOT NULL,
  dm_pin_hash text NOT NULL,
  player_pin_hash text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT game_world_secrets_pkey PRIMARY KEY (game_world_id),
  CONSTRAINT game_world_secrets_game_world_id_fkey FOREIGN KEY (game_world_id) REFERENCES public.game_worlds(id) ON DELETE CASCADE
);

-- A 4-digit PIN is 10,000 guesses, so world_login throttles: 10 failures per
-- address per 15 minutes, with a per-world backstop of 60 so one actor cannot
-- lock a DM out of their own world. Rows older than an hour are pruned on login.
CREATE TABLE public.pin_attempts (
  id bigserial NOT NULL,
  game_world_name text NOT NULL,
  ip text,
  attempted_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT pin_attempts_pkey PRIMARY KEY (id)
);
