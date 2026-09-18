// ========================================
// TAPHOU5E v2 — Rules shim
//
// `level-up-engine.js` and `feature-registry.js` live at the repository root
// and are loaded by BOTH versions. They are the single copy of the 5e rules,
// so a rules fix lands in v1 and v2 at once.
//
// The engine was written against app.js and expects a handful of globals:
// `db`, `getModifier`, `HIT_DICE`, `ABILITIES` and `ABILITY_FULL`. v2's core
// already provides `db`; this file supplies the rest under the names the
// engine uses, so the shared file needs no knowledge of which version loaded
// it. Load order is core.js -> rules.js -> feature-registry.js ->
// level-up-engine.js.
//
// The values here are copied from app.js deliberately rather than imported:
// they are rules constants, and a silent divergence would be a bug in both
// versions at once. `v2/test/smoke.py` asserts they still match v1.
// ========================================

// ---- Globals the shared engine reads ----------------------------------

const getModifier = score => Math.floor((score - 10) / 2);
const getProfBonus = level => Math.ceil(level / 4) + 1;

const HIT_DICE = {
    Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10, Bard: 8, Cleric: 8,
    Druid: 8, Monk: 8, Rogue: 8, Warlock: 8, Sorcerer: 6, Wizard: 6, Artificer: 8
};

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

const ABILITY_FULL = {
    str: 'Strength', dex: 'Dexterity', con: 'Constitution',
    int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma'
};

const ABILITY_LONG = {
    str: 'strength', dex: 'dexterity', con: 'constitution',
    int: 'intelligence', wis: 'wisdom', cha: 'charisma'
};

// ---- Character-sheet scaffolding --------------------------------------

const SKILLS = {
    'Acrobatics': 'dex', 'Animal Handling': 'wis', 'Arcana': 'int', 'Athletics': 'str',
    'Deception': 'cha', 'History': 'int', 'Insight': 'wis', 'Intimidation': 'cha',
    'Investigation': 'int', 'Medicine': 'wis', 'Nature': 'int', 'Perception': 'wis',
    'Performance': 'cha', 'Persuasion': 'cha', 'Religion': 'int', 'Sleight of Hand': 'dex',
    'Stealth': 'dex', 'Survival': 'wis'
};

// Fighters and Rogues get extra ability score improvements; everyone else
// follows the default progression.
const ASI_LEVELS = {
    Fighter: [4, 6, 8, 12, 14, 16, 19],
    Rogue:   [4, 8, 10, 12, 16, 19],
    default: [4, 8, 12, 16, 19]
};

const SUBCLASS_LEVEL = 3;

function isASILevel(characterClass, level) {
    return (ASI_LEVELS[characterClass] || ASI_LEVELS.default).includes(level);
}

// A character created above level 1 gets the average roll for every level
// after the first, which is what v1's calcHP does.
function calcHP(cls, level, conMod) {
    const hd = HIT_DICE[cls] || 8;
    return level === 1
        ? Math.max(1, hd + conMod)
        : Math.max(1, hd + conMod + (level - 1) * (Math.floor(hd / 2) + 1 + conMod));
}

function averageHPGain(cls, conMod) {
    const hd = HIT_DICE[cls] || 8;
    return Math.max(1, Math.floor(hd / 2) + 1 + conMod);
}

function rollHPGain(cls, conMod) {
    const hd = HIT_DICE[cls] || 8;
    return Math.max(1, Math.floor(Math.random() * hd) + 1 + conMod);
}

// ---- Option lists, matching v1's create form --------------------------

const RACES = ['Human', 'Elf', 'Dwarf', 'Halfling', 'Dragonborn', 'Gnome', 'Half-Elf',
    'Half-Orc', 'Tiefling', 'Aasimar', 'Goliath', 'Tabaxi', 'Kenku', 'Tortle', 'Other'];

const CLASSES = ['Fighter', 'Wizard', 'Rogue', 'Cleric', 'Barbarian', 'Bard', 'Druid',
    'Monk', 'Paladin', 'Ranger', 'Sorcerer', 'Warlock', 'Artificer'];

const BACKGROUNDS = ['Acolyte', 'Charlatan', 'Criminal', 'Entertainer', 'Folk Hero',
    'Guild Artisan', 'Hermit', 'Noble', 'Outlander', 'Sage', 'Sailor', 'Soldier', 'Urchin'];

