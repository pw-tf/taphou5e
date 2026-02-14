// ========================================
// Supabase Configuration
// ========================================
const SUPABASE_URL = 'https://zlsguyiwwwbyoqxdewsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpsc2d1eWl3d3dieW9xeGRld3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzU0NzMsImV4cCI6MjA4NDIxMTQ3M30.LNcqEHFvGobozl5oPNs_GYpduYBoNmM7n6IhbuInfb4';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});


// ========================================
// D&D 5e API Configuration
// ========================================
const DND_API_BASE = 'https://www.dnd5eapi.co/api';

// ========================================
// Constants
// ========================================
const SKILLS = {
    'Acrobatics': 'dex', 'Animal Handling': 'wis', 'Arcana': 'int', 'Athletics': 'str',
    'Deception': 'cha', 'History': 'int', 'Insight': 'wis', 'Intimidation': 'cha',
    'Investigation': 'int', 'Medicine': 'wis', 'Nature': 'int', 'Perception': 'wis',
    'Performance': 'cha', 'Persuasion': 'cha', 'Religion': 'int', 'Sleight of Hand': 'dex',
    'Stealth': 'dex', 'Survival': 'wis'
};

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_FULL = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const ABILITY_SHORT = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 
    'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];

const HIT_DICE = { Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10, Bard: 8, Cleric: 8, Druid: 8, 
    Monk: 8, Rogue: 8, Warlock: 8, Sorcerer: 6, Wizard: 6, Artificer: 8 };

// Special attacks that aren't in the API (e.g., Unarmed Strike)
const SPECIAL_ATTACKS = [
    {
        name: 'Unarmed Strike',
        damage: '1+STR',
        damage_type: 'Bludgeoning',
        properties: 'Melee',
        description: 'Instead of using a weapon to make a melee weapon attack, you can use an unarmed strike: a punch, kick, head-butt, or similar forceful blow (none of which count as weapons). On a hit, an unarmed strike deals bludgeoning damage equal to 1 + your Strength modifier. You are proficient with your unarmed strikes.',
        special_options: [
            {
                name: 'Damage',
                description: 'Make an attack roll against the target. Your bonus to the roll equals your Strength modifier plus your Proficiency Bonus. On a hit, the target takes Bludgeoning damage equal to 1 + your Strength modifier.'
            },
            {
                name: 'Grapple',
                description: 'The target must succeed on a Strength or Dexterity saving throw (it chooses which), or it has the Grappled condition. The DC for the saving throw and any escape attempts equals 8 + your Strength modifier + Proficiency Bonus. This grapple is possible only if the target is no more than one size larger than you and if you have a hand free to grab it.\n\nGrappled Condition: Speed is 0. Disadvantage on attack rolls against any target other than the grappler. The grappler can drag or carry you when moving (costs 1 extra foot per foot moved).'
            },
            {
                name: 'Shove',
                description: 'The target must succeed on a Strength or Dexterity saving throw (it chooses which), or you either push the target 5 feet away or cause it to have the Prone condition. The DC for the saving throw equals 8 + your Strength modifier + Proficiency Bonus. This shove is possible only if the target is no more than one size larger than you.'
            }
        ]
    },
    {
        name: 'Improvised Weapon',
        damage: '1d4+STR',
        damage_type: 'Bludgeoning',
        properties: 'Melee or Ranged (20/60)',
        description: 'An improvised weapon includes any object you can wield in one or two hands, such as broken glass, a table leg, a frying pan, a wagon wheel, or a dead goblin.'
    }
];

// Common bonus actions available to all characters
const COMMON_BONUS_ACTIONS = [
    {
        name: 'Two-Weapon Fighting',
        description: 'When you take the Attack action and attack with a light melee weapon that you\'re holding in one hand, you can use a bonus action to attack with a different light melee weapon that you\'re holding in the other hand. You don\'t add your ability modifier to the damage of the bonus attack, unless that modifier is negative.',
        source: 'Combat'
    },
    {
        name: 'Offhand Attack',
        description: 'If you are wielding two light melee weapons, you can make an attack with your off-hand weapon as a bonus action after taking the Attack action. You don\'t add your ability modifier to the damage unless it\'s negative (or you have the Two-Weapon Fighting style).',
        source: 'Combat'
    }
];

// Subclasses by class (PHB, Xanathar's, Tasha's, and other official sources)
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

// Official D&D 5e Feats
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

// ASI levels by class
const ASI_LEVELS = {
    Fighter: [4, 6, 8, 12, 14, 16, 19],
    Rogue: [4, 8, 10, 12, 16, 19],
    default: [4, 8, 12, 16, 19]
};

// Subclass selection level
const SUBCLASS_LEVEL = 3;

// 5e EXP thresholds per level
const EXP_THRESHOLDS = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

function getLevelForEXP(exp) {
    for (let i = EXP_THRESHOLDS.length - 1; i >= 0; i--) {
        if (exp >= EXP_THRESHOLDS[i]) return i + 1;
    }
    return 1;
}

function getEXPForNextLevel(level) {
    if (level >= 20) return null;
    return EXP_THRESHOLDS[level];
}

// 5e PHB Starting Equipment by Class
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

// 5e PHB Starting Equipment by Background
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

// ========================================
// State
// ========================================
let characters = [];
let currentCharacter = null;
let currentTab = 'stats';
let apiSearchCache = {};
let currentSearchController = null;

// ========================================
// Utility Functions
// ========================================
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const getModifier = score => Math.floor((score - 10) / 2);
const formatMod = mod => mod >= 0 ? `+${mod}` : `${mod}`;
const getProfBonus = level => Math.ceil(level / 4) + 1;
const escapeHtml = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };

// ========================================
// Session Management
// ========================================
let currentSession = null;

async function validateSession() {
    console.log('Validating session...');
    
    // Check for session in localStorage or sessionStorage
    let session = JSON.parse(localStorage.getItem('dnd-session') || sessionStorage.getItem('dnd-session') || 'null');
    
    if (!session) {
        console.log('No session found, redirecting to login...');
        // No session, redirect to login
        window.location.href = 'index.html';
        return false;
    }
    
    console.log('Session found:', session);
    
    // Check if session is less than 7 days old
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - session.timestamp > oneWeek) {
        console.log('Session expired, clearing...');
        // Clear expired session
        clearSession();
        window.location.href = 'index.html';
        return false;
    }
    
    // Verify game world still exists
    try {
        const { data: gameWorld, error } = await db
            .from('game_worlds')
            .select('*')
            .eq('id', session.gameWorldId)
            .eq('is_active', true)
            .single();
        
        if (error || !gameWorld) {
            console.error('Game world not found or error:', error);
            // Game world not found, clear session and redirect
            clearSession();
            window.location.href = 'index.html';
            return false;
        }
        
        console.log('Game world found:', gameWorld.name);
        
        currentSession = {
            ...session,
            gameWorld
        };
        
        return true;
    } catch (error) {
        console.error('Error validating session:', error);
        clearSession();
        window.location.href = 'index.html';
        return false;
    }
}

function clearSession() {
    console.log('Clearing session...');
    localStorage.removeItem('dnd-session');
    sessionStorage.removeItem('dnd-session');
    sessionStorage.removeItem('dnd-current-page');
    sessionStorage.removeItem('dnd-current-character-id');
    currentSession = null;
}

async function loadCharacters() {
    if (!currentSession) {
        console.error('No session when loading characters');
        return;
    }

    console.log('Loading characters for game world:', currentSession.gameWorldId);

    const { data, error } = await db
        .from('characters')
        .select(`*, ability_scores (*), skills (*)`)
        .eq('game_world_id', currentSession.gameWorldId)
        .order('name', { ascending: true });

    if (error) {
        console.error('Error loading characters:', error);
        return;
    }

    characters = data || [];
    console.log(`Loaded ${characters.length} characters`);
    renderRoster();
}


// Get ability score with consistent key access
function getAbilityScore(abilityScores, shortKey) {
    if (!abilityScores) return 10;
    const fullKey = ABILITY_FULL[shortKey]?.toLowerCase();
    return abilityScores[fullKey] || abilityScores[shortKey] || 10;
}

function getPassivePerception(char) {
    if (!char.ability_scores) return 10;
    const wisMod = getModifier(getAbilityScore(char.ability_scores, 'wis'));
    const profBonus = getProfBonus(char.level);
    const skill = char.skills?.find(s => s.skill_name === 'Perception');
    let bonus = wisMod;
    if (skill?.proficient) bonus += profBonus;
    if (skill?.expertise) bonus += profBonus;
    return 10 + bonus;
}

function getHpPercent(curr, max) { return Math.max(0, Math.min(100, (curr / max) * 100)); }
function getHpClass(pct) { return pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low'; }
function roll4d6Drop() { const r = [0,0,0,0].map(() => Math.floor(Math.random() * 6) + 1).sort((a,b) => b-a); return r[0]+r[1]+r[2]; }
function calcHP(cls, lvl, conMod) { const hd = HIT_DICE[cls] || 8; return lvl === 1 ? Math.max(1, hd + conMod) : Math.max(1, hd + conMod + (lvl-1) * (Math.floor(hd/2) + 1 + conMod)); }

function showPage(id) {
    $$('.page').forEach(p => p.classList.add('hidden'));
    $(`#${id}`).classList.remove('hidden');
    // Save current page state to sessionStorage (persists on refresh only)
    if (id === 'character-page' && currentCharacter) {
        sessionStorage.setItem('dnd-current-page', 'character-page');
        sessionStorage.setItem('dnd-current-character-id', currentCharacter.id);
    } else if (id === 'home-page') {
        sessionStorage.setItem('dnd-current-page', 'home-page');
        sessionStorage.removeItem('dnd-current-character-id');
    } else if (id === 'create-page') {
        sessionStorage.setItem('dnd-current-page', 'create-page');
    }
}
function showLoading() { $('#loading').classList.remove('hidden'); }
function hideLoading() { $('#loading').classList.add('hidden'); }

// Debounce utility for API searches
function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ========================================
// D&D 5e API Functions
// ========================================
async function searchDndApi(endpoint, query) {
    if (!query || query.length < 2) return [];
    
    const cacheKey = `${endpoint}:${query.toLowerCase()}`;
    if (apiSearchCache[cacheKey]) return apiSearchCache[cacheKey];
    
    // Cancel previous request
    if (currentSearchController) {
        currentSearchController.abort();
    }
    currentSearchController = new AbortController();
    
    try {
        const response = await fetch(`${DND_API_BASE}/${endpoint}?name=${encodeURIComponent(query)}`, {
            signal: currentSearchController.signal
        });
        if (!response.ok) return [];
        const data = await response.json();
        const results = data.results || [];
        apiSearchCache[cacheKey] = results;
        return results;
    } catch (e) {
        if (e.name === 'AbortError') return [];
        console.error('API search error:', e);
        return [];
    }
}

// Search multiple endpoints for features/traits/feats
async function searchMultipleEndpoints(endpoints, query) {
    if (!query || query.length < 2) return [];
    
    // Cancel previous request
    if (currentSearchController) {
        currentSearchController.abort();
    }
    currentSearchController = new AbortController();
    
    try {
        // Search all endpoints in parallel
        const searches = endpoints.map(async (endpoint) => {
            const cacheKey = `${endpoint}:${query.toLowerCase()}`;
            if (apiSearchCache[cacheKey]) {
                return apiSearchCache[cacheKey].map(r => ({ ...r, _endpoint: endpoint }));
            }
            
            try {
                const response = await fetch(`${DND_API_BASE}/${endpoint}?name=${encodeURIComponent(query)}`, {
                    signal: currentSearchController.signal
                });
                if (!response.ok) return [];
                const data = await response.json();
                const results = (data.results || []).map(r => ({ ...r, _endpoint: endpoint }));
                apiSearchCache[cacheKey] = data.results || [];
                return results;
            } catch (e) {
                if (e.name !== 'AbortError') console.error(`API search error for ${endpoint}:`, e);
                return [];
            }
        });
        
        const allResults = await Promise.all(searches);
        // Flatten and sort by name
        return allResults.flat().sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        if (e.name === 'AbortError') return [];
        console.error('Multi-endpoint search error:', e);
        return [];
    }
}

async function getDndApiDetails(url) {
    try {
        const response = await fetch(`https://www.dnd5eapi.co${url}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('API details error:', e);
        return null;
    }
}

// Format spell details from API
function formatSpellFromApi(spell) {
    return {
        name: spell.name,
        level: spell.level,
        school: spell.school?.name || '',
        casting_time: spell.casting_time || '',
        range: spell.range || '',
        components: spell.components?.join(', ') || '',
        duration: spell.duration || '',
        description: Array.isArray(spell.desc) ? spell.desc.join('\n\n') : (spell.desc || ''),
        higher_level: Array.isArray(spell.higher_level) ? spell.higher_level.join('\n\n') : (spell.higher_level || ''),
        api_index: spell.index
    };
}

// Format equipment/item details from API
function formatItemFromApi(item) {
    const result = {
        name: item.name,
        item_type: item.equipment_category?.name || 'Gear',
        weight: item.weight || null,
        description: ''
    };
    
    // Build description from various fields
    const descParts = [];
    if (item.desc && item.desc.length > 0) {
        descParts.push(item.desc.join(' '));
    }
    if (item.cost) {
        descParts.push(`Cost: ${item.cost.quantity} ${item.cost.unit}`);
    }
    result.description = descParts.join('\n');
    
    return result;
}

// Format weapon details from API
function formatWeaponFromApi(weapon, charAbilityScores, profBonus) {
    const isFinesse = weapon.properties?.some(p => p.name === 'Finesse');
    const isRanged = weapon.weapon_range === 'Ranged';
    
    // Calculate attack bonus
    let abilityMod = 0;
    if (charAbilityScores) {
        if (isFinesse) {
            const strMod = getModifier(getAbilityScore(charAbilityScores, 'str'));
            const dexMod = getModifier(getAbilityScore(charAbilityScores, 'dex'));
            abilityMod = Math.max(strMod, dexMod);
        } else if (isRanged) {
            abilityMod = getModifier(getAbilityScore(charAbilityScores, 'dex'));
        } else {
            abilityMod = getModifier(getAbilityScore(charAbilityScores, 'str'));
        }
    }
    
    // Format damage
    let damage = '';
    if (weapon.damage) {
        damage = weapon.damage.damage_dice;
        if (abilityMod !== 0) {
            damage += abilityMod >= 0 ? `+${abilityMod}` : `${abilityMod}`;
        }
    }
    
    // Format properties
    const props = weapon.properties?.map(p => p.name).join(', ') || '';
    
    return {
        name: weapon.name,
        attack_bonus: abilityMod + (profBonus || 0),
        damage: damage,
        damage_type: weapon.damage?.damage_type?.name || '',
        properties: props
    };
}

// Format feature/trait/feat from API with auto-source detection
function formatFeatureFromApi(item, endpoint) {
    const result = {
        name: item.name,
        description: Array.isArray(item.desc) ? item.desc.join('\n\n') : (item.desc || ''),
        source: 'Other'
    };
    
    // Auto-detect source based on endpoint and data
    if (endpoint === 'features') {
        // Class features - just show "Class" in blue
        result.source = 'Class';
    } else if (endpoint === 'traits') {
        // Racial traits - just show "Race"
        result.source = 'Race';
    } else if (endpoint === 'feats') {
        result.source = 'Feat';
        // Add prerequisites if available
        if (item.prerequisites && item.prerequisites.length > 0) {
            const prereqDesc = item.prerequisites.map(p => {
                if (p.ability_score) return `${p.ability_score.name} ${p.minimum_score}+`;
                if (p.proficiency) return `Proficiency: ${p.proficiency.name}`;
                if (p.spell) return `Spell: ${p.spell.name}`;
                return '';
            }).filter(Boolean).join(', ');
            if (prereqDesc) {
                result.description = `Prerequisites: ${prereqDesc}\n\n${result.description}`;
            }
        }
    }
    
    return result;
}

// ========================================
// Home Page
// ========================================

function renderRoster() {
    const roster = $('#party-roster');
    const empty = $('#empty-state');
    if (!characters.length) { roster.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    roster.innerHTML = characters.map(c => {
        const pct = getHpPercent(c.current_hit_points, c.hit_point_maximum);
        const pp = getPassivePerception(c);
        const conditions = c.active_conditions || [];
        return `<div class="character-card" data-id="${c.id}">
            <div class="card-header">
                <div class="card-info">
                    <h2>${escapeHtml(c.name)}</h2>
                    <p class="card-subtitle">${escapeHtml(c.race)} ${escapeHtml(c.class)}${c.subclass ? ` (${escapeHtml(c.subclass)})` : ''}</p>
                    <p class="card-player">${escapeHtml(c.player_name)}</p>
                </div>
                <div class="card-level">${c.level}</div>
            </div>
            <div class="hp-bar-section">
                <div class="hp-bar-header">
                    <span class="hp-bar-label">HP</span>
                    <span class="hp-bar-value">${c.current_hit_points}${c.temporary_hit_points > 0 ? `<span class="temp">+${c.temporary_hit_points}</span>` : ''}/${c.hit_point_maximum}</span>
                </div>
                <div class="hp-bar"><div class="hp-bar-fill ${getHpClass(pct)}" style="width:${pct}%"></div></div>
            </div>
            ${conditions.length ? `<div class="card-conditions">${conditions.map(cond => `<span class="card-condition-tag">${cond}</span>`).join('')}</div>` : ''}
            <div class="quick-stats">
                <div class="quick-stat"><div class="quick-stat-value">${c.armor_class}</div><div class="quick-stat-label">AC</div></div>
                <div class="quick-stat"><div class="quick-stat-value">${formatMod(c.initiative_bonus)}</div><div class="quick-stat-label">Init</div></div>
                <div class="quick-stat"><div class="quick-stat-value">${c.speed}</div><div class="quick-stat-label">Speed</div></div>
                <div class="quick-stat"><div class="quick-stat-value">${pp}</div><div class="quick-stat-label">PP</div></div>
            </div>
        </div>`;
    }).join('');
    $$('.character-card').forEach(card => card.addEventListener('click', () => openCharacter(card.dataset.id)));
}

// ========================================
// Create Character
// ========================================
function initCreatePage() {
    ABILITIES.forEach(ab => {
        $(`#score-${ab}`).addEventListener('input', e => {
            $(`#mod-${ab}`).textContent = formatMod(getModifier(parseInt(e.target.value) || 10));
            updateHPField();
        });
    });
    $('#roll-abilities-btn').addEventListener('click', () => {
        ABILITIES.forEach(ab => {
            const s = roll4d6Drop();
            $(`#score-${ab}`).value = s;
            $(`#mod-${ab}`).textContent = formatMod(getModifier(s));
        });
        updateHPField();
    });
    $('#char-class').addEventListener('change', updateHPField);
    $('#char-level').addEventListener('input', updateHPField);
    $('#create-form').addEventListener('submit', handleCreate);
    $('#cancel-create-btn').addEventListener('click', () => showPage('home-page'));
    $('#create-back-btn').addEventListener('click', () => showPage('home-page'));
    
    // Initialize HP field on page load
    updateHPField();
}

