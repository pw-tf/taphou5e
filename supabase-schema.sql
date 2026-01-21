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
  CONSTRAINT features_traits_pkey PRIMARY KEY (id),
  CONSTRAINT features_traits_character_id_fkey FOREIGN KEY (character_id) REFERENCES public.characters(id)
);
CREATE TABLE public.game_worlds (
  id uuid NOT NULL DEFAULT uuid_generate_v4(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  name text NOT NULL UNIQUE,
  dm_pin_hash text NOT NULL,
  player_pin_hash text NOT NULL,
  is_active boolean DEFAULT true,
  description text,
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