const ALIGNMENTS = ['Lawful Good', 'Neutral Good', 'Chaotic Good', 'Lawful Neutral',
    'True Neutral', 'Chaotic Neutral', 'Lawful Evil', 'Neutral Evil', 'Chaotic Evil'];

const SUBCLASSES = {
    Barbarian: ['Path of the Berserker', 'Path of the Totem Warrior', 'Path of the Ancestral Guardian', 'Path of the Storm Herald', 'Path of the Zealot', 'Path of the Beast', 'Path of Wild Magic'],
    Bard: ['College of Lore', 'College of Valor', 'College of Glamour', 'College of Swords', 'College of Whispers', 'College of Creation', 'College of Eloquence'],
    Cleric: ['Knowledge Domain', 'Life Domain', 'Light Domain', 'Nature Domain', 'Tempest Domain', 'Trickery Domain', 'War Domain', 'Forge Domain', 'Grave Domain', 'Order Domain', 'Peace Domain', 'Twilight Domain'],
    Druid: ['Circle of the Land', 'Circle of the Moon', 'Circle of Dreams', 'Circle of the Shepherd', 'Circle of Spores', 'Circle of Stars', 'Circle of Wildfire'],
    Fighter: ['Champion', 'Battle Master', 'Eldritch Knight', 'Arcane Archer', 'Cavalier', 'Samurai', 'Echo Knight', 'Psi Warrior', 'Rune Knight'],
    Monk: ['Way of the Open Hand', 'Way of Shadow', 'Way of the Four Elements', 'Way of the Drunken Master', 'Way of the Kensei', 'Way of the Sun Soul', 'Way of Mercy', 'Way of the Astral Self'],
    Paladin: ['Oath of Devotion', 'Oath of the Ancients', 'Oath of Vengeance', 'Oath of Conquest', 'Oath of Redemption', 'Oath of Glory', 'Oath of the Watchers'],
    Ranger: ['Hunter', 'Beast Master', 'Gloom Stalker', 'Horizon Walker', 'Monster Slayer', 'Fey Wanderer', 'Swarmkeeper'],
    Rogue: ['Thief', 'Assassin', 'Arcane Trickster', 'Inquisitive', 'Mastermind', 'Scout', 'Swashbuckler', 'Phantom', 'Soulknife'],
    Sorcerer: ['Draconic Bloodline', 'Wild Magic', 'Divine Soul', 'Shadow Magic', 'Storm Sorcery', 'Aberrant Mind', 'Clockwork Soul'],
    Warlock: ['The Archfey', 'The Fiend', 'The Great Old One', 'The Celestial', 'The Hexblade', 'The Fathomless', 'The Genie'],
    Wizard: ['School of Abjuration', 'School of Conjuration', 'School of Divination', 'School of Enchantment', 'School of Evocation', 'School of Illusion', 'School of Necromancy', 'School of Transmutation', 'War Magic', 'Bladesinging', 'Order of Scribes'],
    Artificer: ['Alchemist', 'Armorer', 'Artillerist', 'Battle Smith']
};