function updateHPField() {
    const cls = $('#char-class').value;
    const lvl = parseInt($('#char-level').value) || 1;
    const conMod = getModifier(parseInt($('#score-con').value) || 10);
    const suggestedHP = calcHP(cls, lvl, conMod);
    
    // Update both the suggestion text and the actual input field
    $('#hp-suggestion').textContent = `Suggested: ${suggestedHP}`;
    $('#char-hp').value = suggestedHP;
}

async function handleCreate(e) {
    e.preventDefault();
    
    // Add game world validation
    if (!currentSession) {
        alert('Session expired. Please login again.');
        window.location.href = 'index.html';
        return;
    }
    
    const name = $('#char-name').value.trim();
    const playerName = $('#player-name').value.trim();
    const race = $('#char-race').value;
    const cls = $('#char-class').value;
    const subclass = $('#char-subclass').value.trim() || null;
    const level = parseInt($('#char-level').value) || 1;
    const background = $('#char-background').value;
    const alignment = $('#char-alignment').value;
    const ac = parseInt($('#char-ac').value) || 10;
    const speed = parseInt($('#char-speed').value) || 30;
    const abs = {}; ABILITIES.forEach(a => abs[a] = parseInt($(`#score-${a}`).value) || 10);
    const conMod = getModifier(abs.con);
    const dexMod = getModifier(abs.dex);
    const hp = parseInt($('#char-hp').value) || calcHP(cls, level, conMod);
    const profBonus = getProfBonus(level);
    const hd = HIT_DICE[cls] || 8;

    const { data: char, error } = await db.from('characters').insert({
        game_world_id: currentSession.gameWorldId, // Add this line
        name, player_name: playerName, race, class: cls, subclass, level, experience_points: 0, background, alignment,
        armor_class: ac, initiative_bonus: dexMod, speed, hit_point_maximum: hp, current_hit_points: hp,
        temporary_hit_points: 0, hit_dice_total: `${level}d${hd}`, hit_dice_remaining: level,
        death_save_successes: 0, death_save_failures: 0, proficiency_bonus: profBonus, inspiration: false
    }).select().single();

    if (error) { console.error(error); alert('Failed to create character'); return; }
    const id = char.id;

    await db.from('ability_scores').insert({ character_id: id, strength: abs.str, dexterity: abs.dex, constitution: abs.con, intelligence: abs.int, wisdom: abs.wis, charisma: abs.cha });
    await db.from('skills').insert(Object.keys(SKILLS).map(s => ({ character_id: id, skill_name: s, proficient: false, expertise: false })));
    await db.from('saving_throws').insert(ABILITIES.map(a => ({ character_id: id, ability: a, proficient: false })));
    await db.from('currency').insert({ character_id: id, copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 });
    await db.from('character_details').insert({ character_id: id });

    $('#create-form').reset();
    ABILITIES.forEach(a => $(`#mod-${a}`).textContent = '+0');
    await loadCharacters();

    // Show starting equipment modal instead of directly opening character
    showStartingEquipmentModal(id, cls, background);
}

// ========================================
// Character Detail Page
// ========================================
async function openCharacter(id) {
    // Clean up roster realtime when viewing a specific character
    cleanupRosterRealtime();

    showLoading();
    const { data, error } = await db.from('characters').select(`*, ability_scores (*), skills (*), saving_throws (*), inventory_items (*), weapons (*), spells (*), spell_slots (*), features_traits (*), currency (*), character_details (*)`).eq('id', id).single();
    if (error || !data) { console.error(error); hideLoading(); showPage('home-page'); return; }
    currentCharacter = data;
    renderCharacterPage();
    showPage('character-page');
    hideLoading();
    setupRealtime(id);

    // Auto-open level-up wizard if character needs subclass selection
    if (needsSubclassSelection(currentCharacter)) {
        setTimeout(() => openLevelUpWizard(), 300);
    }
}

let realtimeRetryCount = 0;
const MAX_REALTIME_RETRIES = 3;
let currentRealtimeChannel = null;

function setupRealtime(id) {
    // Remove any existing channel first
    try {
        if (currentRealtimeChannel) {
            db.removeChannel(currentRealtimeChannel);
            currentRealtimeChannel = null;
        }
    } catch (e) {
        console.warn('Error removing existing channel:', e);
    }
    
    // Create a unique channel name
    const channelName = `char-updates-${id}`;
    const channel = db.channel(channelName, {
        config: {
            broadcast: { self: false },
            presence: { key: '' }
        }
    });
    
    currentRealtimeChannel = channel;
    
    // Listen to characters table
    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'characters', filter: `id=eq.${id}` },
        (payload) => {
            console.log('Characters change:', payload);
            handleRealtimeUpdate('characters', payload);
        }
    );
    
    // Listen to all related tables
    const relatedTables = ['ability_scores', 'skills', 'saving_throws', 'inventory_items', 'weapons', 'spells', 'spell_slots', 'features_traits', 'currency', 'character_details'];
    
    relatedTables.forEach(table => {
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: table, filter: `character_id=eq.${id}` },
            (payload) => {
                console.log(`${table} change:`, payload);
                handleRealtimeUpdate(table, payload);
            }
        );
    });
    
    // Subscribe to the channel with better error handling
    channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
            console.log('Realtime subscription active for character:', id);
            realtimeRetryCount = 0; // Reset on success
        } else if (status === 'CHANNEL_ERROR') {
            console.warn('Realtime channel error (continuing without live updates):', err);
            // Don't retry on channel errors
        } else if (status === 'TIMED_OUT') {
            console.warn('Realtime subscription timed out (continuing without live updates)');
            // Don't retry timeouts to avoid connection spam
        } else if (status === 'CLOSED') {
            console.log('Realtime channel closed');
        } else {
            console.log('Realtime status:', status);
        }
    });
}

// ========================================
// Roster Realtime Updates
// ========================================
let rosterRealtimeChannel = null;

function setupRosterRealtime() {
    // Remove any existing roster channel first
    try {
        if (rosterRealtimeChannel) {
            db.removeChannel(rosterRealtimeChannel);
            rosterRealtimeChannel = null;
        }
    } catch (e) {
        console.warn('Error removing roster channel:', e);
    }
    
    if (!currentSession) return;
    
    // Create channel for all characters in this game world
    const channelName = `roster-updates-${currentSession.gameWorldId}`;
    const channel = db.channel(channelName, {
        config: {
            broadcast: { self: false },
            presence: { key: '' }
        }
    });
    
    rosterRealtimeChannel = channel;
    
    // Listen to characters table changes for this game world
    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'characters', filter: `game_world_id=eq.${currentSession.gameWorldId}` },
        async (payload) => {
            console.log('Roster character change:', payload);
            // Reload characters when any character in this game world changes
            await loadCharacters();
        }
    );
    
    // Subscribe to the channel
    channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
            console.log('Roster realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
            console.warn('Roster realtime channel error:', err);
        } else if (status === 'TIMED_OUT') {
            console.warn('Roster realtime subscription timed out');
        }
    });
}

function cleanupRosterRealtime() {
    try {
        if (rosterRealtimeChannel) {
            db.removeChannel(rosterRealtimeChannel);
            rosterRealtimeChannel = null;
        }
    } catch (e) {
        console.warn('Error removing roster channel:', e);
    }
}

// Handle realtime updates by merging data locally when possible
function handleRealtimeUpdate(table, payload) {
    if (!currentCharacter) return;
    
    const { eventType, new: newData, old: oldData } = payload;
    
    // For the main character table, update directly
    if (table === 'characters') {
        if (eventType === 'UPDATE' && newData) {
            Object.assign(currentCharacter, newData);
            renderCharacterPage();
        }
        return;
    }
    
    // For related tables, update the nested data
    const tableMapping = {
        'ability_scores': 'ability_scores',
        'skills': 'skills',
        'saving_throws': 'saving_throws',
        'inventory_items': 'inventory_items',
        'weapons': 'weapons',
        'spells': 'spells',
        'spell_slots': 'spell_slots',
        'features_traits': 'features_traits',
        'currency': 'currency',
        'character_details': 'character_details'
    };
    
    const dataKey = tableMapping[table];
    if (!dataKey) return;
    
    // Handle single objects (ability_scores, currency, character_details)
    if (['ability_scores', 'currency', 'character_details'].includes(table)) {
        if (eventType === 'UPDATE' && newData) {
            currentCharacter[dataKey] = newData;
            renderCharacterPage();
        }
        return;
    }
    
    // Handle arrays (skills, weapons, spells, etc.)
    let dataArray = currentCharacter[dataKey];
    if (!Array.isArray(dataArray)) {
        dataArray = [];
        currentCharacter[dataKey] = dataArray;
    }
    
    switch (eventType) {
        case 'INSERT':
            if (newData && !dataArray.find(item => item.id === newData.id)) {
                dataArray.push(newData);
            }
            break;
        case 'UPDATE':
            if (newData) {
                const index = dataArray.findIndex(item => item.id === newData.id);
                if (index !== -1) {
                    dataArray[index] = newData;
                }
            }
            break;
        case 'DELETE':
            if (oldData) {
                const index = dataArray.findIndex(item => item.id === oldData.id);
                if (index !== -1) {
                    dataArray.splice(index, 1);
                }
            }
            break;
    }
    
    renderCharacterPage();
}

// Full refresh from database (used as fallback)
async function refreshChar() {
    if (!currentCharacter) return;
    
    try {
        const { data, error } = await db.from('characters').select(`*, ability_scores (*), skills (*), saving_throws (*), inventory_items (*), weapons (*), spells (*), spell_slots (*), features_traits (*), currency (*), character_details (*)`).eq('id', currentCharacter.id).single();
        if (error) {
            console.error('Error refreshing character:', error);
            return;
        }
        if (data) { 
            currentCharacter = data; 
            renderCharacterPage(); 
        }
    } catch (e) {
        console.error('Exception refreshing character:', e);
    }
}

function renderCharacterPage() {
    const c = currentCharacter;
    $('#char-header-name').textContent = c.name;
    $('#char-header-subtitle').textContent = `Level ${c.level} ${c.race} ${c.class}${c.subclass ? ` (${c.subclass})` : ''}`;
    renderStatsTab();
    renderSkillsTab();
    renderActionsTab();
    renderInventoryTab();
    renderNotesTab();
    renderToolsTab();
}

// ========================================
// Stats Tab
// ========================================
function renderStatsTab() {
    const c = currentCharacter;
    const abs = c.ability_scores || {};
    const pct = getHpPercent(c.current_hit_points, c.hit_point_maximum);
    const profBonus = getProfBonus(c.level);
    const pp = getPassivePerception(c);

    $('#tab-stats').innerHTML = `
        <div class="hp-section">
            <div class="hp-display-with-level">
                <div class="hp-display">
                    <div><span class="hp-current">${c.current_hit_points}</span><span class="hp-max">/${c.hit_point_maximum}</span></div>
                    ${c.temporary_hit_points > 0 ? `<span class="hp-temp">+${c.temporary_hit_points} temp</span>` : ''}
                </div>
                <div class="level-display ${c.pending_level_up || needsSubclassSelection(c) ? 'pending-levelup' : ''}" onclick="${c.pending_level_up || needsSubclassSelection(c) ? 'openLevelUpWizard()' : 'openLevelEditor()'}">
                    <div class="level-value">${c.level}</div>
                    <div class="level-label">Level</div>
                    ${getLevelingMode() === 'exp' ? `<div class="level-exp-text">${(c.experience_points || 0).toLocaleString()} XP</div>` : ''}
                </div>
            </div>
            <div class="hp-bar-large"><div class="hp-bar-fill ${getHpClass(pct)}" style="width:${pct}%"></div></div>
            <div class="hp-controls">
                <button class="hp-btn damage" onclick="adjustHP(-1)">−</button>
                <input type="number" class="hp-input" id="hp-delta" placeholder="±">
                <button class="hp-btn heal" onclick="adjustHP(1)">+</button>
                <button class="btn-secondary btn-small" onclick="applyHPDelta()">Apply</button>
            </div>
            <div class="rest-buttons">
                <button class="btn-rest short" onclick="takeShortRest()" title="Short Rest">Short Rest</button>
                <button class="btn-rest long" onclick="takeLongRest()" title="Long Rest">Long Rest</button>
            </div>
            <div class="hp-extras">
                <div class="temp-hp-section">
                    <label>Temp HP</label>
                    <input type="number" class="temp-hp-input" value="${c.temporary_hit_points}" onchange="updateTempHP(this.value)">
                </div>
                <div class="death-saves-section ${c.current_hit_points === 0 ? 'visible' : ''}">
                    <div class="death-saves-row">
                        <span>Save</span>
                        ${[1,2,3].map(i => `<div class="death-save-marker success ${i <= c.death_save_successes ? 'filled' : ''}" onclick="toggleDeathSave('successes', ${i})"></div>`).join('')}
                    </div>
                    <div class="death-saves-row">
                        <span>Fail</span>
                        ${[1,2,3].map(i => `<div class="death-save-marker failure ${i <= c.death_save_failures ? 'filled' : ''}" onclick="toggleDeathSave('failures', ${i})"></div>`).join('')}
                    </div>
                </div>
            </div>
        </div>

        <div class="stats-section">
            <div class="section-label">Ability Scores</div>
            <div class="ability-scores-display">
                ${(() => {
                    // Find the highest ability score
                    const scores = ABILITIES.map(a => getAbilityScore(abs, a));
                    const maxScore = Math.max(...scores);

                    return ABILITIES.map(a => {
                        const score = getAbilityScore(abs, a);
                        const isHighest = score === maxScore;
                        return `<div class="ability-score-box">
                            <span class="label">${a.toUpperCase()}${isHighest ? '<span class="top-skill-indicator"></span>' : ''}</span>
                            <span class="score">${score}</span>
                            <span class="modifier">${formatMod(getModifier(score))}</span>
                        </div>`;
                    }).join('');
                })()}
            </div>
        </div>

        <div class="stats-section">
            <div class="section-label">Combat</div>
            <div class="combat-stats-grid">
                <div class="combat-stat"><span class="value">${c.armor_class}</span><span class="label">AC</span></div>
                <div class="combat-stat"><span class="value">${formatMod(c.initiative_bonus)}</span><span class="label">Initiative</span></div>
                <div class="combat-stat"><span class="value">${c.speed}</span><span class="label">Speed</span></div>
                <div class="combat-stat"><span class="value">${formatMod(profBonus)}</span><span class="label">Prof</span></div>
            </div>
            <div class="combat-stats-grid" style="grid-template-columns: 1fr;">
                <div class="combat-stat"><span class="value">${pp}</span><span class="label">Passive Perception</span></div>
            </div>
        </div>

        <div class="stats-section">
            <div class="section-label">Saving Throws</div>
            <div class="saving-throws-grid">
                ${(() => {
                    // Use saving_throws from DB if available, otherwise generate from abilities
                    const saves = c.saving_throws && c.saving_throws.length > 0 
                        ? c.saving_throws 
                        : ABILITIES.map(a => ({ ability: a, proficient: false, id: null }));
                    return saves.map(s => {
                        const mod = getModifier(getAbilityScore(abs, s.ability)) + (s.proficient ? profBonus : 0);
                        return `<div class="save-row ${s.proficient ? 'proficient' : ''}" ${s.id ? `onclick="toggleSaveProficiency('${s.id}', ${s.proficient})"` : ''}>
                            <span class="name"><span class="prof-indicator"></span>${s.ability.toUpperCase()}</span>
                            <span class="modifier">${formatMod(mod)}</span>
                        </div>`;
                    }).join('');
                })()}
            </div>
        </div>

        <div class="stats-section conditions-section">
            <div class="section-label">Conditions</div>
            <div class="conditions-grid">
                ${CONDITIONS.map(cond => `<span class="condition-tag ${(c.active_conditions || []).includes(cond) ? 'active' : ''}" onclick="toggleCondition('${cond}')">${cond}</span>`).join('')}
            </div>
        </div>
    `;
}

// HP Functions - with optimistic UI updates
window.adjustHP = async function(delta) {
    const newHP = Math.max(0, Math.min(currentCharacter.hit_point_maximum, currentCharacter.current_hit_points + delta));
    // Optimistic update
    currentCharacter.current_hit_points = newHP;
    renderCharacterPage();
    // Database update
    await db.from('characters').update({ current_hit_points: newHP }).eq('id', currentCharacter.id);
};

window.applyHPDelta = async function() {
    const delta = parseInt($('#hp-delta').value) || 0;
    if (delta === 0) return;
    const newHP = Math.max(0, Math.min(currentCharacter.hit_point_maximum, currentCharacter.current_hit_points + delta));
    // Optimistic update
    currentCharacter.current_hit_points = newHP;
    renderCharacterPage();
    $('#hp-delta').value = '';
    // Database update
    await db.from('characters').update({ current_hit_points: newHP }).eq('id', currentCharacter.id);
};

