-- D&D 5e Character Sheet Database Schema
-- Run this in the Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Characters table (main table)
CREATE TABLE characters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    name TEXT NOT NULL,
    player_name TEXT NOT NULL,
    race TEXT NOT NULL,
    class TEXT NOT NULL,
    subclass TEXT,
    level INTEGER DEFAULT 1 CHECK (level >= 1 AND level <= 20),
    experience_points INTEGER DEFAULT 0,
    background TEXT,
    alignment TEXT,
    armor_class INTEGER DEFAULT 10,
    initiative_bonus INTEGER DEFAULT 0,
    speed INTEGER DEFAULT 30,
    hit_point_maximum INTEGER DEFAULT 1,
    current_hit_points INTEGER DEFAULT 1,
    temporary_hit_points INTEGER DEFAULT 0,
    hit_dice_total TEXT,
    hit_dice_remaining INTEGER DEFAULT 1,
    death_save_successes INTEGER DEFAULT 0 CHECK (death_save_successes >= 0 AND death_save_successes <= 3),
    death_save_failures INTEGER DEFAULT 0 CHECK (death_save_failures >= 0 AND death_save_failures <= 3),
    proficiency_bonus INTEGER DEFAULT 2,
    inspiration BOOLEAN DEFAULT FALSE,
    active_conditions TEXT[] DEFAULT '{}',
    avatar_url TEXT,
    notes TEXT
);

-- Ability Scores table
CREATE TABLE ability_scores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    strength INTEGER DEFAULT 10 CHECK (strength >= 1 AND strength <= 30),
    dexterity INTEGER DEFAULT 10 CHECK (dexterity >= 1 AND dexterity <= 30),
    constitution INTEGER DEFAULT 10 CHECK (constitution >= 1 AND constitution <= 30),
    intelligence INTEGER DEFAULT 10 CHECK (intelligence >= 1 AND intelligence <= 30),
    wisdom INTEGER DEFAULT 10 CHECK (wisdom >= 1 AND wisdom <= 30),
    charisma INTEGER DEFAULT 10 CHECK (charisma >= 1 AND charisma <= 30),
    UNIQUE(character_id)
);

-- Skills table
CREATE TABLE skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    skill_name TEXT NOT NULL,
    proficient BOOLEAN DEFAULT FALSE,
    expertise BOOLEAN DEFAULT FALSE,
    UNIQUE(character_id, skill_name)
);

-- Saving Throws table
CREATE TABLE saving_throws (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    ability TEXT NOT NULL CHECK (ability IN ('str', 'dex', 'con', 'int', 'wis', 'cha')),
    proficient BOOLEAN DEFAULT FALSE,
    UNIQUE(character_id, ability)
);

-- Inventory Items table
CREATE TABLE inventory_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    quantity INTEGER DEFAULT 1,
    weight DECIMAL,
    equipped BOOLEAN DEFAULT FALSE,
    attuned BOOLEAN DEFAULT FALSE,
    item_type TEXT DEFAULT 'Gear'
);

-- Weapons table
CREATE TABLE weapons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    attack_bonus INTEGER DEFAULT 0,
    damage TEXT NOT NULL,
    damage_type TEXT,
    properties TEXT,
    equipped BOOLEAN DEFAULT FALSE
);

-- Spells table
CREATE TABLE spells (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    level INTEGER DEFAULT 0 CHECK (level >= 0 AND level <= 9),
    school TEXT,
    casting_time TEXT,
    range TEXT,
    components TEXT,
    duration TEXT,
    description TEXT,
    prepared BOOLEAN DEFAULT FALSE,
    api_index TEXT
);

-- Spell Slots table
CREATE TABLE spell_slots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    slot_level INTEGER NOT NULL CHECK (slot_level >= 1 AND slot_level <= 9),
    total INTEGER DEFAULT 0,
    used INTEGER DEFAULT 0,
    UNIQUE(character_id, slot_level)
);

-- Features and Traits table
CREATE TABLE features_traits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    source TEXT,
    uses_total INTEGER,
    uses_remaining INTEGER
);

-- Currency table
CREATE TABLE currency (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    copper INTEGER DEFAULT 0,
    silver INTEGER DEFAULT 0,
    electrum INTEGER DEFAULT 0,
    gold INTEGER DEFAULT 0,
    platinum INTEGER DEFAULT 0,
    UNIQUE(character_id)
);

-- Character Details table
CREATE TABLE character_details (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    character_id UUID NOT NULL REFERENCES characters(id) ON DELETE CASCADE,
    age TEXT,
    height TEXT,
    weight TEXT,
    eyes TEXT,
    skin TEXT,
    hair TEXT,
    personality_traits TEXT,
    ideals TEXT,
    bonds TEXT,
    flaws TEXT,
    backstory TEXT,
    allies_organizations TEXT,
    additional_features TEXT,
    treasure TEXT,
    UNIQUE(character_id)
);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Add trigger to characters table
CREATE TRIGGER update_characters_updated_at
    BEFORE UPDATE ON characters
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS) - but allow all access for this friend group app
ALTER TABLE characters ENABLE ROW LEVEL SECURITY;
ALTER TABLE ability_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE saving_throws ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE weapons ENABLE ROW LEVEL SECURITY;
ALTER TABLE spells ENABLE ROW LEVEL SECURITY;
ALTER TABLE spell_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE features_traits ENABLE ROW LEVEL SECURITY;
ALTER TABLE currency ENABLE ROW LEVEL SECURITY;
ALTER TABLE character_details ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations for anon users (since this is a friends-only app)
CREATE POLICY "Allow all access to characters" ON characters FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to ability_scores" ON ability_scores FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to skills" ON skills FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to saving_throws" ON saving_throws FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to inventory_items" ON inventory_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to weapons" ON weapons FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to spells" ON spells FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to spell_slots" ON spell_slots FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to features_traits" ON features_traits FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to currency" ON currency FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all access to character_details" ON character_details FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime for live updates (DM and players can see changes instantly)
ALTER PUBLICATION supabase_realtime ADD TABLE characters;
ALTER PUBLICATION supabase_realtime ADD TABLE ability_scores;
ALTER PUBLICATION supabase_realtime ADD TABLE skills;
ALTER PUBLICATION supabase_realtime ADD TABLE saving_throws;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;
ALTER PUBLICATION supabase_realtime ADD TABLE weapons;
ALTER PUBLICATION supabase_realtime ADD TABLE spells;
ALTER PUBLICATION supabase_realtime ADD TABLE spell_slots;
ALTER PUBLICATION supabase_realtime ADD TABLE features_traits;
ALTER PUBLICATION supabase_realtime ADD TABLE currency;
ALTER PUBLICATION supabase_realtime ADD TABLE character_details;

-- Create indexes for better query performance
CREATE INDEX idx_ability_scores_character_id ON ability_scores(character_id);
CREATE INDEX idx_skills_character_id ON skills(character_id);
CREATE INDEX idx_saving_throws_character_id ON saving_throws(character_id);
CREATE INDEX idx_inventory_items_character_id ON inventory_items(character_id);
CREATE INDEX idx_weapons_character_id ON weapons(character_id);
CREATE INDEX idx_spells_character_id ON spells(character_id);
CREATE INDEX idx_spell_slots_character_id ON spell_slots(character_id);
CREATE INDEX idx_features_traits_character_id ON features_traits(character_id);
CREATE INDEX idx_currency_character_id ON currency(character_id);
CREATE INDEX idx_character_details_character_id ON character_details(character_id);