const FEATS = [
    { name: 'Alert', description: '+5 to initiative, can\'t be surprised, no advantage for hidden attackers' },
    { name: 'Athlete', description: '+1 STR or DEX, climbing costs normal movement, jumping bonuses' },
    { name: 'Actor', description: '+1 CHA, advantage on Deception/Performance checks to pass as different person' },
    { name: 'Charger', description: 'Bonus action attack or shove after Dash action' },
    { name: 'Crossbow Expert', description: 'Ignore loading, no disadvantage in melee, bonus action hand crossbow attack' },
    { name: 'Defensive Duelist', description: 'Use reaction to add proficiency to AC with finesse weapon' },
    { name: 'Dual Wielder', description: '+1 AC with two weapons, can dual wield non-light weapons' },
    { name: 'Dungeon Delver', description: 'Advantage on saves vs traps, resistance to trap damage, search for traps faster' },
    { name: 'Durable', description: '+1 CON, minimum healing from Hit Dice equals 2×CON modifier' },
    { name: 'Elemental Adept', description: 'Spells ignore resistance to chosen element, 1s become 2s on damage' },
    { name: 'Grappler', description: 'Advantage on attacks vs grappled creature, can pin them' },
    { name: 'Great Weapon Master', description: 'Bonus action attack on crit/kill, -5 to hit for +10 damage' },
    { name: 'Healer', description: 'Stabilize with healer\'s kit restores 1 HP, kit can heal HP once per rest' },
    { name: 'Heavily Armored', description: '+1 STR, gain heavy armor proficiency' },
    { name: 'Heavy Armor Master', description: '+1 STR, reduce non-magical physical damage by 3 in heavy armor' },
    { name: 'Inspiring Leader', description: 'Give temp HP to allies after 10 min speech' },
    { name: 'Keen Mind', description: '+1 INT, always know north/time, perfect recall of past month' },
    { name: 'Lightly Armored', description: '+1 STR or DEX, gain light armor proficiency' },
    { name: 'Linguist', description: '+1 INT, learn 3 languages, create written ciphers' },
    { name: 'Lucky', description: '3 luck points per long rest to reroll or impose reroll' },
    { name: 'Mage Slayer', description: 'Reaction attack vs caster, advantage on saves vs nearby spells, break concentration' },
    { name: 'Magic Initiate', description: 'Learn 2 cantrips and 1 1st-level spell from a class' },
    { name: 'Martial Adept', description: 'Learn 2 Battle Master maneuvers, gain 1 superiority die' },
    { name: 'Medium Armor Master', description: 'No stealth disadvantage, max DEX bonus +3 instead of +2' },
    { name: 'Mobile', description: '+10 speed, no difficult terrain after Dash, no opportunity attacks from attacked enemies' },
    { name: 'Moderately Armored', description: '+1 STR or DEX, gain medium armor and shield proficiency' },
    { name: 'Mounted Combatant', description: 'Advantage on melee vs smaller unmounted, redirect attacks to mount, mount takes half damage' },
    { name: 'Observant', description: '+1 INT or WIS, +5 passive Perception/Investigation, read lips' },
    { name: 'Polearm Master', description: 'Bonus action attack with polearm, opportunity attacks when entering reach' },
    { name: 'Resilient', description: '+1 to chosen ability score, gain proficiency in that save' },
    { name: 'Ritual Caster', description: 'Learn ritual spells from chosen class, can cast as rituals' },
    { name: 'Savage Attacker', description: 'Reroll melee weapon damage once per turn' },
    { name: 'Sentinel', description: 'Opportunity attacks reduce speed to 0, attack when enemy attacks ally, ignore Disengage' },
    { name: 'Sharpshooter', description: 'Ignore cover (not total), no long range disadvantage, -5 to hit for +10 damage' },
    { name: 'Shield Master', description: 'Bonus action shove with shield, +2 AC vs single-target spells, no damage on successful DEX saves' },
    { name: 'Skilled', description: 'Gain proficiency in 3 skills or tools' },
    { name: 'Skulker', description: 'Hide in lightly obscured areas, missing with ranged doesn\'t reveal position, dim light doesn\'t impose disadvantage on Perception' },
    { name: 'Spell Sniper', description: 'Double range for attack roll spells, ignore cover (not total), learn 1 cantrip' },
    { name: 'Tavern Brawler', description: '+1 STR or CON, proficient with improvised weapons, unarmed strike d4, bonus action grapple after hit' },
    { name: 'Tough', description: 'Gain 2 HP per level (retroactive)' },
    { name: 'War Caster', description: 'Advantage on concentration saves, cast spells as opportunity attacks, cast with hands full' },
    { name: 'Weapon Master', description: '+1 STR or DEX, gain proficiency with 4 weapons' }
];

// A subclass is owed once a character reaches level 3 without one. v1 opens
// its wizard on this condition alone, with no pending flag.
function needsSubclassSelection(character) {
    return (character.level || 1) >= SUBCLASS_LEVEL && !character.subclass;
}

// ---- Starting equipment -----------------------------------------------
//
// The class and background kits v1 offers on creation, copied verbatim so the
// parity check can compare them. 5e gives real choices here ("a martial weapon
// and a shield OR two martial weapons"); v1 flattens each class to one
// representative list, and matching that matters more than being thorough --
// a character created in either version should arrive carrying the same thing.