window.updateTempHP = async function(val) {
    const newTempHP = Math.max(0, parseInt(val) || 0);
    // Optimistic update
    currentCharacter.temporary_hit_points = newTempHP;
    // Note: Don't re-render to avoid losing input focus
    // Database update
    await db.from('characters').update({ temporary_hit_points: newTempHP }).eq('id', currentCharacter.id);
};

window.toggleDeathSave = async function(type, num) {
    const field = type === 'successes' ? 'death_save_successes' : 'death_save_failures';
    const current = currentCharacter[field];
    const newVal = current >= num ? num - 1 : num;
    // Optimistic update
    currentCharacter[field] = newVal;
    renderCharacterPage();
    // Database update
    await db.from('characters').update({ [field]: newVal }).eq('id', currentCharacter.id);
};

window.toggleSaveProficiency = async function(id, current) {
    // Optimistic update
    const save = currentCharacter.saving_throws?.find(s => s.id === id);
    if (save) {
        save.proficient = !current;
        renderCharacterPage();
    }
    // Database update
    await db.from('saving_throws').update({ proficient: !current }).eq('id', id);
};

window.toggleCondition = async function(condition) {
    const current = currentCharacter.active_conditions || [];
    const updated = current.includes(condition) ? current.filter(c => c !== condition) : [...current, condition];
    // Optimistic update
    currentCharacter.active_conditions = updated;
    renderCharacterPage();
    // Database update
    await db.from('characters').update({ active_conditions: updated }).eq('id', currentCharacter.id);
};

// Rest functions - reset feature usage tracking
window.takeShortRest = async function() {
    // Reset features that recharge on short rest
    const features = currentCharacter.features_traits || [];
    const updatedFeatures = features.map(f => {
        if (f.uses_per_rest === 'short' || f.uses_per_rest === 'short_or_long') {
            return { ...f, uses_remaining: f.uses_total || 1 };
        }
        return f;
    });
    
    // Optimistic update
    currentCharacter.features_traits = updatedFeatures;
    renderCharacterPage();
    
    // Update each feature in the database
    for (const f of updatedFeatures) {
        if (f.uses_per_rest === 'short' || f.uses_per_rest === 'short_or_long') {
            await db.from('features_traits').update({ uses_remaining: f.uses_total || 1 }).eq('id', f.id);
        }
    }
};

window.takeLongRest = async function() {
    const c = currentCharacter;
    
    // Reset HP to maximum
    const newHP = c.hit_point_maximum;
    
    // Reset features that recharge on short or long rest
    const features = c.features_traits || [];
    const updatedFeatures = features.map(f => {
        if (f.uses_per_rest) {
            return { ...f, uses_remaining: f.uses_total || 1 };
        }
        return f;
    });
    
    // Reset spell slots
    const slots = c.spell_slots || [];
    const updatedSlots = slots.map(s => ({ ...s, used: 0 }));
    
    // Reset death saves
    const updates = {
        current_hit_points: newHP,
        temporary_hit_points: 0,
        death_save_successes: 0,
        death_save_failures: 0
    };
    
    // Optimistic update
    Object.assign(currentCharacter, updates);
    currentCharacter.features_traits = updatedFeatures;
    currentCharacter.spell_slots = updatedSlots;
    renderCharacterPage();
    
    // Database updates
    await db.from('characters').update(updates).eq('id', c.id);
    
    for (const f of updatedFeatures) {
        if (f.uses_per_rest) {
            await db.from('features_traits').update({ uses_remaining: f.uses_total || 1 }).eq('id', f.id);
        }
    }
    
    for (const s of updatedSlots) {
        await db.from('spell_slots').update({ used: 0 }).eq('id', s.id);
    }
};

// ========================================
// Level Editor
// ========================================
window.openLevelEditor = function() {
    const modal = $('#level-modal');
    $('#new-level').value = currentCharacter.level;
    modal.classList.remove('hidden');
};

window.closeLevelModal = function() {
    $('#level-modal').classList.add('hidden');
};

async function handleLevelUpdate(e) {
    e.preventDefault();
    
    const newLevel = parseInt($('#new-level').value);
    if (!newLevel || newLevel < 1 || newLevel > 20) {
        alert('Please enter a valid level between 1 and 20');
        return;
    }
    
    if (newLevel === currentCharacter.level) {
        closeLevelModal();
        return;
    }
    
    const c = currentCharacter;
    const oldLevel = c.level;
    const cls = c.class;
    const hd = HIT_DICE[cls] || 8;
    const conMod = getModifier(getAbilityScore(c.ability_scores, 'con'));
    
    // Calculate new proficiency bonus
    const newProfBonus = getProfBonus(newLevel);
    
    // Calculate new hit dice
    const newHitDiceTotal = `${newLevel}d${hd}`;
    const newHitDiceRemaining = newLevel;
    
    // Calculate new max HP (optional - could keep current or recalculate)
    // For leveling up, we'll add the average HP per level
    let newMaxHP = c.hit_point_maximum;
    if (newLevel > oldLevel) {
        // Leveling up - add HP for each new level
        const levelsGained = newLevel - oldLevel;
        const hpPerLevel = Math.floor(hd / 2) + 1 + conMod;
        newMaxHP += levelsGained * hpPerLevel;
    } else {
        // Leveling down - recalculate HP from scratch
        newMaxHP = calcHP(cls, newLevel, conMod);
    }
    
    // Ensure current HP doesn't exceed new max
    const newCurrentHP = Math.min(c.current_hit_points, newMaxHP);
    
    // Update character
    const updates = {
        level: newLevel,
        proficiency_bonus: newProfBonus,
        hit_dice_total: newHitDiceTotal,
        hit_dice_remaining: newHitDiceRemaining,
        hit_point_maximum: newMaxHP,
        current_hit_points: newCurrentHP
    };
    
    // Optimistic update
    Object.assign(currentCharacter, updates);
    renderCharacterPage();
    closeLevelModal();
    
    // Database update
    await db.from('characters').update(updates).eq('id', currentCharacter.id);
}

// ========================================
// Skills Tab
// ========================================
function renderSkillsTab() {
    const c = currentCharacter;
    const abs = c.ability_scores || {};
    const profBonus = getProfBonus(c.level);
    
    // Calculate all skill modifiers to find top 2
    const skillMods = Object.entries(SKILLS).map(([name, ab]) => {
        const skill = c.skills?.find(s => s.skill_name === name);
        const mod = getModifier(getAbilityScore(abs, ab)) + (skill?.proficient ? profBonus : 0);
        return { name, mod };
    });
    
    // Sort by modifier descending and get top 2 skill names
    const sortedSkills = [...skillMods].sort((a, b) => b.mod - a.mod);
    const topSkills = new Set([sortedSkills[0]?.name, sortedSkills[1]?.name]);

    $('#tab-skills').innerHTML = `
        <div class="skills-list">
            ${Object.entries(SKILLS).map(([name, ab]) => {
                const skill = c.skills?.find(s => s.skill_name === name);
                const mod = getModifier(getAbilityScore(abs, ab)) + (skill?.proficient ? profBonus : 0);
                const isTopSkill = topSkills.has(name);
                return `<div class="skill-row ${skill?.proficient ? 'proficient' : ''}" onclick="toggleSkillProficiency('${skill?.id}', ${skill?.proficient || false})">
                    <div class="skill-info">
                        <div class="skill-prof-markers"><span class="skill-prof-marker"></span></div>
                        <span class="skill-name">${name}</span>
                        <span class="skill-ability">${ab.toUpperCase()}</span>
                        ${isTopSkill ? '<span class="top-skill-indicator"></span>' : ''}
                    </div>
                    <span class="skill-modifier">${formatMod(mod)}</span>
                </div>`;
            }).join('')}
        </div>
    `;
}

window.toggleSkillProficiency = async function(id, prof) {
    // Simple toggle
    const newProf = !prof;
    
    // Optimistic update
    const skill = currentCharacter.skills?.find(s => s.id === id);
    if (skill) {
        skill.proficient = newProf;
        renderCharacterPage();
    }
    
    // Database update
    await db.from('skills').update({ proficient: newProf }).eq('id', id);
};

// ========================================
// Actions Tab
// ========================================
function renderActionsTab() {
    const c = currentCharacter;
    const weapons = c.weapons || [];
    const spells = c.spells || [];
    const slots = c.spell_slots || [];
    const features = c.features_traits || [];

    // Filter features that are bonus actions (those with is_bonus_action flag or "bonus action" in description)
    const bonusActionFeatures = features.filter(f =>
        f.is_bonus_action ||
        (f.description && f.description.toLowerCase().includes('bonus action'))
    );

    // Filter features that are regular actions (not bonus actions)
    const regularActionFeatures = features.filter(f =>
        !f.is_bonus_action &&
        !(f.description && f.description.toLowerCase().includes('bonus action'))
    );

    const groupedSpells = spells.reduce((acc, s) => { (acc[s.level] = acc[s.level] || []).push(s); return acc; }, {});

    $('#tab-actions').innerHTML = `
        <div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Attacks</span>
                <button class="add-btn" onclick="openAddModal('weapon')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="weapons-list">
                ${weapons.length ? weapons.map(w => {
                    return `<div class="weapon-card clickable" onclick="showWeaponDetail('${w.id}')">
                    <div class="weapon-info"><h3>${escapeHtml(w.name)}</h3><p>${w.damage_type || ''} ${w.properties || ''}</p></div>
                    <div class="weapon-stats">
                        <div class="weapon-stat"><span class="value">${formatMod(w.attack_bonus)}</span><span class="label">Hit</span></div>
                        <div class="weapon-stat"><span class="value">${w.damage}</span><span class="label">Dmg</span></div>
                    </div>
                    <button class="weapon-delete" onclick="event.stopPropagation(); deleteWeapon('${w.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                </div>`;}).join('') : '<div class="empty-list">No attacks added</div>'}
            </div>
        </div>

        ${regularActionFeatures.length ? `<div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Actions</span>
            </div>
            <div class="bonus-actions-list">
                ${regularActionFeatures.map(f => {
                    const hasUsage = f.uses_total && f.uses_total > 0;
                    const usesRemaining = f.uses_remaining ?? f.uses_total ?? 0;
                    return `<div class="action-card clickable" onclick="showFeatureDetail('${f.id}')">
                        <div class="action-info">
                            <h3>${escapeHtml(f.name)}</h3>
                            <p>${f.source ? `<span class="action-source">${escapeHtml(f.source)}</span>` : ''}${f.uses_per_rest ? `<span class="action-rest-type">${f.uses_per_rest === 'short' ? 'Short Rest' : 'Long Rest'}</span>` : ''}</p>
                        </div>
                        ${hasUsage ? `<div class="action-uses">
                            ${Array(f.uses_total).fill(0).map((_, i) => `<div class="action-use-marker ${i < usesRemaining ? '' : 'used'}" onclick="event.stopPropagation(); toggleFeatureUse('${f.id}', ${i}, ${usesRemaining}, ${f.uses_total})"></div>`).join('')}
                        </div>` : ''}
                    </div>`;
                }).join('')}
            </div>
        </div>` : ''}

        <div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Bonus Actions</span>
                <button class="add-btn" onclick="openAddModal('bonusaction')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="bonus-actions-list">
                ${bonusActionFeatures.length ? bonusActionFeatures.map(f => {
                    const hasUsage = f.uses_total && f.uses_total > 0;
                    const usesRemaining = f.uses_remaining ?? f.uses_total ?? 0;
                    return `<div class="action-card clickable" onclick="showBonusActionDetail('${f.id}')">
                        <div class="action-info">
                            <h3>${escapeHtml(f.name)}</h3>
                            <p>${f.source ? `<span class="action-source">${escapeHtml(f.source)}</span>` : ''}${f.uses_per_rest ? `<span class="action-rest-type">${f.uses_per_rest === 'short' ? 'Short Rest' : 'Long Rest'}</span>` : ''}</p>
                        </div>
                        ${hasUsage ? `<div class="action-uses">
                            ${Array(f.uses_total).fill(0).map((_, i) => `<div class="action-use-marker ${i < usesRemaining ? '' : 'used'}" onclick="event.stopPropagation(); toggleFeatureUse('${f.id}', ${i}, ${usesRemaining}, ${f.uses_total})"></div>`).join('')}
                        </div>` : ''}
                    </div>`;
                }).join('') : '<div class="empty-list">No bonus actions. Add features that use bonus actions from the Notes tab.</div>'}
            </div>
        </div>

        ${slots.length ? `<div class="actions-section">
            <span class="section-label">Spell Slots</span>
            <div class="spell-slots-grid">
                ${slots.sort((a,b) => a.slot_level - b.slot_level).map(s => `<div class="spell-slot-group">
                    <span class="level">Lvl ${s.slot_level}</span>
                    <div class="spell-slot-markers">
                        ${Array(s.total).fill(0).map((_, i) => `<div class="spell-slot-marker ${i < s.used ? 'used' : ''}" onclick="toggleSpellSlot('${s.id}', ${i}, ${s.used}, ${s.total})"></div>`).join('')}
                    </div>
                </div>`).join('')}
            </div>
        </div>` : ''}

        <div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Spells</span>
                <button class="add-btn" onclick="openAddModal('spell')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="spells-list">
                ${Object.keys(groupedSpells).length ? Object.entries(groupedSpells).sort((a,b) => a[0] - b[0]).map(([lvl, list]) => `
                    <div class="spell-level-group">
                        <div class="spell-level-header">${lvl === '0' ? 'Cantrips' : `Level ${lvl}`}</div>
                        ${list.map(s => `<div class="spell-card clickable" onclick="showSpellDetail('${s.id}')">
                            <div class="spell-info">
                                ${s.level > 0 ? `<div class="spell-prepared-toggle ${s.prepared ? 'prepared' : ''}" onclick="event.stopPropagation(); toggleSpellPrepared('${s.id}', ${s.prepared})"></div>` : ''}
                                <span class="spell-name">${escapeHtml(s.name)}</span>
                                ${s.school ? `<span class="spell-school">${s.school}</span>` : ''}
                            </div>
                            <button class="spell-delete" onclick="event.stopPropagation(); deleteSpell('${s.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                        </div>`).join('')}
                    </div>
                `).join('') : '<div class="empty-list">No spells added</div>'}
            </div>
        </div>
    `;
}

window.deleteWeapon = async id => { 
    // Optimistic update
    if (currentCharacter.weapons) {
        currentCharacter.weapons = currentCharacter.weapons.filter(w => w.id !== id);
        renderCharacterPage();
    }
    await db.from('weapons').delete().eq('id', id); 
};

window.deleteSpell = async id => { 
    // Optimistic update
    if (currentCharacter.spells) {
        currentCharacter.spells = currentCharacter.spells.filter(s => s.id !== id);
        renderCharacterPage();
    }
    await db.from('spells').delete().eq('id', id); 
};

window.toggleSpellPrepared = async (id, curr) => { 
    // Optimistic update
    const spell = currentCharacter.spells?.find(s => s.id === id);
    if (spell) {
        spell.prepared = !curr;
        renderCharacterPage();
    }
    await db.from('spells').update({ prepared: !curr }).eq('id', id); 
};

window.toggleSpellSlot = async (id, idx, used, total) => {
    const newUsed = idx < used ? idx : Math.min(total, idx + 1);
    // Optimistic update
    const slot = currentCharacter.spell_slots?.find(s => s.id === id);
    if (slot) {
        slot.used = newUsed;
        renderCharacterPage();
    }
    await db.from('spell_slots').update({ used: newUsed }).eq('id', id);
};

// ========================================
// Inventory Tab
// ========================================
function renderInventoryTab() {
    const c = currentCharacter;
    const currency = c.currency || {};
    const items = c.inventory_items || [];

    $('#tab-inventory').innerHTML = `
        <div class="section-label">Currency</div>
        <div class="currency-grid">
            ${['copper', 'silver', 'electrum', 'gold', 'platinum'].map(type => `
                <div class="currency-item">
                    <label>${type.slice(0, 2).toUpperCase()}</label>
                    <input type="number" value="${currency[type] || 0}" onchange="updateCurrency('${type}', this.value)">
                </div>
            `).join('')}
        </div>

        <div class="section-header-row" style="margin-top: var(--space-lg);">
            <span class="section-label">Items</span>
            <button class="add-btn" onclick="openAddModal('item')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
        </div>
        <div class="items-list">
            ${items.length ? items.map(i => `<div class="item-card clickable" onclick="showItemDetail('${i.id}')">
                <div class="item-info"><h3>${escapeHtml(i.name)}</h3><p>${i.item_type || 'Item'}${i.weight ? ` • ${i.weight} lb` : ''}</p></div>
                <div class="item-quantity">
                    <button onclick="event.stopPropagation(); updateItemQty('${i.id}', ${i.quantity - 1})">−</button>
                    <span>${i.quantity}</span>
                    <button onclick="event.stopPropagation(); updateItemQty('${i.id}', ${i.quantity + 1})">+</button>
                </div>
                <button class="item-delete" onclick="event.stopPropagation(); deleteItem('${i.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
            </div>`).join('') : '<div class="empty-list">No items added</div>'}
        </div>
    `;
}

window.updateCurrency = async (type, val) => { 
    const newVal = Math.max(0, parseInt(val) || 0);
    // Optimistic update
    if (currentCharacter.currency) {
        currentCharacter.currency[type] = newVal;
        // Note: Don't re-render to avoid losing input focus
    }
    await db.from('currency').update({ [type]: newVal }).eq('character_id', currentCharacter.id); 
};

window.updateItemQty = async (id, qty) => { 
    if (qty < 1) {
        deleteItem(id);
    } else {
        // Optimistic update
        const item = currentCharacter.inventory_items?.find(i => i.id === id);
        if (item) {
            item.quantity = qty;
            renderCharacterPage();
        }
        await db.from('inventory_items').update({ quantity: qty }).eq('id', id); 
    }
};

window.deleteItem = async id => { 
    // Optimistic update
    if (currentCharacter.inventory_items) {
        currentCharacter.inventory_items = currentCharacter.inventory_items.filter(i => i.id !== id);
        renderCharacterPage();
    }
    await db.from('inventory_items').delete().eq('id', id); 
};

// ========================================
// Notes Tab
// ========================================
function renderNotesTab() {
    const c = currentCharacter;
    const features = c.features_traits || [];
    const details = c.character_details || {};

    $('#tab-notes').innerHTML = `
        <div class="notes-section">
            <h3>Character Info</h3>
            <div class="details-grid">
                <div class="detail-item">
                    <label>Background</label>
                    <input type="text" value="${c.background || ''}" onchange="updateCharacterField('background', this.value)">
                </div>
                <div class="detail-item">
                    <label>Alignment</label>
                    <input type="text" value="${c.alignment || ''}" onchange="updateCharacterField('alignment', this.value)">
                </div>
                <div class="detail-item">
                    <label>Subclass</label>
                    <input type="text" value="${c.subclass || ''}" onchange="updateCharacterField('subclass', this.value)">
                </div>
            </div>
        </div>

        <div class="notes-section">
            <div class="section-header-row">
                <h3>Features & Traits</h3>
                <button class="add-btn" onclick="openAddModal('feature')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="features-list">
                ${features.length ? features.map(f => `<div class="feature-card clickable" onclick="showFeatureDetail('${f.id}')">
                    <div class="feature-header">
                        <div><h4>${escapeHtml(f.name)}</h4>${f.source ? `<span class="feature-source">${escapeHtml(f.source)}</span>` : ''}</div>
                        <button class="feature-delete" onclick="event.stopPropagation(); deleteFeature('${f.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                    </div>
                    ${f.description ? `<p class="feature-description">${escapeHtml(f.description).substring(0, 150)}${f.description.length > 150 ? '...' : ''}</p>` : ''}
                </div>`).join('') : '<div class="empty-list">No features added</div>'}
            </div>
        </div>

        <div class="notes-section">
            <h3>Character Details</h3>
            <div class="details-grid">
                ${['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map(f => `
                    <div class="detail-item">
                        <label>${f.charAt(0).toUpperCase() + f.slice(1)}</label>
                        <input type="text" value="${details[f] || ''}" onchange="updateDetail('${f}', this.value)">
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="notes-section">
            <h3>Personality Traits</h3>
            <textarea class="notes-textarea" placeholder="Enter personality traits..." onchange="updateDetail('personality_traits', this.value)">${details.personality_traits || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Ideals</h3>
            <textarea class="notes-textarea" placeholder="Enter ideals..." onchange="updateDetail('ideals', this.value)">${details.ideals || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Bonds</h3>
            <textarea class="notes-textarea" placeholder="Enter bonds..." onchange="updateDetail('bonds', this.value)">${details.bonds || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Flaws</h3>
            <textarea class="notes-textarea" placeholder="Enter flaws..." onchange="updateDetail('flaws', this.value)">${details.flaws || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Backstory</h3>
            <textarea class="notes-textarea" style="min-height: 200px;" placeholder="Enter backstory..." onchange="updateDetail('backstory', this.value)">${details.backstory || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Notes</h3>
            <textarea class="notes-textarea" placeholder="Freeform notes..." onchange="updateCharacterNotes(this.value)">${c.notes || ''}</textarea>
        </div>
    `;
}

window.deleteFeature = async id => { 
    // Optimistic update
    if (currentCharacter.features_traits) {
        currentCharacter.features_traits = currentCharacter.features_traits.filter(f => f.id !== id);
        renderCharacterPage();
    }
    await db.from('features_traits').delete().eq('id', id); 
};

window.updateDetail = async (field, val) => { 
    // Optimistic update
    if (currentCharacter.character_details) {
        currentCharacter.character_details[field] = val;
        // Note: Don't re-render to avoid losing input focus
    }
    await db.from('character_details').update({ [field]: val }).eq('character_id', currentCharacter.id); 
};

window.updateCharacterNotes = async val => {
    // Optimistic update
    currentCharacter.notes = val;
    // Note: Don't re-render to avoid losing input focus
    await db.from('characters').update({ notes: val }).eq('id', currentCharacter.id);
};

window.updateCharacterField = async (field, val) => {
    // Optimistic update
    currentCharacter[field] = val;
    // Note: Don't re-render to avoid losing input focus
    await db.from('characters').update({ [field]: val }).eq('id', currentCharacter.id);
};

// ========================================
// Tools Tab - Search D&D 5e API
// ========================================
let toolsSearchController = null;
let toolsSearchCache = {};
let toolsCurrentCategory = 'all';
let toolsDetailHistory = null; // stores last search state when viewing detail
let toolsDetailData = null; // stores current detail API response + endpoint for "Add to Character"

const TOOLS_CATEGORIES = [
    { key: 'all', label: 'All', endpoints: ['spells', 'equipment', 'monsters', 'features', 'conditions', 'magic-items'] },
    { key: 'spells', label: 'Spells', endpoints: ['spells'] },
    { key: 'equipment', label: 'Equipment', endpoints: ['equipment'] },
    { key: 'magic-items', label: 'Magic Items', endpoints: ['magic-items'] },
    { key: 'monsters', label: 'Monsters', endpoints: ['monsters'] },
    { key: 'features', label: 'Features', endpoints: ['features'] },
    { key: 'conditions', label: 'Conditions', endpoints: ['conditions'] }
];

function getCategoryBadge(endpoint) {
    const map = {
        'spells': 'spell',
        'equipment': 'item',
        'magic-items': 'item',
        'monsters': 'monster',
        'features': 'feature',
        'conditions': 'condition'
    };
    return map[endpoint] || 'item';
}

function getCategoryLabel(endpoint) {
    const map = {
        'spells': 'Spell',
        'equipment': 'Equipment',
        'magic-items': 'Magic Item',
        'monsters': 'Monster',
        'features': 'Feature',
        'conditions': 'Condition'
    };
    return map[endpoint] || 'Item';
}

function renderToolsTab() {
    // Don't re-render if already initialized (preserves search state)
    if ($('#tools-search-input')) return;

    $('#tab-tools').innerHTML = `
        <div class="tools-tab">
            <div class="tools-search-container">
                <div class="tools-search-bar">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input type="text" id="tools-search-input" placeholder="Search spells, items, monsters..." autocomplete="off">
                </div>
                <div class="tools-category-filters">
                    <select id="tools-category-select" class="tools-category-select" onchange="setToolsCategory(this.value)">
                        ${TOOLS_CATEGORIES.map(cat => `
                            <option value="${cat.key}" ${toolsCurrentCategory === cat.key ? 'selected' : ''}>${cat.label}</option>
                        `).join('')}
                    </select>
                </div>
            </div>
            <div id="tools-results-container">
                <div class="tools-empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <h3>Search the D&D 5e Library</h3>
                    <p>Look up spells, equipment, magic items, monsters, features, and conditions.</p>
                </div>
            </div>
        </div>
    `;

    // Attach search listener
    const input = $('#tools-search-input');
    if (input) {
        input.addEventListener('input', debounce(function() {
            performToolsSearch(this.value.trim());
        }, 300));
    }
}

async function performToolsSearch(query) {
    const container = $('#tools-results-container');
    if (!container) return;

    if (!query || query.length < 2) {
        container.innerHTML = `
            <div class="tools-empty-state">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="11" cy="11" r="8"/>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
                <h3>Search the D&D 5e Library</h3>
                <p>Look up spells, equipment, magic items, monsters, features, and conditions.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `<div class="tools-loading"><div class="loader"></div></div>`;

    // Cancel previous request
    if (toolsSearchController) {
        toolsSearchController.abort();
    }
    toolsSearchController = new AbortController();

    const category = TOOLS_CATEGORIES.find(c => c.key === toolsCurrentCategory) || TOOLS_CATEGORIES[0];
    const endpoints = category.endpoints;

    try {
        const allResults = [];

        for (const endpoint of endpoints) {
            const cacheKey = `tools:${endpoint}:${query.toLowerCase()}`;
            if (toolsSearchCache[cacheKey]) {
                allResults.push(...toolsSearchCache[cacheKey]);
                continue;
            }

            try {
                const response = await fetch(`${DND_API_BASE}/${endpoint}?name=${encodeURIComponent(query)}`, {
                    signal: toolsSearchController.signal
                });
                if (response.ok) {
                    const data = await response.json();
                    const results = (data.results || []).map(r => ({ ...r, _endpoint: endpoint }));
                    toolsSearchCache[cacheKey] = results;
                    allResults.push(...results);
                }
            } catch (e) {
                if (e.name === 'AbortError') return;
            }
        }

        allResults.sort((a, b) => a.name.localeCompare(b.name));

        if (allResults.length === 0) {
            container.innerHTML = `
                <div class="tools-empty-state">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="11" cy="11" r="8"/>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <h3>No Results Found</h3>
                    <p>Try a different search term or category.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <div class="tools-results">
                ${allResults.map(r => {
                    const badge = getCategoryBadge(r._endpoint);
                    const label = getCategoryLabel(r._endpoint);
                    return `<div class="tools-result-card" onclick="showToolsDetail('${r.url || r.index}', '${r._endpoint}')">
                        <div class="tools-result-header">
                            <span class="tools-result-name">${escapeHtml(r.name)}</span>
                            <span class="tools-result-badge ${badge}">${label}</span>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        `;
    } catch (e) {
        if (e.name === 'AbortError') return;
        container.innerHTML = `
            <div class="tools-empty-state">
                <h3>Search Error</h3>
                <p>Something went wrong. Please try again.</p>
            </div>
        `;
    }
}

window.clearToolsSearch = function() {
    const input = $('#tools-search-input');
    if (input) {
        input.value = '';
        input.focus();
    }
    performToolsSearch('');
};

window.setToolsCategory = function(key) {
    toolsCurrentCategory = key;

    const query = $('#tools-search-input')?.value?.trim() || '';
    if (query.length >= 2) {
        performToolsSearch(query);
    }
};

window.showToolsDetail = async function(urlOrIndex, endpoint) {
    const container = $('#tools-results-container');
    if (!container) return;

    // Save search state so we can go back
    toolsDetailHistory = {
        query: $('#tools-search-input')?.value || '',
        category: toolsCurrentCategory
    };

    container.innerHTML = `<div class="tools-loading"><div class="loader"></div></div>`;

    // Hide search container when viewing detail
    const searchContainer = $('.tools-search-container');
    if (searchContainer) searchContainer.style.display = 'none';

    try {
        const url = urlOrIndex.startsWith('/api') ? urlOrIndex : `/api/${endpoint}/${urlOrIndex}`;
        const response = await fetch(`https://www.dnd5eapi.co${url}`);
        if (!response.ok) {
            container.innerHTML = `<div class="tools-empty-state"><h3>Failed to load details</h3><p>Please try again.</p></div>`;
            return;
        }
        const data = await response.json();
        toolsDetailData = { data, endpoint };

        container.innerHTML = renderToolsDetailView(data, endpoint);
    } catch (e) {
        container.innerHTML = `<div class="tools-empty-state"><h3>Failed to load details</h3><p>Please try again.</p></div>`;
    }
};

window.toolsDetailBack = function() {
    const searchContainer = $('.tools-search-container');
    if (searchContainer) searchContainer.style.display = '';

    if (toolsDetailHistory) {
        const query = toolsDetailHistory.query;
        toolsCurrentCategory = toolsDetailHistory.category;
        toolsDetailHistory = null;

        // Re-render the tab to restore filters
        renderToolsTab();
        const input = $('#tools-search-input');
        if (input && query) {
            input.value = query;
            performToolsSearch(query);
        }
    } else {
        performToolsSearch('');
    }
};

function renderToolsDetailView(data, endpoint) {
    switch (endpoint) {
        case 'spells': return renderSpellDetail(data);
        case 'equipment': return renderEquipmentDetail(data);
        case 'magic-items': return renderMagicItemDetail(data);
        case 'monsters': return renderMonsterDetail(data);
        case 'features': return renderFeatureDetailView(data);
        case 'conditions': return renderConditionDetail(data);
        default: return renderGenericDetail(data);
    }
}

// Helper: renders the "Add to Character" button if applicable
function getToolsAddButton(endpoint) {
    if (!currentCharacter) return '';
    const addableEndpoints = ['spells', 'equipment', 'magic-items', 'features'];
    if (!addableEndpoints.includes(endpoint)) return '';
    return `<button class="tools-add-btn btn-primary btn-small" onclick="addToolsItemToCharacter()">Add to Character</button>`;
}

window.addToolsItemToCharacter = async function() {
    if (!toolsDetailData || !currentCharacter) return;

    const { data, endpoint } = toolsDetailData;
    let formattedData, table, dataKey;

    if (endpoint === 'spells') {
        formattedData = formatSpellFromApi(data);
        delete formattedData.higher_level;
        formattedData.prepared = false;
        table = 'spells';
        dataKey = 'spells';
    } else if (endpoint === 'equipment' && data.equipment_category?.index === 'weapon') {
        const abilityScores = currentCharacter.ability_scores?.[0] || null;
        const profBonus = currentCharacter.proficiency_bonus || 2;
        formattedData = formatWeaponFromApi(data, abilityScores, profBonus);
        table = 'weapons';
        dataKey = 'weapons';
    } else if (endpoint === 'equipment') {
        formattedData = formatItemFromApi(data);
        formattedData.quantity = 1;
        table = 'inventory_items';
        dataKey = 'inventory_items';
    } else if (endpoint === 'magic-items') {
        const desc = Array.isArray(data.desc) ? data.desc.join('\n\n') : (data.desc || '');
        formattedData = {
            name: data.name,
            item_type: 'Treasure',
            description: desc,
            quantity: 1,
            weight: null
        };
        table = 'inventory_items';
        dataKey = 'inventory_items';
    } else if (endpoint === 'features') {
        formattedData = formatFeatureFromApi(data, endpoint);
        table = 'features_traits';
        dataKey = 'features_traits';
    } else {
        return;
    }

    formattedData.character_id = currentCharacter.id;

    // Update button to show progress
    const btn = document.querySelector('.tools-add-btn');
    if (btn) {
        btn.disabled = true;
        btn.textContent = 'Adding...';
    }

    // Optimistic rendering
    const tempId = 'temp_' + Date.now();
    const tempItem = { ...formattedData, id: tempId };
    if (!currentCharacter[dataKey]) currentCharacter[dataKey] = [];
    currentCharacter[dataKey].push(tempItem);
    renderCharacterPage();

    const { data: insertedData, error } = await db.from(table).insert(formattedData).select().single();

    if (error) {
        console.error('Error adding from tools:', error);
        currentCharacter[dataKey] = currentCharacter[dataKey].filter(item => item.id !== tempId);
        renderCharacterPage();
        if (btn) {
            btn.disabled = false;
            btn.textContent = 'Add to Character';
        }
        alert('Failed to add item');
        return;
    }

    if (insertedData) {
        const index = currentCharacter[dataKey].findIndex(item => item.id === tempId);
        if (index !== -1) currentCharacter[dataKey][index] = insertedData;
    }

    if (btn) {
        btn.textContent = 'Added!';
        btn.classList.add('added');
    }
};

function renderSpellDetail(spell) {
    const components = spell.components?.join(', ') || 'None';
    const material = spell.material || '';
    const desc = Array.isArray(spell.desc) ? spell.desc.join('\n\n') : (spell.desc || 'No description.');
    const higherLevel = Array.isArray(spell.higher_level) ? spell.higher_level.join('\n\n') : (spell.higher_level || '');
    const classes = spell.classes?.map(c => c.name).join(', ') || '';
    const subclasses = spell.subclasses?.map(s => s.name).join(', ') || '';

    return `
        <div class="tools-detail-view">
            <div class="tools-detail-header">
                <button class="tools-detail-back" onclick="toolsDetailBack()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                    </svg>
                    Back to results
                </button>
                ${getToolsAddButton('spells')}
            </div>
            <div class="tools-detail-title">${escapeHtml(spell.name)}</div>
            <div class="tools-detail-type">${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`} ${spell.school?.name || ''} ${spell.ritual ? '(Ritual)' : ''}</div>

            <div class="tools-detail-section">
                <div class="tools-detail-props">
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Casting Time</div>
                        <div class="tools-detail-prop-value">${spell.casting_time || '—'}</div>
                    </div>
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Range</div>
                        <div class="tools-detail-prop-value">${spell.range || '—'}</div>
                    </div>
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Components</div>
                        <div class="tools-detail-prop-value">${components}</div>
                    </div>
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Duration</div>
                        <div class="tools-detail-prop-value">${spell.concentration ? 'Conc. ' : ''}${spell.duration || '—'}</div>
                    </div>
                </div>
            </div>

            ${material ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Material</div>
                <div class="tools-detail-description">${escapeHtml(material)}</div>
            </div>` : ''}

            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Description</div>
                <div class="tools-detail-description">${escapeHtml(desc).replace(/\n/g, '<br>')}</div>
            </div>

            ${higherLevel ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">At Higher Levels</div>
                <div class="tools-detail-description">${escapeHtml(higherLevel).replace(/\n/g, '<br>')}</div>
            </div>` : ''}

            ${classes ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Classes</div>
                <div class="tools-detail-tags">${spell.classes.map(c => `<span class="tools-detail-tag">${c.name}</span>`).join('')}</div>
            </div>` : ''}

            ${subclasses ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Subclasses</div>
                <div class="tools-detail-tags">${spell.subclasses.map(s => `<span class="tools-detail-tag">${s.name}</span>`).join('')}</div>
            </div>` : ''}
        </div>
    `;
}

function renderEquipmentDetail(item) {
    const desc = Array.isArray(item.desc) ? item.desc.join('\n\n') : (item.desc || '');
    const props = item.properties?.map(p => p.name) || [];
    const isWeapon = item.equipment_category?.index === 'weapon';
    const isArmor = item.equipment_category?.index === 'armor';

    return `
        <div class="tools-detail-view">
            <div class="tools-detail-header">
                <button class="tools-detail-back" onclick="toolsDetailBack()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                    </svg>
                    Back to results
                </button>
                ${getToolsAddButton('equipment')}
            </div>
            <div class="tools-detail-title">${escapeHtml(item.name)}</div>
            <div class="tools-detail-type">${item.equipment_category?.name || 'Equipment'}${item.weapon_category ? ` — ${item.weapon_category}` : ''}${item.armor_category ? ` — ${item.armor_category}` : ''}</div>

            <div class="tools-detail-section">
                <div class="tools-detail-props">
                    ${item.cost ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Cost</div>
                        <div class="tools-detail-prop-value">${item.cost.quantity} ${item.cost.unit}</div>
                    </div>` : ''}
                    ${item.weight ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Weight</div>
                        <div class="tools-detail-prop-value">${item.weight} lb</div>
                    </div>` : ''}
                    ${isWeapon && item.damage ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Damage</div>
                        <div class="tools-detail-prop-value">${item.damage.damage_dice} ${item.damage.damage_type?.name || ''}</div>
                    </div>` : ''}
                    ${isWeapon && item.range ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Range</div>
                        <div class="tools-detail-prop-value">${item.range.normal}${item.range.long ? `/${item.range.long}` : ''} ft</div>
                    </div>` : ''}
                    ${isArmor && item.armor_class ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">AC</div>
                        <div class="tools-detail-prop-value">${item.armor_class.base}${item.armor_class.dex_bonus ? ' + DEX' : ''}${item.armor_class.max_bonus ? ` (max ${item.armor_class.max_bonus})` : ''}</div>
                    </div>` : ''}
                    ${isArmor && item.str_minimum ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">STR Required</div>
                        <div class="tools-detail-prop-value">${item.str_minimum}</div>
                    </div>` : ''}
                    ${isArmor && item.stealth_disadvantage ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Stealth</div>
                        <div class="tools-detail-prop-value">Disadvantage</div>
                    </div>` : ''}
                    ${isWeapon && item.two_handed_damage ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Two-Handed</div>
                        <div class="tools-detail-prop-value">${item.two_handed_damage.damage_dice} ${item.two_handed_damage.damage_type?.name || ''}</div>
                    </div>` : ''}
                </div>
            </div>

            ${props.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Properties</div>
                <div class="tools-detail-tags">${props.map(p => `<span class="tools-detail-tag">${p}</span>`).join('')}</div>
            </div>` : ''}

            ${desc ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Description</div>
                <div class="tools-detail-description">${escapeHtml(desc).replace(/\n/g, '<br>')}</div>
            </div>` : ''}
        </div>
    `;
}

function renderMagicItemDetail(item) {
    const desc = Array.isArray(item.desc) ? item.desc.join('\n\n') : (item.desc || '');

    return `
        <div class="tools-detail-view">
            <div class="tools-detail-header">
                <button class="tools-detail-back" onclick="toolsDetailBack()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                    </svg>
                    Back to results
                </button>
                ${getToolsAddButton('magic-items')}
            </div>
            <div class="tools-detail-title">${escapeHtml(item.name)}</div>
            <div class="tools-detail-type">Magic Item${item.rarity?.name ? ` — ${item.rarity.name}` : ''}${item.equipment_category?.name ? ` (${item.equipment_category.name})` : ''}</div>

            <div class="tools-detail-section">
                <div class="tools-detail-props">
                    ${item.rarity?.name ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Rarity</div>
                        <div class="tools-detail-prop-value">${item.rarity.name}</div>
                    </div>` : ''}
                    ${item.variant !== undefined ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Variant</div>
                        <div class="tools-detail-prop-value">${item.variant ? 'Yes' : 'No'}</div>
                    </div>` : ''}
                </div>
            </div>

            ${desc ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Description</div>
                <div class="tools-detail-description">${escapeHtml(desc).replace(/\n/g, '<br>')}</div>
            </div>` : ''}
        </div>
    `;
}

function renderMonsterDetail(monster) {
    const desc = Array.isArray(monster.desc) ? monster.desc.join('\n\n') : (monster.desc || '');

    // Build speed string
    const speedParts = [];
    if (monster.speed) {
        for (const [type, val] of Object.entries(monster.speed)) {
            speedParts.push(`${type}: ${val}`);
        }
    }

    // Proficiencies
    const saves = (monster.proficiencies || []).filter(p => p.proficiency?.name?.startsWith('Saving Throw'));
    const skills = (monster.proficiencies || []).filter(p => p.proficiency?.name?.startsWith('Skill'));

    return `
        <div class="tools-detail-view">
            <button class="tools-detail-back" onclick="toolsDetailBack()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                Back to results
            </button>
            <div class="tools-detail-title">${escapeHtml(monster.name)}</div>
            <div class="tools-detail-type">${monster.size || ''} ${monster.type || ''}${monster.subtype ? ` (${monster.subtype})` : ''}, ${monster.alignment || 'unaligned'}</div>

            <div class="tools-detail-section">
                <div class="tools-detail-props">
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">AC</div>
                        <div class="tools-detail-prop-value">${Array.isArray(monster.armor_class) ? monster.armor_class.map(ac => `${ac.value}${ac.type !== 'natural' && ac.type !== 'dex' ? ` (${ac.type})` : ''}`).join(', ') : monster.armor_class || '—'}</div>
                    </div>
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">HP</div>
                        <div class="tools-detail-prop-value">${monster.hit_points || '—'} ${monster.hit_points_roll ? `(${monster.hit_points_roll})` : ''}</div>
                    </div>
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">CR</div>
                        <div class="tools-detail-prop-value">${monster.challenge_rating ?? '—'} (${monster.xp?.toLocaleString() || '—'} XP)</div>
                    </div>
                    <div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Speed</div>
                        <div class="tools-detail-prop-value">${speedParts.join(', ') || '—'}</div>
                    </div>
                </div>
            </div>

            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Ability Scores</div>
                <div class="tools-detail-props" style="grid-template-columns: repeat(3, 1fr);">
                    ${['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'].map(ab => {
                        const score = monster[ab] || 10;
                        const mod = Math.floor((score - 10) / 2);
                        return `<div class="tools-detail-prop">
                            <div class="tools-detail-prop-label">${ab.substring(0, 3).toUpperCase()}</div>
                            <div class="tools-detail-prop-value">${score} (${mod >= 0 ? '+' : ''}${mod})</div>
                        </div>`;
                    }).join('')}
                </div>
            </div>

            ${saves.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Saving Throws</div>
                <div class="tools-detail-tags">${saves.map(s => `<span class="tools-detail-tag">${s.proficiency.name.replace('Saving Throw: ', '')} +${s.value}</span>`).join('')}</div>
            </div>` : ''}

            ${skills.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Skills</div>
                <div class="tools-detail-tags">${skills.map(s => `<span class="tools-detail-tag">${s.proficiency.name.replace('Skill: ', '')} +${s.value}</span>`).join('')}</div>
            </div>` : ''}

            ${monster.damage_vulnerabilities?.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Damage Vulnerabilities</div>
                <div class="tools-detail-description">${monster.damage_vulnerabilities.join(', ')}</div>
            </div>` : ''}

            ${monster.damage_resistances?.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Damage Resistances</div>
                <div class="tools-detail-description">${monster.damage_resistances.join(', ')}</div>
            </div>` : ''}

            ${monster.damage_immunities?.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Damage Immunities</div>
                <div class="tools-detail-description">${monster.damage_immunities.join(', ')}</div>
            </div>` : ''}

            ${monster.condition_immunities?.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Condition Immunities</div>
                <div class="tools-detail-tags">${monster.condition_immunities.map(c => `<span class="tools-detail-tag">${c.name}</span>`).join('')}</div>
            </div>` : ''}

            ${monster.senses ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Senses</div>
                <div class="tools-detail-description">${Object.entries(monster.senses).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(', ')}</div>
            </div>` : ''}

            ${monster.languages ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Languages</div>
                <div class="tools-detail-description">${monster.languages || '—'}</div>
            </div>` : ''}

            ${monster.special_abilities?.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Special Abilities</div>
                ${monster.special_abilities.map(a => `
                    <div style="margin-bottom: var(--space-md);">
                        <strong style="color: var(--text-primary);">${escapeHtml(a.name)}.</strong>
                        <span class="tools-detail-description">${escapeHtml(a.desc || '')}</span>
                    </div>
                `).join('')}
            </div>` : ''}

            ${monster.actions?.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Actions</div>
                ${monster.actions.map(a => `
                    <div style="margin-bottom: var(--space-md);">
                        <strong style="color: var(--text-primary);">${escapeHtml(a.name)}.</strong>
                        <span class="tools-detail-description">${escapeHtml(a.desc || '')}</span>
                    </div>
                `).join('')}
            </div>` : ''}

            ${monster.legendary_actions?.length ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Legendary Actions</div>
                ${monster.legendary_actions.map(a => `
                    <div style="margin-bottom: var(--space-md);">
                        <strong style="color: var(--text-primary);">${escapeHtml(a.name)}.</strong>
                        <span class="tools-detail-description">${escapeHtml(a.desc || '')}</span>
                    </div>
                `).join('')}
            </div>` : ''}

            ${desc ? `
            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Description</div>
                <div class="tools-detail-description">${escapeHtml(desc).replace(/\n/g, '<br>')}</div>
            </div>` : ''}
        </div>
    `;
}

function renderFeatureDetailView(feature) {
    const desc = Array.isArray(feature.desc) ? feature.desc.join('\n\n') : (feature.desc || 'No description.');

    return `
        <div class="tools-detail-view">
            <div class="tools-detail-header">
                <button class="tools-detail-back" onclick="toolsDetailBack()">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                    </svg>
                    Back to results
                </button>
                ${getToolsAddButton('features')}
            </div>
            <div class="tools-detail-title">${escapeHtml(feature.name)}</div>
            <div class="tools-detail-type">Feature${feature.class?.name ? ` — ${feature.class.name}` : ''}${feature.level ? ` (Level ${feature.level})` : ''}</div>

            <div class="tools-detail-section">
                <div class="tools-detail-props">
                    ${feature.class?.name ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Class</div>
                        <div class="tools-detail-prop-value">${feature.class.name}</div>
                    </div>` : ''}
                    ${feature.subclass?.name ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Subclass</div>
                        <div class="tools-detail-prop-value">${feature.subclass.name}</div>
                    </div>` : ''}
                    ${feature.level ? `<div class="tools-detail-prop">
                        <div class="tools-detail-prop-label">Level</div>
                        <div class="tools-detail-prop-value">${feature.level}</div>
                    </div>` : ''}
                </div>
            </div>

            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Description</div>
                <div class="tools-detail-description">${escapeHtml(desc).replace(/\n/g, '<br>')}</div>
            </div>
        </div>
    `;
}

function renderConditionDetail(condition) {
    const desc = Array.isArray(condition.desc) ? condition.desc.join('\n\n') : (condition.desc || 'No description.');

    return `
        <div class="tools-detail-view">
            <button class="tools-detail-back" onclick="toolsDetailBack()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                Back to results
            </button>
            <div class="tools-detail-title">${escapeHtml(condition.name)}</div>
            <div class="tools-detail-type">Condition</div>

            <div class="tools-detail-section">
                <div class="tools-detail-section-title">Effects</div>
                <div class="tools-detail-description">${escapeHtml(desc).replace(/\n/g, '<br>')}</div>
            </div>
        </div>
    `;
}

function renderGenericDetail(data) {
    const desc = Array.isArray(data.desc) ? data.desc.join('\n\n') : (data.desc || 'No description available.');

    return `
        <div class="tools-detail-view">
            <button class="tools-detail-back" onclick="toolsDetailBack()">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/>
                </svg>
                Back to results
            </button>
            <div class="tools-detail-title">${escapeHtml(data.name || 'Unknown')}</div>

            <div class="tools-detail-section">
                <div class="tools-detail-description">${escapeHtml(desc).replace(/\n/g, '<br>')}</div>
            </div>
        </div>
    `;
}

// ========================================
// Detail Modal - View item/spell/weapon/feature details
// ========================================
window.showDetailModal = function(title, content) {
    // Create or get detail modal
    let modal = $('#detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detail-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="closeDetailModal()"></div>
            <div class="modal-content detail-modal-content">
                <h2 id="detail-modal-title"></h2>
                <div id="detail-modal-body"></div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="closeDetailModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    $('#detail-modal-title').textContent = title;
    $('#detail-modal-body').innerHTML = content;
    modal.classList.remove('hidden');
};

window.closeDetailModal = function() {
    const modal = $('#detail-modal');
    if (modal) modal.classList.add('hidden');
};

// ========================================
// Starting Equipment Modal
// ========================================
let pendingCharacterForEquipment = null;

function showStartingEquipmentModal(characterId, characterClass, background) {
    pendingCharacterForEquipment = { characterId, characterClass, background };

    // Update summary text with class/background info
    const classEquip = CLASS_STARTING_EQUIPMENT[characterClass];
    const bgEquip = BACKGROUND_STARTING_EQUIPMENT[background];
    const goldAmount = bgEquip?.currency?.gold || 0;

    const weaponCount = classEquip?.weapons?.length || 0;
    const armorCount = classEquip?.armor?.length || 0;
    const gearCount = (classEquip?.gear?.length || 0) + (bgEquip?.gear?.length || 0);

    const summaryParts = [];
    if (weaponCount > 0) summaryParts.push(`${weaponCount} weapon${weaponCount > 1 ? 's' : ''}`);
    if (armorCount > 0) summaryParts.push(`${armorCount} armor`);
    if (gearCount > 0) summaryParts.push(`${gearCount} gear item${gearCount > 1 ? 's' : ''}`);
    if (goldAmount > 0) summaryParts.push(`${goldAmount} gp`);

    $('#equipment-summary').textContent = summaryParts.length > 0
        ? `${characterClass} + ${background}: ${summaryParts.join(', ')}`
        : 'Class + Background gear, weapons, and gold.';

    $('#starting-equipment-modal').classList.remove('hidden');
}

function closeStartingEquipmentModal() {
    $('#starting-equipment-modal').classList.add('hidden');
    pendingCharacterForEquipment = null;
}

window.handleStartBlank = async function() {
    if (!pendingCharacterForEquipment) return;
    const { characterId } = pendingCharacterForEquipment;
    closeStartingEquipmentModal();
    openCharacter(characterId);
};

window.handleStartEquipped = async function() {
    if (!pendingCharacterForEquipment) return;
    const { characterId, characterClass, background } = pendingCharacterForEquipment;

    try {
        await insertStartingEquipment(characterId, characterClass, background);
    } catch (error) {
        console.error('Failed to add starting equipment:', error);
        alert('Failed to add starting equipment, but character was created.');
    }

    closeStartingEquipmentModal();
    openCharacter(characterId);
};

async function insertStartingEquipment(characterId, characterClass, background) {
    const classEquip = CLASS_STARTING_EQUIPMENT[characterClass];
    const bgEquip = BACKGROUND_STARTING_EQUIPMENT[background];

    // Insert weapons (to weapons table only)
    if (classEquip?.weapons?.length > 0) {
        const weaponsToInsert = classEquip.weapons.map(w => ({
            character_id: characterId,
            name: w.name,
            damage: w.damage,
            damage_type: w.damage_type,
            properties: w.properties,
            attack_bonus: w.attack_bonus,
            equipped: w.equipped
        }));
        await db.from('weapons').insert(weaponsToInsert);
    }

    // Combine armor and gear from class + background gear into inventory_items
    const inventoryItems = [];

    if (classEquip?.armor?.length > 0) {
        classEquip.armor.forEach(item => {
            inventoryItems.push({
                character_id: characterId,
                name: item.name,
                description: item.description,
                quantity: item.quantity,
                weight: item.weight,
                item_type: item.item_type,
                equipped: false,
                attuned: false
            });
        });
    }

    if (classEquip?.gear?.length > 0) {
        classEquip.gear.forEach(item => {
            inventoryItems.push({
                character_id: characterId,
                name: item.name,
                description: item.description,
                quantity: item.quantity,
                weight: item.weight,
                item_type: item.item_type,
                equipped: false,
                attuned: false
            });
        });
    }

    if (bgEquip?.gear?.length > 0) {
        bgEquip.gear.forEach(item => {
            inventoryItems.push({
                character_id: characterId,
                name: item.name,
                description: item.description,
                quantity: item.quantity,
                weight: item.weight,
                item_type: item.item_type,
                equipped: false,
                attuned: false
            });
        });
    }

    if (inventoryItems.length > 0) {
        await db.from('inventory_items').insert(inventoryItems);
    }

    // Update currency (currency row already exists with all 0s from handleCreate)
    if (bgEquip?.currency?.gold > 0) {
        await db.from('currency')
            .update({ gold: bgEquip.currency.gold })
            .eq('character_id', characterId);
    }
}

window.showSpellDetail = function(id) {
    const spell = currentCharacter.spells?.find(s => s.id === id);
    if (!spell) return;
    
    const content = `
        <div class="detail-grid">
            <div class="detail-row"><strong>Level:</strong> ${spell.level === 0 ? 'Cantrip' : spell.level}</div>
            ${spell.school ? `<div class="detail-row"><strong>School:</strong> ${spell.school}</div>` : ''}
            ${spell.casting_time ? `<div class="detail-row"><strong>Casting Time:</strong> ${spell.casting_time}</div>` : ''}
            ${spell.range ? `<div class="detail-row"><strong>Range:</strong> ${spell.range}</div>` : ''}
            ${spell.components ? `<div class="detail-row"><strong>Components:</strong> ${spell.components}</div>` : ''}
            ${spell.duration ? `<div class="detail-row"><strong>Duration:</strong> ${spell.duration}</div>` : ''}
        </div>
        ${spell.description ? `<div class="detail-description">${escapeHtml(spell.description).replace(/\n/g, '<br>')}</div>` : ''}
    `;
    
    showDetailModal(spell.name, content);
};

window.showWeaponDetail = function(id) {
    const weapon = currentCharacter.weapons?.find(w => w.id === id);
    if (!weapon) return;
    
    // Check if this is a special weapon like Unarmed Strike with special options
    const specialAttack = SPECIAL_ATTACKS.find(s => s.name === weapon.name);
    const abs = currentCharacter.ability_scores || {};
    const strMod = getModifier(getAbilityScore(abs, 'str'));
    const profBonus = getProfBonus(currentCharacter.level);
    const grappleDC = 8 + strMod + profBonus;
    
    let specialOptionsHtml = '';
    if (specialAttack && specialAttack.special_options) {
        specialOptionsHtml = `
            <div class="detail-section">
                <div class="detail-section-label">Options</div>
                ${specialAttack.special_options.map(opt => `
                    <div class="special-option">
                        <div class="special-option-header">${opt.name}</div>
                        <div class="special-option-desc">${opt.description.replace(/\n/g, '<br>')}</div>
                        ${opt.name === 'Grapple' || opt.name === 'Shove' ? `<div class="special-option-dc"><strong>DC:</strong> ${grappleDC}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    const content = `
        <div class="detail-grid">
            <div class="detail-row"><strong>Attack Bonus:</strong> ${formatMod(weapon.attack_bonus)}</div>
            <div class="detail-row"><strong>Damage:</strong> ${weapon.damage}</div>
            ${weapon.damage_type ? `<div class="detail-row"><strong>Damage Type:</strong> ${weapon.damage_type}</div>` : ''}
            ${weapon.properties ? `<div class="detail-row"><strong>Properties:</strong> ${weapon.properties}</div>` : ''}
        </div>
        ${specialOptionsHtml}
    `;
    
    showDetailModal(weapon.name, content);
};

window.showBonusActionDetail = function(id) {
    const feature = currentCharacter.features_traits?.find(f => f.id === id);
    if (!feature) return;
    
    let usageHtml = '';
    if (feature.uses_total && feature.uses_total > 0) {
        const usesRemaining = feature.uses_remaining ?? feature.uses_total;
        usageHtml = `
            <div class="detail-usage">
                <strong>Uses:</strong> ${usesRemaining}/${feature.uses_total}
                ${feature.uses_per_rest ? `<span class="usage-rest-type">(Recharges on ${feature.uses_per_rest === 'short' ? 'Short or Long' : 'Long'} Rest)</span>` : ''}
            </div>
        `;
    }
    
    const content = `
        ${feature.source ? `<div class="detail-source">Source: ${escapeHtml(feature.source)}</div>` : ''}
        ${usageHtml}
        ${feature.description ? `<div class="detail-description">${escapeHtml(feature.description).replace(/\n/g, '<br>')}</div>` : '<p class="empty-list">No description available.</p>'}
    `;
    
    showDetailModal(feature.name, content);
};

window.toggleFeatureUse = async function(id, idx, used, total) {
    // Similar to spell slot toggle - clicking fills/unfills
    const newUsed = idx < used ? idx : Math.min(total, idx + 1);
    const newRemaining = total - newUsed;
    
    // Optimistic update
    const feature = currentCharacter.features_traits?.find(f => f.id === id);
    if (feature) {
        feature.uses_remaining = newRemaining;
        renderCharacterPage();
    }
    
    // Database update
    await db.from('features_traits').update({ uses_remaining: newRemaining }).eq('id', id);
};

window.showItemDetail = function(id) {
    const item = currentCharacter.inventory_items?.find(i => i.id === id);
    if (!item) return;
    
    const content = `
        <div class="detail-grid">
            <div class="detail-row"><strong>Type:</strong> ${item.item_type || 'Gear'}</div>
            <div class="detail-row"><strong>Quantity:</strong> ${item.quantity}</div>
            ${item.weight ? `<div class="detail-row"><strong>Weight:</strong> ${item.weight} lb</div>` : ''}
        </div>
        ${item.description ? `<div class="detail-description">${escapeHtml(item.description).replace(/\n/g, '<br>')}</div>` : ''}
    `;
    
    showDetailModal(item.name, content);
};

window.showFeatureDetail = function(id) {
    const feature = currentCharacter.features_traits?.find(f => f.id === id);
    if (!feature) return;
    
    const content = `
        ${feature.source ? `<div class="detail-source">Source: ${escapeHtml(feature.source)}</div>` : ''}
        ${feature.description ? `<div class="detail-description">${escapeHtml(feature.description).replace(/\n/g, '<br>')}</div>` : '<p class="empty-list">No description available.</p>'}
    `;
    
    showDetailModal(feature.name, content);
};

// ========================================
// Add Modal with API Search
// ========================================
let addModalType = null;
let selectedApiItem = null;
let selectedApiEndpoint = null;

window.openAddModal = function(type) {
    addModalType = type;
    selectedApiItem = null;
    selectedApiEndpoint = null;
    const modal = $('#add-item-modal');
    const title = $('#add-modal-title');
    const fields = $('#add-modal-fields');

    const configs = {
        weapon: { 
            title: 'Add Weapon', 
            apiEndpoint: 'equipment',
            specialItems: SPECIAL_ATTACKS,
            apiFilter: item => item.equipment_category === 'Weapon' || item.url?.includes('weapon'),
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D weapons or type custom...' },
                { name: 'attack_bonus', label: 'Attack Bonus', type: 'number', value: 0 },
                { name: 'damage', label: 'Damage', type: 'text', placeholder: '1d8+3' },
                { name: 'damage_type', label: 'Damage Type', type: 'text', placeholder: 'Slashing' },
                { name: 'properties', label: 'Properties', type: 'text', placeholder: 'Versatile, Finesse' }
            ]
        },
        spell: { 
            title: 'Add Spell', 
            apiEndpoint: 'spells',
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D spells...' },
                { name: 'level', label: 'Level (0 = cantrip)', type: 'number', value: 0 },
                { name: 'school', label: 'School', type: 'text', placeholder: 'Evocation' },
                { name: 'casting_time', label: 'Casting Time', type: 'text', placeholder: '1 action' },
                { name: 'range', label: 'Range', type: 'text', placeholder: '120 feet' },
                { name: 'components', label: 'Components', type: 'text', placeholder: 'V, S, M' },
                { name: 'duration', label: 'Duration', type: 'text', placeholder: 'Instantaneous' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        },
        item: { 
            title: 'Add Item', 
            apiEndpoint: 'equipment',
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D equipment...' },
                { name: 'quantity', label: 'Quantity', type: 'number', value: 1 },
                { name: 'item_type', label: 'Type', type: 'select', options: ['Gear', 'Weapon', 'Armor', 'Consumable', 'Treasure', 'Other'] },
                { name: 'weight', label: 'Weight (lb)', type: 'number' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        },
        feature: { 
            title: 'Add Feature/Trait/Feat', 
            apiEndpoints: ['features', 'traits', 'feats'],
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search class features, racial traits, feats...' },
                { name: 'source', label: 'Source', type: 'text', placeholder: 'Auto-detected or enter manually' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        },
        bonusaction: { 
            title: 'Add Bonus Action', 
            apiEndpoints: ['features', 'traits', 'feats'],
            specialItems: COMMON_BONUS_ACTIONS,
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search features or add custom...' },
                { name: 'source', label: 'Source', type: 'text', placeholder: 'Class, Race, Feat, etc.' },
                { name: 'uses_total', label: 'Uses (0 = unlimited)', type: 'number', value: 0 },
                { name: 'uses_per_rest', label: 'Recharges On', type: 'select', options: [['', 'N/A'], ['short', 'Short Rest'], ['long', 'Long Rest']] },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        }
    };

    const config = configs[type];
    title.textContent = config.title;
    
    fields.innerHTML = config.fields.map(f => {
        if (f.type === 'search') {
            return `<div class="form-group">
                <label>${f.label}${f.required ? ' *' : ''}</label>
                <div class="api-search-container">
                    <input type="text" name="${f.name}" class="api-search-input" ${f.required ? 'required' : ''} placeholder="${f.placeholder || ''}" autocomplete="off">
                    <div class="api-search-results hidden"></div>
                </div>
            </div>`;
        }
        if (f.type === 'textarea') {
            return `<div class="form-group"><label>${f.label}</label><textarea name="${f.name}" class="notes-textarea" style="min-height:80px;" placeholder="${f.placeholder || ''}"></textarea></div>`;
        }
        if (f.type === 'select') {
            // Handle options that can be either strings or [value, label] arrays
            const optionsHtml = f.options.map(o => {
                if (Array.isArray(o)) {
                    return `<option value="${o[0]}">${o[1]}</option>`;
                }
                return `<option value="${o}">${o}</option>`;
            }).join('');
            return `<div class="form-group"><label>${f.label}</label><select name="${f.name}">${optionsHtml}</select></div>`;
        }
        return `<div class="form-group"><label>${f.label}${f.required ? ' *' : ''}</label><input type="${f.type}" name="${f.name}" ${f.required ? 'required' : ''} ${f.value !== undefined ? `value="${f.value}"` : ''} ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}></div>`;
    }).join('');

const searchInput = fields.querySelector('.api-search-input');
    const searchResults = fields.querySelector('.api-search-results');
    
    if (searchInput && searchResults) {
        const debouncedSearch = debounce(async (query) => {
            if (query.length < 2) {
                searchResults.classList.add('hidden');
                return;
            }
            
            searchResults.innerHTML = '<div class="api-search-loading">Searching...</div>';
            searchResults.classList.remove('hidden');
            
            let results = [];
            
            // For features, search multiple endpoints
            if (config.apiEndpoints) {
                results = await searchMultipleEndpoints(config.apiEndpoints, query);
            } else {
                const apiResults = await searchDndApi(config.apiEndpoint, query);
                results = apiResults.map(r => ({ ...r, _endpoint: config.apiEndpoint }));
            }
            
            // Add special items for weapons (like Unarmed Strike)
            if (config.specialItems) {
                const matchingSpecial = config.specialItems.filter(s => 
                    s.name.toLowerCase().includes(query.toLowerCase())
                ).map(s => ({ ...s, _isSpecial: true }));
                results = [...matchingSpecial, ...results];
            }
            
            if (results.length === 0) {
                searchResults.innerHTML = '<div class="api-search-empty">No results found. You can still add a custom entry.</div>';
            } else {
                searchResults.innerHTML = results.slice(0, 15).map(r => {
                    let badge = '';
                    if (r._isSpecial) {
                        badge = '<span class="search-badge special">Special</span>';
                    } else if (r._endpoint === 'features') {
                        badge = '<span class="search-badge feature">Class</span>';
                    } else if (r._endpoint === 'traits') {
                        badge = '<span class="search-badge trait">Race</span>';
                    } else if (r._endpoint === 'feats') {
                        badge = '<span class="search-badge feat">Feat</span>';
                    }
                    
                    return `<div class="api-search-result" data-url="${r.url || ''}" data-name="${escapeHtml(r.name)}" data-endpoint="${r._endpoint || ''}" data-special="${r._isSpecial ? 'true' : 'false'}">
                        ${escapeHtml(r.name)}${badge}
                    </div>`;
                }).join('');
                
                // Add click handlers to results
                searchResults.querySelectorAll('.api-search-result').forEach(result => {
                    result.addEventListener('click', async () => {
                        const url = result.dataset.url;
                        const name = result.dataset.name;
                        const endpoint = result.dataset.endpoint;
                        const isSpecial = result.dataset.special === 'true';
                        
                        searchInput.value = name;
                        searchResults.classList.add('hidden');
                        
                        if (isSpecial) {
                            const specialItem = config.specialItems.find(s => s.name === name);
                            if (specialItem) {
                                selectedApiItem = specialItem;
                                selectedApiEndpoint = 'special';
                                populateFormFromSpecial(type, specialItem, fields);
                            }
                        } else if (url) {
                            const details = await getDndApiDetails(url);
                            if (details) {
                                selectedApiItem = details;
                                selectedApiEndpoint = endpoint;
                                populateFormFromApi(type, details, fields, endpoint);
                            }
                        }
                    });
                });
            }
        }, 300);
        
        searchInput.addEventListener('input', (e) => {
            selectedApiItem = null;
            selectedApiEndpoint = null;
            debouncedSearch(e.target.value);
        });
        
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.length >= 2) {
                searchResults.classList.remove('hidden');
            }
        });
        
        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.api-search-container')) {
                searchResults.classList.add('hidden');
            }
        });
    }

    modal.classList.remove('hidden');
};

function populateFormFromSpecial(type, specialItem, fieldsContainer) {
    const form = fieldsContainer.closest('form');
    
    if (type === 'weapon') {
        const strMod = currentCharacter ? getModifier(getAbilityScore(currentCharacter.ability_scores, 'str')) : 0;
        const profBonus = currentCharacter ? getProfBonus(currentCharacter.level) : 2;
        
        let damage = specialItem.damage || '';
        if (damage.includes('STR')) {
            if (strMod >= 0) {
                damage = damage.replace('+STR', `+${strMod}`).replace('STR', `+${strMod}`);
            } else {
                damage = damage.replace('+STR', strMod.toString()).replace('STR', strMod.toString());
            }
        }
        
        if (form.querySelector('[name="attack_bonus"]')) form.querySelector('[name="attack_bonus"]').value = strMod + profBonus;
        if (form.querySelector('[name="damage"]')) form.querySelector('[name="damage"]').value = damage;
        if (form.querySelector('[name="damage_type"]')) form.querySelector('[name="damage_type"]').value = specialItem.damage_type || '';
        if (form.querySelector('[name="properties"]')) form.querySelector('[name="properties"]').value = specialItem.properties || '';
    } else if (type === 'bonusaction') {
        if (form.querySelector('[name="source"]')) form.querySelector('[name="source"]').value = specialItem.source || '';
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = specialItem.description || '';
    }
}

function populateFormFromApi(type, details, fieldsContainer, endpoint) {
    const form = fieldsContainer.closest('form');
    
    if (type === 'spell') {
        const formatted = formatSpellFromApi(details);
        if (form.querySelector('[name="level"]')) form.querySelector('[name="level"]').value = formatted.level;
        if (form.querySelector('[name="school"]')) form.querySelector('[name="school"]').value = formatted.school;
        if (form.querySelector('[name="casting_time"]')) form.querySelector('[name="casting_time"]').value = formatted.casting_time;
        if (form.querySelector('[name="range"]')) form.querySelector('[name="range"]').value = formatted.range;
        if (form.querySelector('[name="components"]')) form.querySelector('[name="components"]').value = formatted.components;
        if (form.querySelector('[name="duration"]')) form.querySelector('[name="duration"]').value = formatted.duration;
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    } else if (type === 'weapon') {
        const profBonus = currentCharacter ? getProfBonus(currentCharacter.level) : 2;
        const formatted = formatWeaponFromApi(details, currentCharacter?.ability_scores, profBonus);
        if (form.querySelector('[name="attack_bonus"]')) form.querySelector('[name="attack_bonus"]').value = formatted.attack_bonus;
        if (form.querySelector('[name="damage"]')) form.querySelector('[name="damage"]').value = formatted.damage;
        if (form.querySelector('[name="damage_type"]')) form.querySelector('[name="damage_type"]').value = formatted.damage_type;
        if (form.querySelector('[name="properties"]')) form.querySelector('[name="properties"]').value = formatted.properties;
    } else if (type === 'item') {
        const formatted = formatItemFromApi(details);
        if (form.querySelector('[name="item_type"]')) form.querySelector('[name="item_type"]').value = formatted.item_type;
        if (form.querySelector('[name="weight"]')) form.querySelector('[name="weight"]').value = formatted.weight || '';
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    } else if (type === 'feature') {
        const formatted = formatFeatureFromApi(details, endpoint);
        if (form.querySelector('[name="source"]')) form.querySelector('[name="source"]').value = formatted.source;
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    } else if (type === 'bonusaction') {
        const formatted = formatFeatureFromApi(details, endpoint);
        if (form.querySelector('[name="source"]')) form.querySelector('[name="source"]').value = formatted.source;
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    }
}

window.closeAddModal = function() {
    $('#add-item-modal').classList.add('hidden');
    $('#add-item-form').reset();
    addModalType = null;
    selectedApiItem = null;
    selectedApiEndpoint = null;
};

async function handleAddSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    data.character_id = currentCharacter.id;

    const tables = { weapon: 'weapons', spell: 'spells', item: 'inventory_items', feature: 'features_traits', bonusaction: 'features_traits' };
    const dataKeys = { weapon: 'weapons', spell: 'spells', item: 'inventory_items', feature: 'features_traits', bonusaction: 'features_traits' };
    
    const modalType = addModalType;
    const dataKey = dataKeys[modalType];
    const table = tables[modalType];
    
    // Handle numeric fields - ensure empty strings become proper defaults
    if (modalType === 'item') {
        data.quantity = parseInt(data.quantity) || 1;
        // Handle weight - empty string should become null, not cause a DB error
        data.weight = data.weight && data.weight !== '' ? parseFloat(data.weight) : null;
    }
    if (data.level !== undefined) data.level = parseInt(data.level) || 0;
    if (data.attack_bonus !== undefined) data.attack_bonus = parseInt(data.attack_bonus) || 0;
    
    if (modalType === 'weapon') {
        data.attack_bonus = parseInt(data.attack_bonus) || 0;
    }
    
    // For bonus actions, handle the special fields
    if (modalType === 'bonusaction') {
        data.is_bonus_action = true;
        data.uses_total = parseInt(data.uses_total) || 0;
        data.uses_remaining = data.uses_total;
        if (!data.uses_per_rest || data.uses_per_rest === '') {
            data.uses_per_rest = null;
        }
    }
    
    if (selectedApiItem && modalType === 'spell') {
        data.api_index = selectedApiItem.index;
    }

    closeAddModal();
    
    const tempId = 'temp_' + Date.now();
    const tempItem = { ...data, id: tempId };
    
    if (!currentCharacter[dataKey]) {
        currentCharacter[dataKey] = [];
    }
    currentCharacter[dataKey].push(tempItem);
    renderCharacterPage();

    const { data: insertedData, error } = await db.from(table).insert(data).select().single();
    
    if (error) {
        console.error('Error adding item:', error);
        currentCharacter[dataKey] = currentCharacter[dataKey].filter(item => item.id !== tempId);
        renderCharacterPage();
        alert('Failed to add item');
        return;
    }
    
    if (insertedData) {
        const index = currentCharacter[dataKey].findIndex(item => item.id === tempId);
        if (index !== -1) {
            currentCharacter[dataKey][index] = insertedData;
        }
    }
}

// ========================================
// Delete Character
// ========================================
window.openDeleteModal = function() {
    $('#delete-char-name').textContent = currentCharacter.name;
    $('#delete-modal').classList.remove('hidden');
};

window.closeDeleteModal = function() {
    $('#delete-modal').classList.add('hidden');
};

async function handleDelete() {
    await db.from('characters').delete().eq('id', currentCharacter.id);
    closeDeleteModal();
    currentCharacter = null;
    await loadCharacters();
    showPage('home-page');
}

// ========================================
// DM Panel & Leveling System
// ========================================

// DM controls now handled by sidemenu.js
function showDMControls() {
    // No-op: side menu handles DM visibility dynamically
}

// Get current leveling mode
function getLevelingMode() {
    return currentSession?.gameWorld?.leveling_mode || 'milestone';
}

// Render DM Panel character list
function renderDMPanel() {
    const container = $('#dm-panel-dynamic');
    if (!container) return;
    const mode = getLevelingMode();

    // Update toggle state
    const toggleBtns = $$('.dm-leveling-btn');
    toggleBtns.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.mode === mode);
    });

    if (mode === 'exp') {
        renderDMPanelEXP(container);
    } else {
        renderDMPanelMilestone(container);
    }
}

function renderDMPanelMilestone(container) {
    const charListHTML = !characters.length
        ? '<p class="empty-list">No characters in this game world.</p>'
        : characters.map(c => `
            <div class="dm-character-item">
                <div class="dm-character-info">
                    <div class="dm-character-name">${escapeHtml(c.name)}</div>
                    <div class="dm-character-details">
                        ${escapeHtml(c.race)} ${escapeHtml(c.class)} • ${escapeHtml(c.player_name)}
                    </div>
                </div>
                <div class="dm-level-badge">Lvl ${c.level}</div>
                <button class="btn-primary dm-grant-btn" onclick="grantIndividualLevel('${c.id}')" ${c.level >= 20 ? 'disabled' : ''}>
                    Grant Level
                </button>
            </div>
        `).join('');

    container.innerHTML = `
        <section class="dm-section">
            <h2 class="dm-section-title">Party Level Management</h2>
            <p class="dm-section-desc">Grant a level to all characters in this game world at once.</p>
            <button class="btn-primary btn-large" onclick="grantPartyLevel()">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5v14"/><path d="M5 12h14"/>
                </svg>
                Grant Level to Entire Party
            </button>
        </section>
        <section class="dm-section">
            <h2 class="dm-section-title">Individual Character Management</h2>
            <p class="dm-section-desc">Grant levels to specific characters.</p>
            <div class="dm-character-list">${charListHTML}</div>
        </section>
    `;
}

function renderDMPanelEXP(container) {
    const charListHTML = !characters.length
        ? '<p class="empty-list">No characters in this game world.</p>'
        : characters.map(c => {
            const nextLevelEXP = getEXPForNextLevel(c.level);
            const expDisplay = nextLevelEXP !== null
                ? `${(c.experience_points || 0).toLocaleString()} / ${nextLevelEXP.toLocaleString()} XP`
                : `${(c.experience_points || 0).toLocaleString()} XP (Max)`;
            const pct = nextLevelEXP ? Math.min(100, ((c.experience_points || 0) / nextLevelEXP) * 100) : 100;
            return `
            <div class="dm-character-item dm-character-item-exp">
                <div class="dm-character-info">
                    <div class="dm-character-name">${escapeHtml(c.name)}</div>
                    <div class="dm-character-details">
                        ${escapeHtml(c.race)} ${escapeHtml(c.class)} • ${escapeHtml(c.player_name)}
                    </div>
                    <div class="dm-exp-bar"><div class="dm-exp-bar-fill" style="width:${pct}%"></div></div>
                    <div class="dm-exp-text">${expDisplay}</div>
                </div>
                <div class="dm-level-badge">Lvl ${c.level}</div>
                <div class="dm-exp-grant">
                    <input type="number" class="dm-exp-input" id="exp-input-${c.id}" placeholder="EXP" min="0">
                    <button class="btn-primary dm-grant-btn" onclick="grantIndividualEXP('${c.id}')" ${c.level >= 20 ? 'disabled' : ''}>
                        Grant
                    </button>
                </div>
            </div>`;
        }).join('');

    container.innerHTML = `
        <section class="dm-section">
            <h2 class="dm-section-title">Party EXP Management</h2>
            <p class="dm-section-desc">Grant EXP to all characters. They auto-level at 5e thresholds.</p>
            <div class="dm-party-exp-row">
                <input type="number" class="dm-exp-input dm-party-exp-input" id="party-exp-input" placeholder="EXP amount" min="0">
                <button class="btn-primary btn-large" onclick="grantPartyEXP()">
                    Grant EXP to Entire Party
                </button>
            </div>
        </section>
        <section class="dm-section">
            <h2 class="dm-section-title">Individual Character Management</h2>
            <p class="dm-section-desc">Grant EXP to specific characters.</p>
            <div class="dm-character-list">${charListHTML}</div>
        </section>
    `;
}

// Grant level to entire party (milestone mode)
window.grantPartyLevel = async function() {
    if (!confirm('Grant a level to ALL characters in this game world?')) return;

    showLoading();

    const eligibleCharacters = characters.filter(c => c.level < 20);

    if (!eligibleCharacters.length) {
        alert('All characters are already at level 20!');
        hideLoading();
        return;
    }

    for (const char of eligibleCharacters) {
        await db.from('characters').update({
            level: char.level + 1,
            pending_level_up: true
        }).eq('id', char.id);
    }

    await loadCharacters();
    renderDMPanel();
    hideLoading();

    alert(`Level granted to ${eligibleCharacters.length} character(s)!`);
};

// Grant level to individual character (milestone mode)
window.grantIndividualLevel = async function(charId) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    if (char.level >= 20) {
        alert('This character is already at max level (20)!');
        return;
    }

    if (!confirm(`Grant a level to ${char.name}? (Level ${char.level} → ${char.level + 1})`)) return;

    await db.from('characters').update({
        level: char.level + 1,
        pending_level_up: true
    }).eq('id', charId);

    await loadCharacters();
    renderDMPanel();

    alert(`${char.name} has been granted a level!`);
};