const CLASS_STARTING_EQUIPMENT = {
    Barbarian: {
        weapons: [
            { name: "Greataxe", damage: "1d12", damage_type: "Slashing", properties: "Heavy, Two-Handed", attack_bonus: 0, equipped: false },
            { name: "Handaxe", damage: "1d6", damage_type: "Slashing", properties: "Light, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Handaxe", damage: "1d6", damage_type: "Slashing", properties: "Light, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false }
        ],
        armor: [],
        gear: [
            { name: "Explorer's Pack", description: "Backpack, bedroll, mess kit, tinderbox, 10 torches, 10 days rations, waterskin, 50 ft hemp rope", quantity: 1, weight: 59, item_type: "Gear" }
        ]
    },
    Bard: {
        weapons: [
            { name: "Rapier", damage: "1d8", damage_type: "Piercing", properties: "Finesse", attack_bonus: 0, equipped: false },
            { name: "Dagger", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown (20/60)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Leather Armor", description: "AC 11 + Dex modifier", quantity: 1, weight: 10, item_type: "Armor" }
        ],
        gear: [
            { name: "Diplomat's Pack", description: "Chest, 2 cases for maps/scrolls, fine clothes, bottle of ink, ink pen, lamp, 2 flasks of oil, 5 sheets of paper, vial of perfume, sealing wax, soap", quantity: 1, weight: 36, item_type: "Gear" },
            { name: "Lute", description: "Musical instrument", quantity: 1, weight: 2, item_type: "Gear" }
        ]
    },
    Cleric: {
        weapons: [
            { name: "Mace", damage: "1d6", damage_type: "Bludgeoning", properties: "", attack_bonus: 0, equipped: false },
            { name: "Light Crossbow", damage: "1d8", damage_type: "Piercing", properties: "Ammunition, Loading, Two-Handed, Range (80/320)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Scale Mail", description: "AC 14 + Dex modifier (max 2), Disadvantage on Stealth", quantity: 1, weight: 45, item_type: "Armor" },
            { name: "Shield", description: "+2 AC", quantity: 1, weight: 6, item_type: "Armor" }
        ],
        gear: [
            { name: "Priest's Pack", description: "Backpack, blanket, 10 candles, tinderbox, alms box, 2 blocks of incense, censer, vestments, 2 days rations, waterskin", quantity: 1, weight: 24, item_type: "Gear" },
            { name: "Holy Symbol", description: "Spellcasting focus", quantity: 1, weight: 1, item_type: "Gear" },
            { name: "Crossbow Bolts", description: "Ammunition", quantity: 20, weight: 1.5, item_type: "Gear" }
        ]
    },
    Druid: {
        weapons: [
            { name: "Scimitar", damage: "1d6", damage_type: "Slashing", properties: "Finesse, Light", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Leather Armor", description: "AC 11 + Dex modifier", quantity: 1, weight: 10, item_type: "Armor" },
            { name: "Shield", description: "+2 AC (wooden)", quantity: 1, weight: 6, item_type: "Armor" }
        ],
        gear: [
            { name: "Explorer's Pack", description: "Backpack, bedroll, mess kit, tinderbox, 10 torches, 10 days rations, waterskin, 50 ft hemp rope", quantity: 1, weight: 59, item_type: "Gear" },
            { name: "Druidic Focus", description: "Spellcasting focus (wooden staff)", quantity: 1, weight: 4, item_type: "Gear" }
        ]
    },
    Fighter: {
        weapons: [
            { name: "Longsword", damage: "1d8", damage_type: "Slashing", properties: "Versatile (1d10)", attack_bonus: 0, equipped: false },
            { name: "Light Crossbow", damage: "1d8", damage_type: "Piercing", properties: "Ammunition, Loading, Two-Handed, Range (80/320)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Chain Mail", description: "AC 16, Str 13 required, Disadvantage on Stealth", quantity: 1, weight: 55, item_type: "Armor" },
            { name: "Shield", description: "+2 AC", quantity: 1, weight: 6, item_type: "Armor" }
        ],
        gear: [
            { name: "Dungeoneer's Pack", description: "Backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft hemp rope", quantity: 1, weight: 61.5, item_type: "Gear" },
            { name: "Crossbow Bolts", description: "Ammunition", quantity: 20, weight: 1.5, item_type: "Gear" }
        ]
    },
    Monk: {
        weapons: [
            { name: "Shortsword", damage: "1d6", damage_type: "Piercing", properties: "Finesse, Light", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dart", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Thrown (20/60)", attack_bonus: 0, equipped: false }
        ],
        armor: [],
        gear: [
            { name: "Dungeoneer's Pack", description: "Backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft hemp rope", quantity: 1, weight: 61.5, item_type: "Gear" }
        ]
    },
    Paladin: {
        weapons: [
            { name: "Longsword", damage: "1d8", damage_type: "Slashing", properties: "Versatile (1d10)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false },
            { name: "Javelin", damage: "1d6", damage_type: "Piercing", properties: "Thrown (30/120)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Chain Mail", description: "AC 16, Str 13 required, Disadvantage on Stealth", quantity: 1, weight: 55, item_type: "Armor" },
            { name: "Shield", description: "+2 AC", quantity: 1, weight: 6, item_type: "Armor" }
        ],
        gear: [
            { name: "Priest's Pack", description: "Backpack, blanket, 10 candles, tinderbox, alms box, 2 blocks of incense, censer, vestments, 2 days rations, waterskin", quantity: 1, weight: 24, item_type: "Gear" },
            { name: "Holy Symbol", description: "Spellcasting focus", quantity: 1, weight: 1, item_type: "Gear" }
        ]
    },
    Ranger: {
        weapons: [
            { name: "Shortsword", damage: "1d6", damage_type: "Piercing", properties: "Finesse, Light", attack_bonus: 0, equipped: false },
            { name: "Shortsword", damage: "1d6", damage_type: "Piercing", properties: "Finesse, Light", attack_bonus: 0, equipped: false },
            { name: "Longbow", damage: "1d8", damage_type: "Piercing", properties: "Ammunition, Heavy, Two-Handed, Range (150/600)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Scale Mail", description: "AC 14 + Dex modifier (max 2), Disadvantage on Stealth", quantity: 1, weight: 45, item_type: "Armor" }
        ],
        gear: [
            { name: "Dungeoneer's Pack", description: "Backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft hemp rope", quantity: 1, weight: 61.5, item_type: "Gear" },
            { name: "Arrows", description: "Ammunition", quantity: 20, weight: 1, item_type: "Gear" }
        ]
    },
    Rogue: {
        weapons: [
            { name: "Rapier", damage: "1d8", damage_type: "Piercing", properties: "Finesse", attack_bonus: 0, equipped: false },
            { name: "Shortbow", damage: "1d6", damage_type: "Piercing", properties: "Ammunition, Two-Handed, Range (80/320)", attack_bonus: 0, equipped: false },
            { name: "Dagger", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dagger", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown (20/60)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Leather Armor", description: "AC 11 + Dex modifier", quantity: 1, weight: 10, item_type: "Armor" }
        ],
        gear: [
            { name: "Burglar's Pack", description: "Backpack, bag of 1000 ball bearings, 10 ft string, bell, 5 candles, crowbar, hammer, 10 pitons, hooded lantern, 2 flasks of oil, 5 days rations, tinderbox, waterskin, 50 ft hemp rope", quantity: 1, weight: 44.5, item_type: "Gear" },
            { name: "Thieves' Tools", description: "Proficiency required to use", quantity: 1, weight: 1, item_type: "Gear" },
            { name: "Arrows", description: "Ammunition", quantity: 20, weight: 1, item_type: "Gear" }
        ]
    },
    Sorcerer: {
        weapons: [
            { name: "Light Crossbow", damage: "1d8", damage_type: "Piercing", properties: "Ammunition, Loading, Two-Handed, Range (80/320)", attack_bonus: 0, equipped: false },
            { name: "Dagger", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dagger", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown (20/60)", attack_bonus: 0, equipped: false }
        ],
        armor: [],
        gear: [
            { name: "Dungeoneer's Pack", description: "Backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft hemp rope", quantity: 1, weight: 61.5, item_type: "Gear" },
            { name: "Arcane Focus", description: "Spellcasting focus (crystal)", quantity: 1, weight: 1, item_type: "Gear" },
            { name: "Crossbow Bolts", description: "Ammunition", quantity: 20, weight: 1.5, item_type: "Gear" }
        ]
    },
    Warlock: {
        weapons: [
            { name: "Light Crossbow", damage: "1d8", damage_type: "Piercing", properties: "Ammunition, Loading, Two-Handed, Range (80/320)", attack_bonus: 0, equipped: false },
            { name: "Dagger", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown (20/60)", attack_bonus: 0, equipped: false },
            { name: "Dagger", damage: "1d4", damage_type: "Piercing", properties: "Finesse, Light, Thrown (20/60)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Leather Armor", description: "AC 11 + Dex modifier", quantity: 1, weight: 10, item_type: "Armor" }
        ],
        gear: [
            { name: "Scholar's Pack", description: "Backpack, book of lore, bottle of ink, ink pen, 10 sheets of parchment, little bag of sand, small knife", quantity: 1, weight: 10, item_type: "Gear" },
            { name: "Arcane Focus", description: "Spellcasting focus (rod)", quantity: 1, weight: 2, item_type: "Gear" },
            { name: "Crossbow Bolts", description: "Ammunition", quantity: 20, weight: 1.5, item_type: "Gear" }
        ]
    },
    Wizard: {
        weapons: [
            { name: "Quarterstaff", damage: "1d6", damage_type: "Bludgeoning", properties: "Versatile (1d8)", attack_bonus: 0, equipped: false }
        ],
        armor: [],
        gear: [
            { name: "Scholar's Pack", description: "Backpack, book of lore, bottle of ink, ink pen, 10 sheets of parchment, little bag of sand, small knife", quantity: 1, weight: 10, item_type: "Gear" },
            { name: "Spellbook", description: "Required for preparing spells", quantity: 1, weight: 3, item_type: "Gear" },
            { name: "Component Pouch", description: "Spellcasting components", quantity: 1, weight: 2, item_type: "Gear" }
        ]
    },
    Artificer: {
        weapons: [
            { name: "Light Crossbow", damage: "1d8", damage_type: "Piercing", properties: "Ammunition, Loading, Two-Handed, Range (80/320)", attack_bonus: 0, equipped: false }
        ],
        armor: [
            { name: "Scale Mail", description: "AC 14 + Dex modifier (max 2), Disadvantage on Stealth", quantity: 1, weight: 45, item_type: "Armor" }
        ],
        gear: [
            { name: "Dungeoneer's Pack", description: "Backpack, crowbar, hammer, 10 pitons, 10 torches, tinderbox, 10 days rations, waterskin, 50 ft hemp rope", quantity: 1, weight: 61.5, item_type: "Gear" },
            { name: "Thieves' Tools", description: "Proficiency required to use", quantity: 1, weight: 1, item_type: "Gear" },
            { name: "Crossbow Bolts", description: "Ammunition", quantity: 20, weight: 1.5, item_type: "Gear" }
        ]
    }
};

const BACKGROUND_STARTING_EQUIPMENT = {
    Acolyte: {
        gear: [
            { name: "Holy Symbol", description: "A gift from when you entered the priesthood", quantity: 1, weight: 1, item_type: "Gear" },
            { name: "Prayer Book", description: "A book of prayers", quantity: 1, weight: 2, item_type: "Gear" },
            { name: "Incense", description: "5 sticks of incense", quantity: 5, weight: 0, item_type: "Gear" },
            { name: "Vestments", description: "A set of common clothes", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 15 }
    },
    Charlatan: {
        gear: [
            { name: "Fine Clothes", description: "A set of fine clothes", quantity: 1, weight: 6, item_type: "Gear" },
            { name: "Disguise Kit", description: "Tools for creating disguises", quantity: 1, weight: 3, item_type: "Gear" },
            { name: "Con Tools", description: "Stoppered bottles, weighted dice, marked cards, or signet ring", quantity: 1, weight: 1, item_type: "Gear" }
        ],
        currency: { gold: 15 }
    },
    Criminal: {
        gear: [
            { name: "Crowbar", description: "An iron crowbar", quantity: 1, weight: 5, item_type: "Gear" },
            { name: "Dark Common Clothes", description: "A set of dark common clothes including a hood", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 15 }
    },
    Entertainer: {
        gear: [
            { name: "Musical Instrument", description: "One musical instrument of your choice", quantity: 1, weight: 3, item_type: "Gear" },
            { name: "Favor of an Admirer", description: "A love letter, lock of hair, or trinket", quantity: 1, weight: 0, item_type: "Treasure" },
            { name: "Costume", description: "A costume", quantity: 1, weight: 4, item_type: "Gear" }
        ],
        currency: { gold: 15 }
    },
    "Folk Hero": {
        gear: [
            { name: "Artisan's Tools", description: "One type of artisan's tools", quantity: 1, weight: 5, item_type: "Gear" },
            { name: "Shovel", description: "A shovel", quantity: 1, weight: 5, item_type: "Gear" },
            { name: "Iron Pot", description: "An iron pot", quantity: 1, weight: 10, item_type: "Gear" },
            { name: "Common Clothes", description: "A set of common clothes", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 10 }
    },
    "Guild Artisan": {
        gear: [
            { name: "Artisan's Tools", description: "One type of artisan's tools", quantity: 1, weight: 5, item_type: "Gear" },
            { name: "Letter of Introduction", description: "A letter of introduction from your guild", quantity: 1, weight: 0, item_type: "Gear" },
            { name: "Traveler's Clothes", description: "A set of traveler's clothes", quantity: 1, weight: 4, item_type: "Gear" }
        ],
        currency: { gold: 15 }
    },
    Hermit: {
        gear: [
            { name: "Scroll Case of Notes", description: "Notes from your studies or prayers", quantity: 1, weight: 1, item_type: "Gear" },
            { name: "Winter Blanket", description: "A winter blanket", quantity: 1, weight: 3, item_type: "Gear" },
            { name: "Common Clothes", description: "A set of common clothes", quantity: 1, weight: 3, item_type: "Gear" },
            { name: "Herbalism Kit", description: "An herbalism kit", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 5 }
    },
    Noble: {
        gear: [
            { name: "Fine Clothes", description: "A set of fine clothes", quantity: 1, weight: 6, item_type: "Gear" },
            { name: "Signet Ring", description: "A signet ring", quantity: 1, weight: 0, item_type: "Treasure" },
            { name: "Scroll of Pedigree", description: "A scroll of pedigree", quantity: 1, weight: 0, item_type: "Gear" }
        ],
        currency: { gold: 25 }
    },
    Outlander: {
        gear: [
            { name: "Staff", description: "A staff", quantity: 1, weight: 4, item_type: "Gear" },
            { name: "Hunting Trap", description: "A hunting trap", quantity: 1, weight: 25, item_type: "Gear" },
            { name: "Trophy", description: "A trophy from an animal you killed", quantity: 1, weight: 0, item_type: "Treasure" },
            { name: "Traveler's Clothes", description: "A set of traveler's clothes", quantity: 1, weight: 4, item_type: "Gear" }
        ],
        currency: { gold: 10 }
    },
    Sage: {
        gear: [
            { name: "Bottle of Black Ink", description: "A bottle of black ink", quantity: 1, weight: 0, item_type: "Gear" },
            { name: "Quill", description: "A quill", quantity: 1, weight: 0, item_type: "Gear" },
            { name: "Small Knife", description: "A small knife", quantity: 1, weight: 0.5, item_type: "Gear" },
            { name: "Letter from Dead Colleague", description: "A letter posing a question you cannot answer", quantity: 1, weight: 0, item_type: "Gear" },
            { name: "Common Clothes", description: "A set of common clothes", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 10 }
    },
    Sailor: {
        gear: [
            { name: "Belaying Pin (Club)", description: "A belaying pin (club)", quantity: 1, weight: 2, item_type: "Gear" },
            { name: "Silk Rope", description: "50 feet of silk rope", quantity: 1, weight: 5, item_type: "Gear" },
            { name: "Lucky Charm", description: "A rabbit foot or small stone with a hole", quantity: 1, weight: 0, item_type: "Treasure" },
            { name: "Common Clothes", description: "A set of common clothes", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 10 }
    },
    Soldier: {
        gear: [
            { name: "Insignia of Rank", description: "An insignia of rank", quantity: 1, weight: 0, item_type: "Treasure" },
            { name: "Trophy from Fallen Enemy", description: "A dagger, broken blade, or piece of banner", quantity: 1, weight: 1, item_type: "Treasure" },
            { name: "Bone Dice", description: "A set of bone dice or deck of cards", quantity: 1, weight: 0, item_type: "Gear" },
            { name: "Common Clothes", description: "A set of common clothes", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 10 }
    },
    Urchin: {
        gear: [
            { name: "Small Knife", description: "A small knife", quantity: 1, weight: 0.5, item_type: "Gear" },
            { name: "Map of Home City", description: "A map of the city you grew up in", quantity: 1, weight: 0, item_type: "Gear" },
            { name: "Pet Mouse", description: "A pet mouse", quantity: 1, weight: 0, item_type: "Other" },
            { name: "Token of Parents", description: "A token to remember your parents by", quantity: 1, weight: 0, item_type: "Treasure" },
            { name: "Common Clothes", description: "A set of common clothes", quantity: 1, weight: 3, item_type: "Gear" }
        ],
        currency: { gold: 10 }
    }
};

// What the kit adds, for the prompt that offers it.
function startingKitSummary(cls, background) {
    const classKit = CLASS_STARTING_EQUIPMENT[cls];
    const bgKit = BACKGROUND_STARTING_EQUIPMENT[background];
    const weapons = (classKit && classKit.weapons) || [];
    const armour = (classKit && classKit.armor) || [];
    const gear = ((classKit && classKit.gear) || []).concat((bgKit && bgKit.gear) || []);
    const gold = (bgKit && bgKit.currency && bgKit.currency.gold) || 0;

    return {
        weapons, armour, gear, gold,
        empty: !weapons.length && !armour.length && !gear.length && !gold
    };
}

// ---- Ability score generation -----------------------------------------

const STANDARD_ARRAY = [15, 14, 13, 12, 10, 8];

// Point buy costs from the Player's Handbook. 8 is free; 14 and 15 cost two
// points each rather than one, which is the whole reason the table exists.
const POINT_BUY_COST = { 8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9 };
const POINT_BUY_BUDGET = 27;
const POINT_BUY_MIN = 8;
const POINT_BUY_MAX = 15;

function pointBuySpent(scores) {
    return ABILITIES.reduce((total, a) => total + (POINT_BUY_COST[scores[a]] ?? 0), 0);
}

function pointBuyRemaining(scores) {
    return POINT_BUY_BUDGET - pointBuySpent(scores);
}

// Whether a score can move by `delta` without going out of range or over
// budget. The UI disables the button rather than letting a click fail.
function pointBuyCanChange(scores, ability, delta) {
    const next = scores[ability] + delta;
    if (next < POINT_BUY_MIN || next > POINT_BUY_MAX) return false;
    const cost = POINT_BUY_COST[next] - POINT_BUY_COST[scores[ability]];
    return cost <= pointBuyRemaining(scores);
}

function roll4d6Drop() {
    const dice = [0, 0, 0, 0].map(() => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a);
    return dice[0] + dice[1] + dice[2];
}

// ---- Racial bonus preview ---------------------------------------------

// The engine applies racial bonuses on save; this shows them beforehand so a
// player picking a race can see what it does to the scores they just set.
function racialBonusFor(race) {
    const engine = window.LevelUpEngine;
    return (engine && engine.RACIAL_ABILITY_BONUSES[race]) || {};
}

function racialBonusSummary(race) {
    const bonuses = racialBonusFor(race);
    const parts = Object.entries(bonuses).map(([long, value]) => {
        const short = ABILITIES.find(a => ABILITY_LONG[a] === long) || long;
        return `${short.toUpperCase()} +${value}`;
    });
    if (race === 'Half-Elf') parts.push('and two of your choice +1');
    return parts.length ? parts.join(', ') : 'No ability bonuses';
}

// Scores as they will be stored: what was entered, plus the racial bonus.
function withRacialBonuses(scores, race, halfElfChoices = []) {
    const bonuses = racialBonusFor(race);
    const out = {};
    ABILITIES.forEach(a => {
        out[a] = scores[a] + (bonuses[ABILITY_LONG[a]] || 0)
                           + (halfElfChoices.includes(ABILITY_LONG[a]) ? 1 : 0);
    });
    return out;
}