// Grant EXP to entire party
window.grantPartyEXP = async function() {
    const input = $('#party-exp-input');
    const amount = parseInt(input?.value);
    if (!amount || amount <= 0) {
        alert('Please enter a valid EXP amount.');
        return;
    }

    if (!confirm(`Grant ${amount.toLocaleString()} EXP to ALL characters?`)) return;

    showLoading();
    const leveledUp = [];

    for (const char of characters) {
        if (char.level >= 20) continue;
        const newEXP = (char.experience_points || 0) + amount;
        const newLevel = getLevelForEXP(newEXP);
        const updates = { experience_points: newEXP };

        if (newLevel > char.level) {
            updates.level = Math.min(newLevel, 20);
            updates.pending_level_up = true;
            leveledUp.push(`${char.name} (Lvl ${char.level} → ${updates.level})`);
        }

        await db.from('characters').update(updates).eq('id', char.id);
    }

    await loadCharacters();
    renderDMPanel();
    hideLoading();

    let msg = `EXP granted to party!`;
    if (leveledUp.length) {
        msg += `\n\nLeveled up:\n${leveledUp.join('\n')}`;
    }
    alert(msg);
};

// Grant EXP to individual character
window.grantIndividualEXP = async function(charId) {
    const char = characters.find(c => c.id === charId);
    if (!char) return;

    const input = $(`#exp-input-${charId}`);
    const amount = parseInt(input?.value);
    if (!amount || amount <= 0) {
        alert('Please enter a valid EXP amount.');
        return;
    }

    const newEXP = (char.experience_points || 0) + amount;
    const newLevel = getLevelForEXP(newEXP);
    const updates = { experience_points: newEXP };
    let leveled = false;

    if (newLevel > char.level && char.level < 20) {
        updates.level = Math.min(newLevel, 20);
        updates.pending_level_up = true;
        leveled = true;
    }

    await db.from('characters').update(updates).eq('id', char.id);
    await loadCharacters();
    renderDMPanel();

    if (leveled) {
        alert(`${char.name} gained ${amount.toLocaleString()} EXP and leveled up to ${updates.level}!`);
    }
};

// Toggle leveling mode from DM panel
window.toggleLevelingMode = async function(mode) {
    if (!currentSession?.gameWorld) return;

    await db.from('game_worlds').update({
        leveling_mode: mode
    }).eq('id', currentSession.gameWorldId);

    currentSession.gameWorld.leveling_mode = mode;
    renderDMPanel();
};

// Check if character needs subclass selection
function needsSubclassSelection(character) {
    return character.level >= SUBCLASS_LEVEL && !character.subclass;
}

// Check if level has ASI
function isASILevel(characterClass, level) {
    const asiLevels = ASI_LEVELS[characterClass] || ASI_LEVELS.default;
    return asiLevels.includes(level);
}

// Open level-up wizard
window.openLevelUpWizard = async function() {
    // Allow wizard to open for pending level-ups OR missing subclass
    if (!currentCharacter.pending_level_up && !needsSubclassSelection(currentCharacter)) return;

    // If only needs subclass (no pending level-up), show simplified wizard
    const onlySubclass = !currentCharacter.pending_level_up && needsSubclassSelection(currentCharacter);

    // Store level-up state
    window.levelUpState = {
        character: currentCharacter,
        currentStep: 1,
        totalSteps: 5,
        onlySubclass: onlySubclass,
        changes: {
            hp: null,
            asiChoice: null,
            asiAbilities: {},
            featChoice: null,
            subclass: null,
            spells: []
        }
    };

    // Fetch class data from API
    const classIndex = currentCharacter.class.toLowerCase();
    const response = await fetch(`${DND_API_BASE}/classes/${classIndex}/levels/${currentCharacter.level}`);
    window.levelUpState.classData = await response.json();

    // Skip to first applicable step
    while (window.levelUpState.currentStep <= 5 && shouldSkipStep(window.levelUpState.currentStep)) {
        window.levelUpState.currentStep++;
    }

    // Update wizard title
    $('#levelup-wizard-title').textContent = onlySubclass ? 'Select Subclass' : 'Level Up!';

    // Show wizard modal
    $('#levelup-wizard-modal').classList.remove('hidden');
    renderLevelUpStep();
};

// Render current level-up step
async function renderLevelUpStep() {
    const state = window.levelUpState;
    const step = state.currentStep;

    // Calculate which steps are active (not skipped)
    const activeSteps = [];
    for (let i = 1; i <= state.totalSteps; i++) {
        if (!shouldSkipStep(i)) {
            activeSteps.push(i);
        }
    }
    const currentStepIndex = activeSteps.indexOf(step) + 1;
    const totalActiveSteps = activeSteps.length;

    // Update progress
    $('#levelup-progress-text').textContent = `Step ${currentStepIndex} of ${totalActiveSteps}`;
    $('#levelup-progress-bar').style.width = `${(currentStepIndex / totalActiveSteps) * 100}%`;

    // Update nav buttons
    $('#levelup-prev-btn').disabled = currentStepIndex === 1;

    // Check if this is the last active step
    const isLastStep = currentStepIndex === totalActiveSteps;
    $('#levelup-next-btn').textContent = isLastStep ? 'Complete' : 'Next';

    // Render step content
    const container = $('#levelup-step-content');

    switch(step) {
        case 1:
            container.innerHTML = await renderHPStep();
            break;
        case 2:
            container.innerHTML = await renderASIStep();
            break;
        case 3:
            container.innerHTML = await renderSubclassStep();
            break;
        case 4:
            container.innerHTML = await renderSpellStep();
            break;
        case 5:
            container.innerHTML = await renderFeatureStep();
            break;
    }
}

// Step 1: HP Increase
async function renderHPStep() {
    const char = currentCharacter;
    const conMod = getModifier(getAbilityScore(char.ability_scores, 'con'));
    const hitDie = HIT_DICE[char.class] || 8;
    const average = Math.floor(hitDie / 2) + 1 + conMod;

    return `
        <h3>Hit Points</h3>
        <p class="step-description">Choose how to increase your maximum HP:</p>

        <div class="hp-choice-container">
            <div class="hp-choice-option" onclick="selectHPOption('average')">
                <input type="radio" name="hp-choice" value="average" id="hp-average">
                <label for="hp-average">
                    <div class="hp-choice-title">Take Average</div>
                    <div class="hp-choice-value">+${average} HP</div>
                    <div class="hp-choice-desc">Consistent and reliable</div>
                </label>
            </div>

            <div class="hp-choice-option" onclick="selectHPOption('roll')">
                <input type="radio" name="hp-choice" value="roll" id="hp-roll">
                <label for="hp-roll">
                    <div class="hp-choice-title">Roll for HP</div>
                    <div class="hp-choice-value">1d${hitDie} + ${conMod}</div>
                    <div class="hp-choice-desc">Take a chance!</div>
                </label>
            </div>
        </div>

        <div id="hp-roll-result" class="hp-roll-result hidden">
            <label for="hp-roll-input" class="hp-roll-label">What did you roll on your d${hitDie}?</label>
            <input type="number" id="hp-roll-input" class="hp-roll-input" min="1" max="${hitDie}" placeholder="Enter roll" oninput="applyHPRoll()">
            <div id="hp-roll-display" class="hp-roll-display"></div>
        </div>
    `;
}

window.selectHPOption = function(option) {
    const state = window.levelUpState;
    state.changes.hpChoice = option;

    // Select radio button
    document.querySelectorAll('input[name="hp-choice"]').forEach(r => r.checked = false);
    document.getElementById(`hp-${option}`).checked = true;

    // Show/hide roll UI
    const rollUI = $('#hp-roll-result');
    if (option === 'roll') {
        rollUI.classList.remove('hidden');
    } else {
        rollUI.classList.add('hidden');
        const char = currentCharacter;
        const conMod = getModifier(getAbilityScore(char.ability_scores, 'con'));
        const hitDie = HIT_DICE[char.class] || 8;
        state.changes.hp = Math.floor(hitDie / 2) + 1 + conMod;
    }
};

window.applyHPRoll = function() {
    const char = currentCharacter;
    const conMod = getModifier(getAbilityScore(char.ability_scores, 'con'));
    const input = $('#hp-roll-input');
    const roll = parseInt(input.value);

    if (!roll || roll < 1 || roll > (HIT_DICE[char.class] || 8)) {
        $('#hp-roll-display').innerHTML = '';
        window.levelUpState.changes.hp = null;
        return;
    }

    const total = roll + conMod;
    window.levelUpState.changes.hp = total;

    $('#hp-roll-display').innerHTML = `
        <div class="roll-animation">
            <div class="roll-result">${roll}</div>
            <div class="roll-modifier">+ ${conMod} (CON)</div>
            <div class="roll-total">= ${total} HP</div>
        </div>
    `;
};

// Step 2: ASI or Feat
async function renderASIStep() {
    const char = currentCharacter;
    const abs = char.ability_scores || {};

    return `
        <h3>Ability Score Improvement</h3>
        <p class="step-description">Increase your ability scores or choose a feat:</p>

        <div class="asi-choice-tabs">
            <button class="asi-tab active" onclick="switchASITab('asi', this)">Ability Scores</button>
            <button class="asi-tab" onclick="switchASITab('feat', this)">Feat</button>
        </div>

        <div id="asi-tab-content" class="asi-tab-content">
            <p class="asi-instructions">Increase one ability by +2, or two abilities by +1 each (max 20):</p>
            <div class="asi-grid">
                ${ABILITIES.map(a => {
                    const score = getAbilityScore(abs, a);
                    return `
                        <div class="asi-ability">
                            <div class="asi-ability-name">${a.toUpperCase()}</div>
                            <div class="asi-ability-score">${score}</div>
                            <div class="asi-controls">
                                <button class="asi-btn" onclick="adjustASI('${a}', -1)" ${score >= 20 ? 'disabled' : ''}>−</button>
                                <span id="asi-${a}" class="asi-value">0</span>
                                <button class="asi-btn" onclick="adjustASI('${a}', 1)" ${score >= 20 ? 'disabled' : ''}>+</button>
                            </div>
                        </div>
                    `;
                }).join('')}
            </div>
            <div class="asi-points-remaining">
                Points remaining: <span id="asi-points">2</span>
            </div>
        </div>

        <div id="feat-tab-content" class="asi-tab-content hidden">
            <p class="asi-instructions">Choose a feat to gain instead of ability score increases:</p>
            <div class="feat-list">
                ${FEATS.map(f => `
                    <div class="feat-option" onclick="selectFeat('${f.name}')">
                        <input type="radio" name="feat-choice" id="feat-${f.name.replace(/\s/g, '-')}" value="${f.name}">
                        <label>
                            <div class="feat-name">${f.name}</div>
                            <div class="feat-desc">${f.description}</div>
                        </label>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

window.switchASITab = function(tab, clickedButton) {
    // Reset choices
    window.levelUpState.changes.asiChoice = tab;

    // Update tabs
    $$('.asi-tab').forEach(t => t.classList.remove('active'));
    if (clickedButton) {
        clickedButton.classList.add('active');
    } else {
        // Fallback: find by tab name
        $$('.asi-tab').forEach(t => {
            if (t.textContent.toLowerCase().includes(tab)) {
                t.classList.add('active');
            }
        });
    }

    // Show/hide content
    $('#asi-tab-content').classList.toggle('hidden', tab !== 'asi');
    $('#feat-tab-content').classList.toggle('hidden', tab !== 'feat');
};

window.adjustASI = function(ability, delta) {
    const state = window.levelUpState;
    const current = state.changes.asiAbilities[ability] || 0;
    const newVal = current + delta;

    // Calculate total points used
    const totalUsed = Object.values(state.changes.asiAbilities).reduce((sum, v) => sum + v, 0) - current + newVal;

    if (totalUsed > 2 || newVal < 0 || newVal > 2) return;

    state.changes.asiAbilities[ability] = newVal;
    $(`#asi-${ability}`).textContent = newVal > 0 ? `+${newVal}` : '0';
    $('#asi-points').textContent = 2 - totalUsed;
};

window.selectFeat = function(featName) {
    window.levelUpState.changes.featChoice = featName;
    document.getElementById(`feat-${featName.replace(/\s/g, '-')}`).checked = true;
};

// Step 3: Subclass Selection
async function renderSubclassStep() {
    const char = currentCharacter;
    const subclasses = SUBCLASSES[char.class] || [];

    return `
        <h3>Choose Your Subclass</h3>
        <p class="step-description">Select your ${char.class} subclass:</p>

        <div class="subclass-list">
            ${subclasses.map(sub => `
                <div class="subclass-option" onclick="selectSubclass('${sub}')">
                    <input type="radio" name="subclass" id="subclass-${sub.replace(/\s/g, '-')}" value="${sub}">
                    <label for="subclass-${sub.replace(/\s/g, '-')}">
                        <div class="subclass-name">${sub}</div>
                    </label>
                </div>
            `).join('')}
        </div>
    `;
}

window.selectSubclass = function(subclass) {
    window.levelUpState.changes.subclass = subclass;
    document.getElementById(`subclass-${subclass.replace(/\s/g, '-')}`).checked = true;
};

// Step 4: Spell Selection (for casters)
async function renderSpellStep() {
    const char = currentCharacter;
    const classData = window.levelUpState.classData;
    const spellsKnown = classData.spellcasting?.spells_known_at_level || 0;
    const currentSpellCount = char.spells?.length || 0;
    const canLearnCount = Math.max(0, spellsKnown - currentSpellCount);
    const maxLevel = Math.min(9, Math.ceil(char.level / 2));

    return `
        <h3>Learn New Spells</h3>
        <p class="step-description">You can learn ${canLearnCount} new spell(s).</p>

        <div class="spell-level-filter">
            ${Array.from({length: maxLevel}, (_, i) => i + 1).map(lvl => `
                <button class="filter-btn" onclick="filterSpellLevel(${lvl})">Level ${lvl}</button>
            `).join('')}
        </div>

        <div id="spell-selection-list" class="spell-selection-list">
            <p>Select a spell level above to see available spells.</p>
        </div>

        <div class="spells-selected">
            Selected: <span id="spell-count">0</span>/${canLearnCount}
        </div>
    `;
}

window.filterSpellLevel = async function(level) {
    const response = await fetch(`${DND_API_BASE}/spells?level=${level}`);
    const data = await response.json();

    // Filter spells for this class (would need more API calls to verify, simplified here)
    const list = $('#spell-selection-list');
    list.innerHTML = data.results.map(spell => `
        <div class="spell-select-option" onclick="toggleSpellSelection('${spell.index}', '${spell.name}', ${level})">
            <input type="checkbox" id="spell-${spell.index}" value="${spell.index}">
            <label for="spell-${spell.index}">${spell.name}</label>
        </div>
    `).join('');
};

window.toggleSpellSelection = function(index, name, level) {
    const state = window.levelUpState;
    const checkbox = document.getElementById(`spell-${index}`);
    const classData = state.classData;
    const spellsKnown = classData.spellcasting?.spells_known_at_level || 0;
    const currentSpellCount = currentCharacter.spells?.length || 0;
    const canLearnCount = Math.max(0, spellsKnown - currentSpellCount);

    if (checkbox.checked) {
        if (state.changes.spells.length >= canLearnCount) {
            checkbox.checked = false;
            return;
        }
        state.changes.spells.push({ index, name, level });
    } else {
        state.changes.spells = state.changes.spells.filter(s => s.index !== index);
    }

    $('#spell-count').textContent = state.changes.spells.length;
};

// Step 5: Feature Review
async function renderFeatureStep() {
    const classData = window.levelUpState.classData;
    const features = classData.features || [];

    return `
        <h3>Level ${currentCharacter.level} Features</h3>
        <p class="step-description">Review your new class features:</p>

        <div class="feature-review-list">
            ${features.length ? features.map(f => `
                <div class="feature-review-item">
                    <h4>${f.name}</h4>
                    <p>See your class description for full details.</p>
                </div>
            `).join('') : '<p class="empty-list">No new features at this level.</p>'}
        </div>

        <div class="levelup-summary">
            <h4>Summary of Changes:</h4>
            <ul>
                ${window.levelUpState.changes.hp ? `<li>HP: +${window.levelUpState.changes.hp}</li>` : ''}
                ${Object.keys(window.levelUpState.changes.asiAbilities).length ? `<li>ASI: ${Object.entries(window.levelUpState.changes.asiAbilities).map(([k,v]) => `${k.toUpperCase()} +${v}`).join(', ')}</li>` : ''}
                ${window.levelUpState.changes.featChoice ? `<li>Feat: ${window.levelUpState.changes.featChoice}</li>` : ''}
                ${window.levelUpState.changes.subclass ? `<li>Subclass: ${window.levelUpState.changes.subclass}</li>` : ''}
                ${window.levelUpState.changes.spells.length ? `<li>Spells: +${window.levelUpState.changes.spells.length}</li>` : ''}
                <li>Proficiency Bonus: +${getProfBonus(currentCharacter.level)}</li>
            </ul>
        </div>
    `;
}

// Check if a step should be skipped
function shouldSkipStep(stepNumber) {
    const char = currentCharacter;
    const state = window.levelUpState;

    // Skip based on what's applicable
    switch(stepNumber) {
        case 1: // HP
            return state.onlySubclass; // Skip HP if only selecting subclass
        case 2: // ASI
            return state.onlySubclass || !isASILevel(char.class, char.level);
        case 3: // Subclass
            return char.level < SUBCLASS_LEVEL || (char.subclass && !state.onlySubclass);
        case 4: // Spells
            if (state.onlySubclass || !state.classData?.spellcasting) return true;
            const spellsKnown = state.classData.spellcasting.spells_known_at_level || 0;
            const currentSpellCount = char.spells?.length || 0;
            const canLearnCount = Math.max(0, spellsKnown - currentSpellCount);
            return canLearnCount === 0;
        case 5: // Features
            return state.onlySubclass;
        default:
            return false;
    }
}

// Navigate wizard
window.levelUpNext = async function() {
    const state = window.levelUpState;

    // Check if we're on the last step or all remaining steps would be skipped
    let nextStep = state.currentStep + 1;
    while (nextStep <= state.totalSteps && shouldSkipStep(nextStep)) {
        nextStep++;
    }

    if (nextStep > state.totalSteps) {
        // No more steps, complete level-up
        await completeLevelUp();
    } else {
        // Move to next non-skipped step
        state.currentStep = nextStep;
        await renderLevelUpStep();
    }
};

window.levelUpPrev = function() {
    const state = window.levelUpState;
    if (state.currentStep > 1) {
        // Move to previous step, skipping any that should be skipped
        do {
            state.currentStep--;
        } while (state.currentStep > 1 && shouldSkipStep(state.currentStep));

        renderLevelUpStep();
    }
};

window.closeLevelUpWizard = function() {
    if (confirm('Are you sure? Your level-up progress will be lost.')) {
        $('#levelup-wizard-modal').classList.add('hidden');
        delete window.levelUpState;
    }
};

// Helper: Fetch feature details from API and save to features_traits
async function saveFeatureFromAPI(charId, feature, source) {
    const { data: existing } = await db.from('features_traits')
        .select('id')
        .eq('character_id', charId)
        .eq('name', feature.name)
        .maybeSingle();

    if (existing) return;

    let description = '';
    let usesTotal = null;
    let usesPerRest = null;
    let isBonusAction = false;

    try {
        const featureResp = await fetch(`${DND_API_BASE}/features/${feature.index}`);
        if (featureResp.ok) {
            const featureData = await featureResp.json();
            description = Array.isArray(featureData.desc) ? featureData.desc.join('\n\n') : (featureData.desc || '');

            const useMatch = feature.name.match(/\((\d+)\s+uses?\)/i);
            if (useMatch) {
                usesTotal = parseInt(useMatch[1], 10);
            }

            const descLower = description.toLowerCase();
            if (usesTotal) {
                if (descLower.includes('short or long rest')) {
                    usesPerRest = 'short_or_long';
                } else if (descLower.includes('short rest')) {
                    usesPerRest = 'short';
                } else if (descLower.includes('long rest')) {
                    usesPerRest = 'long';
                }
            }

            if (descLower.includes('bonus action')) {
                isBonusAction = true;
            }
        }
    } catch (e) {
        // If API fetch fails, save with name only
    }

    await db.from('features_traits').insert({
        character_id: charId,
        name: feature.name,
        description,
        source,
        uses_total: usesTotal,
        uses_remaining: usesTotal,
        uses_per_rest: usesPerRest,
        is_bonus_action: isBonusAction
    });
}

// Helper: Fetch and save subclass features for a given level
async function saveSubclassFeatures(charId, className, subclassName, level) {
    try {
        const classIndex = className.toLowerCase();
        const subListResp = await fetch(`${DND_API_BASE}/classes/${classIndex}/subclasses`);
        if (!subListResp.ok) return;
        const subListData = await subListResp.json();

        const match = (subListData.results || []).find(s =>
            s.name.toLowerCase() === subclassName.toLowerCase()
        );
        if (!match) return; // Subclass not in SRD/API

        const subLevelResp = await fetch(`${DND_API_BASE}/subclasses/${match.index}/levels/${level}`);
        if (!subLevelResp.ok) return;
        const subLevelData = await subLevelResp.json();

        for (const feature of (subLevelData.features || [])) {
            await saveFeatureFromAPI(charId, feature, `Subclass Feature (${subclassName} Level ${level})`);
        }
    } catch (e) {
        // Non-SRD subclasses won't have API data; skip gracefully
    }
}

// Apply all level-up changes
async function completeLevelUp() {
    const state = window.levelUpState;
    const changes = state.changes;
    const char = currentCharacter;

    showLoading();

    // If only selecting subclass (not leveling up), just update subclass
    if (state.onlySubclass) {
        if (changes.subclass) {
            await db.from('characters').update({ subclass: changes.subclass }).eq('id', char.id);

            // Also save subclass features for the character's current level
            await saveSubclassFeatures(char.id, char.class, changes.subclass, char.level);
        }

        // Reload character
        await openCharacter(char.id);

        $('#levelup-wizard-modal').classList.add('hidden');
        delete window.levelUpState;

        hideLoading();
        alert('Subclass selected!');
        return;
    }

    // Full level-up process
    // Update HP
    if (changes.hp) {
        await db.from('characters').update({
            hit_point_maximum: char.hit_point_maximum + changes.hp,
            current_hit_points: char.current_hit_points + changes.hp
        }).eq('id', char.id);
    }

    // Update ASI
    if (Object.keys(changes.asiAbilities).length) {
        const abs = Array.isArray(char.ability_scores) ? char.ability_scores[0] : char.ability_scores;
        if (abs) {
            for (const [ability, increase] of Object.entries(changes.asiAbilities)) {
                const fullKey = ABILITY_FULL[ability].toLowerCase();
                abs[fullKey] = Math.min(20, (abs[fullKey] || 10) + increase);
            }
            await db.from('ability_scores').update(abs).eq('character_id', char.id);
        }
    }

    // Save Feat choice as a feature/trait
    if (changes.asiChoice === 'feat' && changes.featChoice) {
        const feat = FEATS.find(f => f.name === changes.featChoice);
        await db.from('features_traits').insert({
            character_id: char.id,
            name: changes.featChoice,
            description: feat ? feat.description : '',
            source: `Feat (Level ${char.level})`
        });
    }

    // Save class features from this level
    const classFeatures = state.classData.features || [];
    for (const feature of classFeatures) {
        await saveFeatureFromAPI(char.id, feature, `Class Feature (${char.class} Level ${char.level})`);
    }

    // Update Subclass
    if (changes.subclass) {
        await db.from('characters').update({ subclass: changes.subclass }).eq('id', char.id);
    }

    // Save subclass features for this level
    const effectiveSubclass = changes.subclass || char.subclass;
    if (effectiveSubclass) {
        await saveSubclassFeatures(char.id, char.class, effectiveSubclass, char.level);
    }

    // Add Spells
    for (const spell of changes.spells) {
        await db.from('spells').insert({
            character_id: char.id,
            name: spell.name,
            level: spell.level,
            api_index: spell.index,
            prepared: false
        });
    }

    // Update proficiency bonus, hit dice, and clear pending flag
    const newProfBonus = getProfBonus(char.level);
    const hd = HIT_DICE[char.class] || 8;
    await db.from('characters').update({
        proficiency_bonus: newProfBonus,
        hit_dice_total: `${char.level}d${hd}`,
        hit_dice_remaining: char.level,
        pending_level_up: false
    }).eq('id', char.id);

    // Update spell slots for casters
    if (state.classData.spellcasting) {
        await updateSpellSlots(char.id, state.classData.spellcasting);
    }

    // Reload character
    await openCharacter(char.id);

    $('#levelup-wizard-modal').classList.add('hidden');
    delete window.levelUpState;

    hideLoading();
    alert('Level-up complete!');
}

// Update spell slots based on class level
async function updateSpellSlots(charId, spellcasting) {
    const slotsData = spellcasting.spell_slots_level || {};

    for (let slotLevel = 1; slotLevel <= 9; slotLevel++) {
        const total = slotsData[`${slotLevel}`] || 0;

        if (total > 0) {
            // Check if slot exists
            const { data: existing } = await db.from('spell_slots')
                .select('*')
                .eq('character_id', charId)
                .eq('slot_level', slotLevel)
                .single();

            if (existing) {
                await db.from('spell_slots').update({ total }).eq('id', existing.id);
            } else {
                await db.from('spell_slots').insert({
                    character_id: charId,
                    slot_level: slotLevel,
                    total,
                    used: 0
                });
            }
        }
    }
}

// ========================================
// Tab Navigation
// ========================================
function initTabs() {
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.tab-content').forEach(c => c.classList.remove('active'));
            $(`#tab-${btn.dataset.tab}`).classList.add('active');
        });
    });
}

// ========================================
// Initialize App
// ========================================
async function init() {
    const hasValidSession = await validateSession();
    if (!hasValidSession) {
        console.log('No valid session found, redirecting to login...');
        return;
    }
    
    console.log('Session validated, initializing app...');
    
    initCreatePage();
    initTabs();
    
    $('#create-btn')?.addEventListener('click', () => showPage('create-page'));
    $('#refresh-btn')?.addEventListener('click', loadCharacters);
    $('#char-back-btn')?.addEventListener('click', () => { 
        try {
            if (currentRealtimeChannel) {
                db.removeChannel(currentRealtimeChannel);
                currentRealtimeChannel = null;
            }
        } catch (e) {
            console.warn('Error removing channel on back:', e);
        }
        currentCharacter = null; 
        loadCharacters(); 
        showPage('home-page');
        setupRosterRealtime();
    });
    
    $('#cancel-delete-btn')?.addEventListener('click', closeDeleteModal);
    $('#confirm-delete-btn')?.addEventListener('click', handleDelete);

    $('#add-item-form')?.addEventListener('submit', handleAddSubmit);
    $('#cancel-add-btn')?.addEventListener('click', closeAddModal);

    $('#level-form')?.addEventListener('submit', handleLevelUpdate);
    $('#cancel-level-btn')?.addEventListener('click', closeLevelModal);

    $('#delete-modal .modal-backdrop')?.addEventListener('click', closeDeleteModal);
    $('#add-item-modal .modal-backdrop')?.addEventListener('click', closeAddModal);
    $('#level-modal .modal-backdrop')?.addEventListener('click', closeLevelModal);

    // Starting Equipment Modal (no backdrop click - must choose an option)
    $('#start-blank-btn')?.addEventListener('click', handleStartBlank);
    $('#start-equipped-btn')?.addEventListener('click', handleStartEquipped);

    // DM Panel event listeners
    $('#dm-panel-back-btn')?.addEventListener('click', () => showPage('home-page'));
    // Leveling mode toggle in DM panel
    document.addEventListener('click', (e) => {
        if (e.target.classList.contains('dm-leveling-btn')) {
            toggleLevelingMode(e.target.dataset.mode);
        }
    });

    await loadCharacters();
    hideLoading();

    // Show DM controls if user is DM
    showDMControls();

    setupRosterRealtime();
    
    // Only restore page state on reload (F5), not on fresh navigation
    const navEntries = performance.getEntriesByType('navigation');
    const isReload = navEntries.length > 0 && navEntries[0].type === 'reload';

    if (isReload) {
        const savedPage = sessionStorage.getItem('dnd-current-page');
        const savedCharacterId = sessionStorage.getItem('dnd-current-character-id');

        if (savedPage === 'character-page' && savedCharacterId) {
            await openCharacter(savedCharacterId);
        } else if (savedPage === 'create-page') {
            showPage('create-page');
        } else {
            showPage('home-page');
        }
    } else {
        // Fresh navigation — clear any stale page state and go to default
        sessionStorage.removeItem('dnd-current-page');
        sessionStorage.removeItem('dnd-current-character-id');
        showPage('home-page');
    }
    
    updateHeaderWithGameWorld();
}

function updateHeaderWithGameWorld() {
    if (currentSession && currentSession.gameWorldName) {
        const header = $('#home-page .header-content h1.logo');
        if (header) {
            header.textContent = `${currentSession.gameWorldName}`;
        }
        
        const roleIndicator = document.createElement('span');
        roleIndicator.className = 'role-indicator';
        roleIndicator.textContent = currentSession.role === 'dm' ? ' (DM)' : ' (Player)';
        roleIndicator.style.fontSize = '12px';
        roleIndicator.style.color = currentSession.role === 'dm' ? 'var(--warning)' : 'var(--accent-primary)';
        roleIndicator.style.marginLeft = '4px';
        
        if (header) {
            header.appendChild(roleIndicator);
        }
    }
}

document.addEventListener('DOMContentLoaded', init);