// ============================================================
// FEATURE REGISTRY (feature-registry.js)
// D&D 5e Feature Effects Data for taphou5e
// ============================================================
// Load BEFORE level-up-engine.js. Provides FEATURE_EFFECTS, FEAT_EFFECTS,
// CLASS_RESOURCES, and SUBCLASS_FEATURES to the global scope.
// ============================================================

// ============================================================
// SECTION 1: FEAT EFFECTS
// ============================================================
// Keys = feat name lowercased with spaces→hyphens (matches app.js conversion)
// "ability_choice" feats prompt a picker modal during level-up

const FEAT_EFFECTS = {

    // --- STAT-MODIFYING FEATS ---
    'alert': {
        type: 'passive_bonus', target: 'initiative_bonus', value: 5,
        display: '+5 to initiative, can\'t be surprised'
    },
    'athlete': {
        type: 'ability_choice',
        choices: ['strength', 'dexterity'], pick: 1, bonus: 1,
        display: '+1 STR or DEX'
    },
    'actor': {
        type: 'ability_increase', increases: { charisma: 1 },
        display: '+1 CHA'
    },
    'durable': {
        type: 'ability_increase', increases: { constitution: 1 },
        display: '+1 CON'
    },
    'heavily-armored': {
        type: 'ability_increase', increases: { strength: 1 },
        display: '+1 STR, gain heavy armor proficiency'
    },
    'heavy-armor-master': {
        type: 'ability_increase', increases: { strength: 1 },
        extra: { type: 'damage_reduction', value: 3, condition: 'heavy_armor_nonmagical_bps' },
        display: '+1 STR, reduce non-magical BPS damage by 3 in heavy armor'
    },
    'keen-mind': {
        type: 'ability_increase', increases: { intelligence: 1 },
        display: '+1 INT'
    },
    'lightly-armored': {
        type: 'ability_choice',
        choices: ['strength', 'dexterity'], pick: 1, bonus: 1,
        display: '+1 STR or DEX, gain light armor proficiency'
    },
    'linguist': {
        type: 'ability_increase', increases: { intelligence: 1 },
        display: '+1 INT, learn 3 languages'
    },
    'medium-armor-master': {
        type: 'passive_bonus', target: 'medium_armor_dex_cap', value: 3,
        display: 'No stealth disadvantage in medium armor, +3 max DEX to AC'
    },
    'mobile': {
        type: 'passive_bonus', target: 'speed', value: 10,
        display: '+10 ft speed'
    },
    'moderately-armored': {
        type: 'ability_choice',
        choices: ['strength', 'dexterity'], pick: 1, bonus: 1,
        display: '+1 STR or DEX, gain medium armor and shield proficiency'
    },
    'observant': {
        type: 'ability_choice',
        choices: ['intelligence', 'wisdom'], pick: 1, bonus: 1,
        extra: { type: 'passive_bonus', target: 'passive_perception', value: 5 },
        display: '+1 INT or WIS, +5 passive Perception and Investigation'
    },
    'resilient': {
        type: 'ability_choice',
        choices: ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'],
        pick: 1, bonus: 1,
        extra: { type: 'save_proficiency' },  // grants proficiency in chosen ability's save
        display: '+1 to chosen ability, proficiency in that saving throw'
    },
    'tavern-brawler': {
        type: 'ability_choice',
        choices: ['strength', 'constitution'], pick: 1, bonus: 1,
        display: '+1 STR or CON'
    },
    'tough': {
        type: 'hp_per_level', value: 2, retroactive: true,
        display: '+2 HP per level (retroactive)'
    },
    'weapon-master': {
        type: 'ability_choice',
        choices: ['strength', 'dexterity'], pick: 1, bonus: 1,
        display: '+1 STR or DEX, gain proficiency with 4 weapons'
    },

    // --- AC-MODIFYING FEATS ---
    'dual-wielder': {
        type: 'passive_bonus', target: 'ac_bonus', value: 1,
        condition: 'dual_wielding',
        display: '+1 AC while wielding two weapons'
    },

    // --- COMBAT FEATS (info/reminder only, no stat change) ---
    'charger':          { type: 'info_only', display: 'Bonus action attack or shove after Dash' },
    'crossbow-expert':  { type: 'info_only', display: 'Ignore loading, no melee disadvantage, bonus action hand crossbow' },
    'defensive-duelist': { type: 'info_only', display: 'Reaction: +proficiency to AC with finesse weapon' },
    'dungeon-delver':   { type: 'info_only', display: 'Advantage on saves vs traps, resistance to trap damage' },
    'elemental-adept':  { type: 'info_only', display: 'Spells ignore chosen element resistance, 1s→2s on damage' },
    'grappler':         { type: 'info_only', display: 'Advantage on attacks vs grappled, can pin' },
    'great-weapon-master': { type: 'info_only', display: 'Bonus action attack on crit/kill, -5 hit/+10 damage' },
    'healer':           { type: 'info_only', display: 'Healer\'s kit stabilize→1 HP, can heal HP 1/rest per creature' },
    'inspiring-leader': { type: 'info_only', display: 'Grant temp HP (level + CHA) to 6 creatures after 10 min speech' },
    'lucky': {
        type: 'usable_feature', uses: 3, recharge: 'long',
        display: '3 luck points: reroll d20 or force enemy reroll'
    },
    'mage-slayer':      { type: 'info_only', display: 'Reaction attack vs caster, advantage on saves vs adjacent spells' },
    'magic-initiate':   { type: 'info_only', display: 'Learn 2 cantrips and 1 1st-level spell from a class' },
    'martial-adept': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: '2 Battle Master maneuvers, 1 superiority die (d6)'
    },
    'mounted-combatant': { type: 'info_only', display: 'Advantage vs smaller unmounted, redirect attacks, mount evasion' },
    'polearm-master':   { type: 'info_only', display: 'Bonus action butt attack (d4), OA when entering reach' },
    'ritual-caster':    { type: 'info_only', display: 'Learn and cast ritual spells from chosen class' },
    'savage-attacker':  { type: 'info_only', display: 'Reroll melee weapon damage once per turn' },
    'sentinel':         { type: 'info_only', display: 'OA stops movement, attack when ally is attacked, ignore Disengage' },
    'sharpshooter':     { type: 'info_only', display: 'Ignore cover, no long range disadvantage, -5 hit/+10 damage' },
    'shield-master':    { type: 'info_only', display: 'Bonus action shove, add shield AC to single-target spell saves' },
    'skilled':          { type: 'info_only', display: 'Gain proficiency in 3 skills or tools' },
    'skulker':          { type: 'info_only', display: 'Hide in light obscurement, missed ranged stays hidden' },
    'spell-sniper':     { type: 'info_only', display: 'Double range for attack spells, ignore partial cover, learn 1 cantrip' },
    'war-caster':       { type: 'info_only', display: 'Advantage on concentration saves, spell as OA, somatic with hands full' },
};


// ============================================================
// SECTION 2: CLASS FEATURE EFFECTS
// ============================================================
// Keys match dnd5eapi.co /features index values where possible.
// Custom keys for features not in the API use class-prefixed naming.

const CLASS_FEATURE_EFFECTS = {

    // ==========================================
    // BARBARIAN
    // ==========================================
    'barbarian-unarmored-defense': {
        type: 'ac_calculation', formula: '10 + dex_mod + con_mod',
        condition: 'no_armor', display: 'AC = 10 + DEX mod + CON mod (no armor)'
    },
    'rage': {
        type: 'usable_feature',
        uses_by_level: { 1:2, 3:3, 6:4, 12:5, 17:6, 20:'unlimited' },
        recharge: 'long',
        display: 'Rage: advantage on STR checks/saves, +damage, resistance to BPS'
    },
    'reckless-attack': { type: 'info_only', display: 'Advantage on STR melee attacks this turn, attacks against you have advantage' },
    'danger-sense': { type: 'info_only', display: 'Advantage on DEX saves vs effects you can see' },
    'fast-movement': {
        type: 'passive_bonus', target: 'speed', value: 10,
        condition: 'no_heavy_armor', display: '+10 ft speed (no heavy armor)'
    },
    'feral-instinct': { type: 'info_only', display: 'Advantage on initiative, act when surprised if you rage' },
    'brutal-critical-1-die': { type: 'info_only', display: 'Roll 1 extra weapon damage die on critical hit' },
    'brutal-critical-2-dice': { type: 'info_only', replaces: 'brutal-critical-1-die', display: 'Roll 2 extra weapon damage dice on critical hit' },
    'brutal-critical-3-dice': { type: 'info_only', replaces: 'brutal-critical-2-dice', display: 'Roll 3 extra weapon damage dice on critical hit' },
    'relentless-rage': { type: 'info_only', display: 'If raging and drop to 0 HP, CON save DC 10+ to stay at 1 HP' },
    'persistent-rage': { type: 'info_only', display: 'Rage only ends early if unconscious or you choose to end it' },
    'indomitable-might': { type: 'info_only', display: 'STR checks minimum result equals STR score' },
    'primal-champion': {
        type: 'ability_increase', increases: { strength: 4, constitution: 4 },
        max: 24, display: '+4 STR, +4 CON (max 24)'
    },

    // --- Berserker (SRD) ---
    'frenzy': { type: 'info_only', display: 'While raging, bonus action melee attack each turn (1 exhaustion when rage ends)' },
    'mindless-rage': { type: 'info_only', display: 'Can\'t be charmed or frightened while raging' },
    'intimidating-presence': {
        type: 'usable_feature', uses: -1, recharge: 'none',
        display: 'Frighten one creature within 30 ft (CHA-based DC)'
    },
    'retaliation': { type: 'info_only', display: 'When damaged by adjacent creature, reaction melee attack against it' },

    // --- Totem Warrior (PHB) ---
    'totem-spirit-bear': { type: 'info_only', display: 'While raging, resistance to all damage except psychic' },
    'totem-spirit-eagle': { type: 'info_only', display: 'While raging, Dash as bonus action, OA against you have disadvantage' },
    'totem-spirit-wolf': { type: 'info_only', display: 'While raging, allies have advantage on melee attacks vs enemies within 5 ft of you' },
    'aspect-of-the-beast-bear': { type: 'info_only', display: 'Carrying capacity doubled, advantage on STR checks to push/pull/lift/break' },
    'aspect-of-the-beast-eagle': { type: 'info_only', display: 'See up to 1 mile clearly, dim light doesn\'t impose disadvantage on Perception' },
    'aspect-of-the-beast-wolf': { type: 'info_only', display: 'Track creatures at fast pace, move stealthily at normal pace' },
    'totemic-attunement-bear': { type: 'info_only', display: 'While raging, hostile creatures within 5 ft have disadvantage on attacks vs allies' },
    'totemic-attunement-eagle': { type: 'info_only', display: 'While raging, gain flying speed equal to walking speed (fall if end turn in air)' },
    'totemic-attunement-wolf': { type: 'info_only', display: 'While raging, bonus action to knock Large or smaller creature prone on melee hit' },

    // ==========================================
    // BARD
    // ==========================================
    'bardic-inspiration-d6': {
        type: 'usable_feature', uses_formula: 'max(1, cha_mod)', recharge: 'long',
        display: 'Grant d6 Bardic Inspiration'
    },
    'bardic-inspiration-d8': {
        type: 'usable_feature', uses_formula: 'max(1, cha_mod)', recharge: 'short',
        replaces: 'bardic-inspiration-d6',
        display: 'Grant d8 Bardic Inspiration'
    },
    'bardic-inspiration-d10': {
        type: 'usable_feature', uses_formula: 'max(1, cha_mod)', recharge: 'short',
        replaces: 'bardic-inspiration-d8',
        display: 'Grant d10 Bardic Inspiration'
    },
    'bardic-inspiration-d12': {
        type: 'usable_feature', uses_formula: 'max(1, cha_mod)', recharge: 'short',
        replaces: 'bardic-inspiration-d10',
        display: 'Grant d12 Bardic Inspiration'
    },
    'jack-of-all-trades': {
        type: 'passive_bonus', target: 'jack_of_all_trades', value: true,
        display: '+half proficiency to non-proficient ability checks and initiative'
    },
    'song-of-rest-d6':  { type: 'info_only', display: 'Allies regain extra 1d6 HP during short rest' },
    'song-of-rest-d8':  { type: 'info_only', replaces: 'song-of-rest-d6', display: 'Allies regain extra 1d8 HP during short rest' },
    'song-of-rest-d10': { type: 'info_only', replaces: 'song-of-rest-d8', display: 'Allies regain extra 1d10 HP during short rest' },
    'song-of-rest-d12': { type: 'info_only', replaces: 'song-of-rest-d10', display: 'Allies regain extra 1d12 HP during short rest' },
    'bard-expertise-1': { type: 'info_only', display: 'Expertise: double proficiency in 2 skills' },
    'bard-expertise-2': { type: 'info_only', display: 'Expertise: double proficiency in 2 additional skills' },
    'countercharm': { type: 'info_only', display: 'Allies within 30 ft advantage on saves vs frightened/charmed' },
    'font-of-inspiration': { type: 'info_only', display: 'Regain Bardic Inspiration on short or long rest' },
    'magical-secrets': { type: 'info_only', display: 'Learn 2 spells from any class' },
    'additional-magical-secrets': { type: 'info_only', display: 'Learn 2 additional spells from any class' },
    'superior-inspiration': { type: 'info_only', display: 'Regain 1 Bardic Inspiration use if you have none on initiative' },

    // --- College of Lore (SRD) ---
    'bonus-proficiencies': { type: 'info_only', display: 'Proficiency in 3 additional skills' },
    'cutting-words': { type: 'info_only', display: 'Reaction: subtract Bardic Inspiration die from enemy roll' },
    'peerless-skill': { type: 'info_only', display: 'Add Bardic Inspiration die to own ability check' },

    // --- College of Valor (PHB) ---
    'combat-inspiration': { type: 'info_only', display: 'Bardic Inspiration can add to damage rolls or AC (reaction)' },
    'valor-extra-attack': { type: 'info_only', display: 'Attack twice per Attack action' },
    'battle-magic': { type: 'info_only', display: 'Bonus action weapon attack after casting a spell' },

    // ==========================================
    // CLERIC
    // ==========================================
    'channel-divinity-1-rest': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Channel Divinity (1/rest)'
    },
    'channel-divinity-2-rest': {
        type: 'usable_feature', uses: 2, recharge: 'short',
        replaces: 'channel-divinity-1-rest',
        display: 'Channel Divinity (2/rest)'
    },
    'channel-divinity-3-rest': {
        type: 'usable_feature', uses: 3, recharge: 'short',
        replaces: 'channel-divinity-2-rest',
        display: 'Channel Divinity (3/rest)'
    },
    'channel-divinity-turn-undead': { type: 'info_only', display: 'Turn undead within 30 ft (WIS save)' },
    'destroy-undead': { type: 'info_only', display: 'Turned undead of low CR are destroyed' },
    'divine-intervention': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Implore deity for aid (level% chance of success)'
    },
    'divine-intervention-improvement': {
        type: 'info_only', replaces: 'divine-intervention',
        display: 'Divine Intervention automatically succeeds'
    },

    // --- Life Domain (SRD) ---
    'disciple-of-life': { type: 'info_only', display: 'Healing spells restore extra 2 + spell level HP' },
    'bonus-proficiency': { type: 'info_only', display: 'Proficiency with heavy armor' },
    'channel-divinity-preserve-life': { type: 'info_only', display: 'Channel Divinity: distribute 5× cleric level HP among allies within 30 ft' },
    'blessed-healer': { type: 'info_only', display: 'When healing others, also regain 2 + spell level HP yourself' },
    'divine-strike': { type: 'info_only', display: 'Once per turn, +1d8 radiant damage on weapon hit' },
    'divine-strike-improved': { type: 'info_only', replaces: 'divine-strike', display: 'Once per turn, +2d8 radiant damage on weapon hit' },
    'supreme-healing': { type: 'info_only', display: 'Maximize healing spell dice instead of rolling' },

    // --- Knowledge Domain (PHB) ---
    'blessings-of-knowledge': { type: 'info_only', display: 'Proficiency and expertise in 2 knowledge skills' },
    'channel-divinity-knowledge-of-the-ages': { type: 'info_only', display: 'Channel Divinity: gain proficiency in any skill or tool for 10 min' },
    'channel-divinity-read-thoughts': { type: 'info_only', display: 'Channel Divinity: read creature\'s thoughts and suggest' },
    'potent-spellcasting-cleric': { type: 'info_only', display: 'Add WIS modifier to cleric cantrip damage' },
    'visions-of-the-past': { type: 'info_only', display: 'Meditate to see past events related to object or area' },

    // --- Light Domain (PHB) ---
    'bonus-cantrip-light': { type: 'info_only', display: 'Learn Light cantrip' },
    'warding-flare': {
        type: 'usable_feature', uses_formula: 'max(1, wis_mod)', recharge: 'long',
        display: 'Reaction: impose disadvantage on attack roll against you'
    },
    'channel-divinity-radiance-of-the-dawn': { type: 'info_only', display: 'Channel Divinity: dispel darkness, deal 2d10+cleric level radiant damage' },
    'improved-flare': { type: 'info_only', display: 'Warding Flare can protect allies within 30 ft' },
    'corona-of-light': { type: 'info_only', display: 'Emit bright light 60 ft, enemies have disadvantage on fire/radiant saves' },

    // --- Tempest Domain (PHB) ---
    'wrath-of-the-storm': {
        type: 'usable_feature', uses_formula: 'max(1, wis_mod)', recharge: 'long',
        display: 'Reaction: 2d8 lightning/thunder damage to attacker (DEX save half)'
    },
    'channel-divinity-destructive-wrath': { type: 'info_only', display: 'Channel Divinity: maximize lightning/thunder damage' },
    'thunderbolt-strike': { type: 'info_only', display: 'Lightning damage pushes Large or smaller creatures 10 ft' },
    'divine-strike-tempest': { type: 'info_only', display: 'Once per turn, +1d8 thunder damage on weapon hit' },
    'stormborn': { type: 'info_only', display: 'Flying speed equal to walking speed outdoors (not underground)' },

    // --- Trickery Domain (PHB) ---
    'blessing-of-the-trickster': { type: 'info_only', display: 'Grant advantage on Stealth to one creature for 1 hour' },
    'channel-divinity-invoke-duplicity': { type: 'info_only', display: 'Channel Divinity: create illusory duplicate, advantage on attacks when adjacent' },
    'channel-divinity-cloak-of-shadows': { type: 'info_only', display: 'Channel Divinity: become invisible until end of next turn' },
    'divine-strike-trickery': { type: 'info_only', display: 'Once per turn, +1d8 poison damage on weapon hit' },
    'improved-duplicity': { type: 'info_only', display: 'Create 4 duplicates instead of 1' },

    // --- War Domain (PHB) ---
    'war-priest': {
        type: 'usable_feature', uses_formula: 'max(1, wis_mod)', recharge: 'long',
        display: 'Bonus action weapon attack after Attack action'
    },
    'channel-divinity-guided-strike': { type: 'info_only', display: 'Channel Divinity: +10 to attack roll' },
    'channel-divinity-war-gods-blessing': { type: 'info_only', display: 'Channel Divinity: +10 to ally\'s attack roll within 30 ft' },
    'divine-strike-war': { type: 'info_only', display: 'Once per turn, +1d8 weapon damage type on weapon hit' },
    'avatar-of-battle': { type: 'info_only', display: 'Resistance to BPS damage from non-magical weapons' },

    // ==========================================
    // DRUID
    // ==========================================
    'wild-shape': {
        type: 'usable_feature', uses: 2, recharge: 'short',
        display: 'Wild Shape: transform into a beast'
    },
    'timeless-body-druid': { type: 'info_only', display: 'Age 10× slower' },
    'beast-spells': { type: 'info_only', display: 'Cast spells while in Wild Shape' },
    'archdruid': { type: 'info_only', display: 'Unlimited Wild Shape uses, ignore V/S/M spell components' },

    // --- Circle of the Land (SRD) ---
    'bonus-cantrip': { type: 'info_only', display: 'Learn 1 additional druid cantrip' },
    'natural-recovery': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Recover spell slots during short rest (total ≤ half druid level)'
    },
    'circle-spells-1': { type: 'info_only', display: 'Gain Circle Spells for chosen terrain (3rd level)' },
    'circle-spells-2': { type: 'info_only', display: 'Gain Circle Spells for chosen terrain (5th level)' },
    'circle-spells-3': { type: 'info_only', display: 'Gain Circle Spells for chosen terrain (7th level)' },
    'circle-spells-4': { type: 'info_only', display: 'Gain Circle Spells for chosen terrain (9th level)' },
    'lands-stride': { type: 'info_only', display: 'Non-magical difficult terrain costs no extra movement, advantage vs magical plants' },
    'natures-ward': { type: 'info_only', display: 'Immune to poison, disease, and fey/elemental charm/frighten' },
    'natures-sanctuary': { type: 'info_only', display: 'Beasts and plants must save to attack you (WIS save)' },

    // --- Circle of the Moon (PHB) ---
    'combat-wild-shape': { type: 'info_only', display: 'Wild Shape as bonus action, expend spell slot to heal 1d8/slot level in beast form' },
    'circle-forms': { type: 'info_only', display: 'Wild Shape into beasts with higher CR (1 at 2nd, level/3 at 6th+)' },
    'primal-strike': { type: 'info_only', display: 'Beast form attacks count as magical' },
    'elemental-wild-shape': { type: 'info_only', display: 'Expend 2 Wild Shape uses to become an elemental' },
    'thousand-forms': { type: 'info_only', display: 'Cast Alter Self at will' },

    // ==========================================
    // FIGHTER
    // ==========================================
    'second-wind': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Bonus action: regain 1d10 + fighter level HP'
    },
    'action-surge-1-use': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Take one additional action on your turn'
    },
    'action-surge-2-uses': {
        type: 'usable_feature', uses: 2, recharge: 'short',
        replaces: 'action-surge-1-use',
        display: 'Take one additional action (2 uses/rest)'
    },
    'indomitable-1-use': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Reroll a failed saving throw'
    },
    'indomitable-2-uses': {
        type: 'usable_feature', uses: 2, recharge: 'long',
        replaces: 'indomitable-1-use',
        display: 'Reroll a failed saving throw (2 uses)'
    },
    'indomitable-3-uses': {
        type: 'usable_feature', uses: 3, recharge: 'long',
        replaces: 'indomitable-2-uses',
        display: 'Reroll a failed saving throw (3 uses)'
    },

    // --- Champion (SRD) ---
    'improved-critical': { type: 'info_only', display: 'Critical hit on 19-20' },
    'remarkable-athlete': {
        type: 'passive_bonus', target: 'remarkable_athlete', value: true,
        display: '+half proficiency to STR/DEX/CON checks (non-proficient), +running jump distance'
    },
    'additional-fighting-style': { type: 'info_only', display: 'Choose a second Fighting Style' },
    'superior-critical': { type: 'info_only', replaces: 'improved-critical', display: 'Critical hit on 18-20' },
    'survivor': { type: 'info_only', display: 'At start of turn, regain 5 + CON mod HP if at half HP or less' },

    // --- Battle Master (PHB) ---
    'combat-superiority': {
        type: 'usable_feature',
        uses_by_level: { 3:4, 7:5, 15:6 },
        recharge: 'short',
        display: 'Superiority Dice for Battle Master maneuvers'
    },
    'superiority-dice-d8': { type: 'info_only', display: 'Superiority Die: d8' },
    'superiority-dice-d10': { type: 'info_only', replaces: 'superiority-dice-d8', display: 'Superiority Die: d10' },
    'superiority-dice-d12': { type: 'info_only', replaces: 'superiority-dice-d10', display: 'Superiority Die: d12' },
    'student-of-war': { type: 'info_only', display: 'Proficiency with one artisan\'s tool' },
    'know-your-enemy': { type: 'info_only', display: 'Study creature for 1 min to learn relative capabilities' },
    'relentless': { type: 'info_only', display: 'Regain 1 superiority die on initiative if you have none' },
    // Individual maneuvers (selected during level-up)
    'maneuver-commanders-strike': { type: 'info_only', display: 'Ally makes reaction attack + superiority die damage' },
    'maneuver-disarming-attack': { type: 'info_only', display: 'Add superiority die to damage, target drops item (STR save)' },
    'maneuver-distracting-strike': { type: 'info_only', display: 'Add superiority die to damage, ally has advantage on next attack vs target' },
    'maneuver-evasive-footwork': { type: 'info_only', display: 'Add superiority die to AC while moving' },
    'maneuver-feinting-attack': { type: 'info_only', display: 'Bonus action feint: advantage + superiority die damage on next attack' },
    'maneuver-goading-attack': { type: 'info_only', display: 'Add superiority die to damage, target has disadvantage attacking others (WIS save)' },
    'maneuver-lunging-attack': { type: 'info_only', display: '+5 ft reach for one attack, add superiority die to damage' },
    'maneuver-maneuvering-attack': { type: 'info_only', display: 'Add superiority die to damage, ally can move half speed as reaction' },
    'maneuver-menacing-attack': { type: 'info_only', display: 'Add superiority die to damage, target frightened (WIS save)' },
    'maneuver-parry': { type: 'info_only', display: 'Reaction: reduce damage by superiority die + DEX mod' },
    'maneuver-precision-attack': { type: 'info_only', display: 'Add superiority die to attack roll' },
    'maneuver-pushing-attack': { type: 'info_only', display: 'Add superiority die to damage, push target 15 ft (STR save)' },
    'maneuver-rally': { type: 'info_only', display: 'Bonus action: ally gains superiority die + CHA mod temp HP' },
    'maneuver-riposte': { type: 'info_only', display: 'Reaction: attack when enemy misses, add superiority die to damage' },
    'maneuver-sweeping-attack': { type: 'info_only', display: 'On hit, deal superiority die damage to adjacent creature' },
    'maneuver-trip-attack': { type: 'info_only', display: 'Add superiority die to damage, knock target prone (STR save)' },

    // --- Eldritch Knight (PHB) ---
    'weapon-bond': { type: 'info_only', display: 'Bond with 2 weapons, can\'t be disarmed, summon as bonus action' },
    'war-magic': { type: 'info_only', display: 'Bonus action weapon attack after casting a cantrip' },
    'eldritch-strike': { type: 'info_only', display: 'Creature hit by weapon has disadvantage on next save vs your spell' },
    'arcane-charge': { type: 'info_only', display: 'Teleport 30 ft when using Action Surge' },
    'improved-war-magic': { type: 'info_only', display: 'Bonus action weapon attack after casting any spell (not just cantrip)' },

    // ==========================================
    // MONK
    // ==========================================
    'monk-unarmored-defense': {
        type: 'ac_calculation', formula: '10 + dex_mod + wis_mod',
        condition: 'no_armor_no_shield', display: 'AC = 10 + DEX mod + WIS mod (no armor/shield)'
    },
    'martial-arts': { type: 'info_only', display: 'Unarmed strike & monk weapons use DEX, bonus action unarmed attack' },
    'ki': {
        type: 'usable_feature', uses_equal_level: true, recharge: 'short',
        display: 'Ki points (equal to monk level)'
    },
    'unarmored-movement-1': {
        type: 'passive_bonus', target: 'speed', value: 10,
        condition: 'no_armor_no_shield', display: '+10 ft speed (unarmored)'
    },
    'unarmored-movement-2': {
        type: 'passive_bonus', target: 'speed', value: 5,
        condition: 'no_armor_no_shield',
        replaces: 'unarmored-movement-1',
        display: '+15 ft speed (unarmored)'
    },
    'unarmored-movement-3': {
        type: 'passive_bonus', target: 'speed', value: 5,
        condition: 'no_armor_no_shield',
        replaces: 'unarmored-movement-2',
        display: '+20 ft speed (unarmored)'
    },
    'unarmored-movement-4': {
        type: 'passive_bonus', target: 'speed', value: 5,
        condition: 'no_armor_no_shield',
        replaces: 'unarmored-movement-3',
        display: '+25 ft speed (unarmored)'
    },
    'unarmored-movement-5': {
        type: 'passive_bonus', target: 'speed', value: 5,
        condition: 'no_armor_no_shield',
        replaces: 'unarmored-movement-4',
        display: '+30 ft speed (unarmored)'
    },
    'deflect-missiles': { type: 'info_only', display: 'Reaction: reduce ranged damage by 1d10 + DEX mod + monk level' },
    'slow-fall': { type: 'info_only', display: 'Reaction: reduce falling damage by 5× monk level' },
    'stunning-strike': { type: 'info_only', display: 'Spend 1 ki: target must CON save or be stunned' },
    'ki-empowered-strikes': { type: 'info_only', display: 'Unarmed strikes count as magical' },
    'evasion': { type: 'info_only', display: 'DEX saves: no damage on success, half on fail' },
    'stillness-of-mind': { type: 'info_only', display: 'End one charmed or frightened effect on yourself as action' },
    'purity-of-body': { type: 'info_only', display: 'Immune to disease and poison' },
    'tongue-of-the-sun-and-moon': { type: 'info_only', display: 'Understand all spoken languages, creatures understand you' },
    'diamond-soul': { type: 'info_only', display: 'Proficiency in all saving throws, spend 1 ki to reroll save' },
    'timeless-body-monk': { type: 'info_only', display: 'No frailty of old age, can\'t be aged magically, don\'t need food/water' },
    'empty-body': { type: 'info_only', display: 'Spend 4 ki: invisible + resistance to all damage except force for 1 min' },
    'perfect-self': { type: 'info_only', display: 'Regain 4 ki points on initiative if you have none' },

    // --- Way of the Open Hand (SRD) ---
    'open-hand-technique': { type: 'info_only', display: 'Flurry of Blows: knock prone (DEX), push 15 ft (STR), or prevent reactions' },
    'wholeness-of-body': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Heal 3× monk level HP as action'
    },
    'tranquility': { type: 'info_only', display: 'Sanctuary effect at end of long rest (WIS save DC 8 + WIS mod + prof)' },
    'quivering-palm': { type: 'info_only', display: 'Spend 3 ki: set vibrations that can reduce target to 0 HP (CON save for 10d10)' },

    // --- Way of Shadow (PHB) ---
    'shadow-arts': { type: 'info_only', display: 'Spend 2 ki to cast Darkness, Darkvision, Pass Without Trace, or Silence' },
    'shadow-step': { type: 'info_only', display: 'Teleport 60 ft between dim/dark areas as bonus action, advantage on next melee' },
    'cloak-of-shadows': { type: 'info_only', display: 'Become invisible in dim light/darkness until you attack or cast' },
    'opportunist': { type: 'info_only', display: 'Reaction: melee attack when creature within 5 ft is hit by another' },

    // --- Way of the Four Elements (PHB) ---
    'disciple-of-the-elements': { type: 'info_only', display: 'Learn elemental disciplines that spend ki to cast spells' },

    // ==========================================
    // PALADIN
    // ==========================================
    'divine-sense': {
        type: 'usable_feature', uses_formula: '1 + cha_mod', recharge: 'long',
        display: 'Detect celestials, fiends, undead within 60 ft'
    },
    'lay-on-hands': {
        type: 'usable_feature', uses_formula: 'level * 5', recharge: 'long',
        display: 'Healing pool of paladin level × 5 HP'
    },
    'divine-smite': { type: 'info_only', display: 'Expend spell slot on melee hit: +2d8 radiant (+1d8/slot level, +1d8 vs undead/fiend)' },
    'divine-health': { type: 'info_only', display: 'Immune to disease' },
    'aura-of-protection': { type: 'info_only', display: 'You and allies within 10 ft add your CHA mod to saving throws' },
    'aura-improvements': { type: 'info_only', display: 'Auras extend to 30 ft' },
    'aura-of-courage': { type: 'info_only', display: 'You and allies within 10 ft can\'t be frightened' },
    'cleansing-touch': {
        type: 'usable_feature', uses_formula: 'max(1, cha_mod)', recharge: 'long',
        display: 'End one spell on willing creature with your touch'
    },

    // --- Oath of Devotion (SRD) ---
    'channel-divinity-sacred-weapon': { type: 'info_only', display: 'Channel Divinity: +CHA mod to attack rolls for 1 min, weapon emits light' },
    'channel-divinity-turn-the-unholy': { type: 'info_only', display: 'Channel Divinity: turn fiends and undead' },
    'aura-of-devotion': { type: 'info_only', display: 'You and allies within 10 ft can\'t be charmed' },
    'purity-of-spirit': { type: 'info_only', display: 'Always under effect of Protection from Evil and Good' },
    'holy-nimbus': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Emit 30 ft bright light, enemies take 10 radiant, advantage vs fiend/undead spells'
    },

    // --- Oath of the Ancients (PHB) ---
    'channel-divinity-natures-wrath': { type: 'info_only', display: 'Channel Divinity: restrain creature with spectral vines (STR/DEX save)' },
    'channel-divinity-turn-the-faithless': { type: 'info_only', display: 'Channel Divinity: turn fey and fiends' },
    'aura-of-warding': { type: 'info_only', display: 'You and allies within 10 ft have resistance to spell damage' },
    'undying-sentinel': { type: 'info_only', display: '1/long rest: drop to 1 HP instead of 0, no old age frailty' },
    'elder-champion': { type: 'info_only', display: 'Transform: regain 10 HP/turn, spells as bonus action, enemies within 10 ft disadvantage on saves vs your paladin spells' },

    // --- Oath of Vengeance (PHB) ---
    'channel-divinity-abjure-enemy': { type: 'info_only', display: 'Channel Divinity: frighten one creature (WIS save), speed 0 on fail' },
    'channel-divinity-vow-of-enmity': { type: 'info_only', display: 'Channel Divinity: advantage on attack rolls vs one creature for 1 min' },
    'relentless-avenger': { type: 'info_only', display: 'After OA hit, move up to half speed without provoking' },
    'soul-of-vengeance': { type: 'info_only', display: 'Reaction: melee attack when vow target makes attack' },
    'avenging-angel': { type: 'info_only', display: 'Transform: fly 60 ft, 30 ft frightening aura (WIS save)' },

    // ==========================================
    // RANGER
    // ==========================================
    'favored-enemy': { type: 'info_only', display: 'Advantage on Survival to track and INT checks about favored enemy type' },
    'favored-enemy-additional': { type: 'info_only', display: 'Choose an additional favored enemy type' },
    'natural-explorer': { type: 'info_only', display: 'Expertise in favored terrain: travel, foraging, tracking benefits' },
    'natural-explorer-additional': { type: 'info_only', display: 'Choose an additional favored terrain' },
    'primeval-awareness': { type: 'info_only', display: 'Expend spell slot: sense favored enemies within 1 mile (6 in favored terrain)' },
    'lands-stride-ranger': { type: 'info_only', display: 'Non-magical difficult terrain no extra cost, advantage vs magical plant saves' },
    'hide-in-plain-sight': { type: 'info_only', display: 'Spend 1 min camouflaging: +10 Stealth while still, no armor' },
    'vanish': { type: 'info_only', display: 'Hide as bonus action, can\'t be tracked non-magically' },
    'feral-senses': { type: 'info_only', display: 'No disadvantage attacking creatures you can\'t see, know location of invisible within 30 ft' },
    'foe-slayer': { type: 'info_only', display: 'Add WIS mod to attack or damage roll against favored enemy once per turn' },

    // --- Hunter (SRD) ---
    'hunters-prey-colossus-slayer': { type: 'info_only', display: 'Once per turn, +1d8 damage to creature below max HP' },
    'hunters-prey-giant-killer': { type: 'info_only', display: 'Reaction: attack Large+ creature that attacks you within 5 ft' },
    'hunters-prey-horde-breaker': { type: 'info_only', display: 'Once per turn, make another attack against a different creature within 5 ft' },
    'defensive-tactics-escape-the-horde': { type: 'info_only', display: 'OA against you have disadvantage' },
    'defensive-tactics-multiattack-defense': { type: 'info_only', display: '+4 AC against subsequent attacks from same creature per turn' },
    'defensive-tactics-steel-will': { type: 'info_only', display: 'Advantage on saves vs being frightened' },
    'multiattack-volley': { type: 'info_only', display: 'Ranged attack against each creature within 10 ft of a point in range' },
    'multiattack-whirlwind-attack': { type: 'info_only', display: 'Melee attack against each creature within 5 ft of you' },
    'superior-hunters-defense-evasion': { type: 'info_only', display: 'DEX saves: no damage on success, half on fail' },
    'superior-hunters-defense-stand-against-the-tide': { type: 'info_only', display: 'When creature misses melee, redirect attack to another creature' },
    'superior-hunters-defense-uncanny-dodge': { type: 'info_only', display: 'Reaction: halve damage from one attack' },

    // --- Beast Master (PHB) ---
    'rangers-companion': { type: 'info_only', display: 'Gain a beast companion (CR 1/4, medium or smaller)' },
    'exceptional-training': { type: 'info_only', display: 'Companion can Dash, Disengage, Dodge, or Help as bonus action' },
    'bestial-fury': { type: 'info_only', display: 'Companion makes 2 attacks on its turn' },
    'share-spells': { type: 'info_only', display: 'Self-targeting spells also affect companion within 30 ft' },

    // ==========================================
    // ROGUE
    // ==========================================
    'expertise-1': { type: 'info_only', display: 'Expertise: double proficiency in 2 skills' },
    'expertise-2': { type: 'info_only', display: 'Expertise: double proficiency in 2 additional skills' },
    'sneak-attack': { type: 'info_only', display: 'Extra damage when you have advantage or ally adjacent (⌈level/2⌉d6)' },
    'thieves-cant': { type: 'info_only', display: 'Secret language of thieves' },
    'cunning-action': { type: 'info_only', display: 'Dash, Disengage, or Hide as bonus action' },
    'uncanny-dodge': { type: 'info_only', display: 'Reaction: halve damage from one attack you can see' },
    'evasion-rogue': { type: 'info_only', display: 'DEX saves: no damage on success, half on fail' },
    'reliable-talent': { type: 'info_only', display: 'Minimum 10 on proficient ability checks' },
    'blindsense': { type: 'info_only', display: 'Know location of hidden/invisible creatures within 10 ft' },
    'slippery-mind': { type: 'info_only', display: 'Proficiency in WIS saving throws' },
    'elusive': { type: 'info_only', display: 'No attack roll has advantage against you unless incapacitated' },
    'stroke-of-luck': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Turn a miss into a hit, or treat ability check as 20'
    },

    // --- Thief (SRD) ---
    'fast-hands': { type: 'info_only', display: 'Cunning Action includes Sleight of Hand, thieves\' tools, and Use Object' },
    'second-story-work': {
        type: 'passive_bonus', target: 'climb_speed_equal',  value: true,
        display: 'Climbing doesn\'t cost extra movement, running jump +DEX mod ft'
    },
    'supreme-sneak': { type: 'info_only', display: 'Advantage on Stealth if you move no more than half speed' },
    'use-magic-device': { type: 'info_only', display: 'Ignore class/race/level requirements for magic items' },
    'thiefs-reflexes': { type: 'info_only', display: 'Two turns in the first round of combat (second at initiative − 10)' },

    // --- Assassin (PHB) ---
    'assassinate': { type: 'info_only', display: 'Advantage on creatures that haven\'t acted, auto-crit on surprised hits' },
    'bonus-proficiencies-assassin': { type: 'info_only', display: 'Proficiency with disguise kit and poisoner\'s kit' },
    'infiltration-expertise': { type: 'info_only', display: 'Create false identity over 7 days with 25 gp' },
    'impostor': { type: 'info_only', display: 'Unerringly mimic speech and mannerisms after 3 hours study' },
    'death-strike': { type: 'info_only', display: 'Double damage on surprised creature that fails CON save' },

    // --- Arcane Trickster (PHB) ---
    'mage-hand-legerdemain': { type: 'info_only', display: 'Mage Hand is invisible and can pickpocket, stow/retrieve, and use thieves\' tools' },
    'magical-ambush': { type: 'info_only', display: 'Targets of your spells have disadvantage if you\'re hidden' },
    'versatile-trickster': { type: 'info_only', display: 'Bonus action: Mage Hand distracts to give you advantage on attacks' },
    'spell-thief': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Steal knowledge of a spell you save against (up to ability to cast) for 8 hours'
    },

    // ==========================================
    // SORCERER
    // ==========================================
    'font-of-magic': { type: 'info_only', display: 'Gain sorcery points to fuel Metamagic and Flexible Casting' },
    'sorcery-points': {
        type: 'usable_feature', uses_equal_level: true, recharge: 'long',
        display: 'Sorcery Points (equal to sorcerer level)'
    },
    'metamagic': { type: 'info_only', display: 'Choose 2 Metamagic options (additional at 10th and 17th)' },
    'sorcerous-restoration': { type: 'info_only', display: 'Regain 4 sorcery points on short rest' },

    // Metamagic options (selected during level-up)
    'metamagic-careful-spell': { type: 'info_only', display: '1 SP: chosen creatures auto-succeed on spell save' },
    'metamagic-distant-spell': { type: 'info_only', display: '1 SP: double spell range (touch → 30 ft)' },
    'metamagic-empowered-spell': { type: 'info_only', display: '1 SP: reroll up to CHA mod damage dice' },
    'metamagic-extended-spell': { type: 'info_only', display: '1 SP: double spell duration (max 24 hours)' },
    'metamagic-heightened-spell': { type: 'info_only', display: '3 SP: one target has disadvantage on first save vs spell' },
    'metamagic-quickened-spell': { type: 'info_only', display: '2 SP: cast spell as bonus action instead of action' },
    'metamagic-subtle-spell': { type: 'info_only', display: '1 SP: cast without V or S components' },
    'metamagic-twinned-spell': { type: 'info_only', display: 'SP = spell level: target a second creature with single-target spell' },

    // --- Draconic Bloodline (SRD) ---
    'dragon-ancestor': { type: 'info_only', display: 'Speak Draconic, double proficiency on CHA checks with dragons' },
    'draconic-resilience': {
        type: 'multi_effect',
        effects: [
            { type: 'hp_per_level', value: 1, retroactive: true },
            { type: 'ac_calculation', formula: '13 + dex_mod', condition: 'no_armor' }
        ],
        display: '+1 HP per level, AC 13 + DEX when unarmored'
    },
    'elemental-affinity': { type: 'info_only', display: 'Add CHA mod to damage of associated element, spend 1 SP for resistance for 1 hour' },
    'dragon-wings': { type: 'info_only', display: 'Bonus action: sprout wings with flying speed equal to walking speed (no heavy armor)' },
    'draconic-presence': { type: 'info_only', display: 'Spend 5 SP: 60 ft aura of awe or fear for 1 min (WIS save)' },

    // --- Wild Magic (PHB) ---
    'wild-magic-surge': { type: 'info_only', display: 'After casting 1st+ level spell, DM can trigger Wild Magic Surge (d100 table)' },
    'tides-of-chaos': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Gain advantage on one attack/check/save (may recharge via Wild Magic Surge)'
    },
    'bend-luck': { type: 'info_only', display: 'Spend 2 SP as reaction: add/subtract 1d4 from creature\'s roll' },
    'controlled-chaos': { type: 'info_only', display: 'Roll twice on Wild Magic Surge table, choose either result' },
    'spell-bombardment': { type: 'info_only', display: 'When you roll max on a damage die, roll one additional die of same type' },

    // ==========================================
    // WARLOCK
    // ==========================================
    'eldritch-invocations': { type: 'info_only', display: 'Learn Eldritch Invocations (select during level-up)' },
    'pact-boon': { type: 'info_only', display: 'Choose Pact of the Chain, Blade, or Tome' },
    'mystic-arcanum-6': { type: 'info_only', display: 'Cast one 6th-level spell once per long rest' },
    'mystic-arcanum-7': { type: 'info_only', display: 'Cast one 7th-level spell once per long rest' },
    'mystic-arcanum-8': { type: 'info_only', display: 'Cast one 8th-level spell once per long rest' },
    'mystic-arcanum-9': { type: 'info_only', display: 'Cast one 9th-level spell once per long rest' },
    'eldritch-master': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Spend 1 min to regain all Pact Magic spell slots'
    },

    // Eldritch Invocations (selected during level-up)
    'invocation-agonizing-blast': { type: 'info_only', display: 'Add CHA mod to Eldritch Blast damage' },
    'invocation-armor-of-shadows': { type: 'info_only', display: 'Cast Mage Armor on self at will' },
    'invocation-beast-speech': { type: 'info_only', display: 'Cast Speak with Animals at will' },
    'invocation-beguiling-influence': { type: 'info_only', display: 'Proficiency in Deception and Persuasion' },
    'invocation-book-of-ancient-secrets': { type: 'info_only', display: 'Pact of the Tome: ritual casting, add ritual spells to book' },
    'invocation-chains-of-carceri': { type: 'info_only', display: 'Cast Hold Monster at will vs celestials, fiends, or elementals (no slot)' },
    'invocation-devils-sight': { type: 'info_only', display: 'See normally in magical and non-magical darkness to 120 ft' },
    'invocation-dreadful-word': { type: 'info_only', display: 'Cast Confusion once using a warlock spell slot' },
    'invocation-eldritch-sight': { type: 'info_only', display: 'Cast Detect Magic at will' },
    'invocation-eldritch-spear': { type: 'info_only', display: 'Eldritch Blast range becomes 300 ft' },
    'invocation-eyes-of-the-rune-keeper': { type: 'info_only', display: 'Read all writing' },
    'invocation-fiendish-vigor': { type: 'info_only', display: 'Cast False Life on self at will (1st level)' },
    'invocation-gaze-of-two-minds': { type: 'info_only', display: 'See/hear through willing humanoid\'s senses' },
    'invocation-lifedrinker': { type: 'info_only', display: 'Pact weapon deals extra necrotic = CHA mod on hit' },
    'invocation-mask-of-many-faces': { type: 'info_only', display: 'Cast Disguise Self at will' },
    'invocation-master-of-myriad-forms': { type: 'info_only', display: 'Cast Alter Self at will' },
    'invocation-minions-of-chaos': { type: 'info_only', display: 'Cast Conjure Elemental once using a warlock spell slot' },
    'invocation-mire-the-mind': { type: 'info_only', display: 'Cast Slow once using a warlock spell slot' },
    'invocation-misty-visions': { type: 'info_only', display: 'Cast Silent Image at will' },
    'invocation-one-with-shadows': { type: 'info_only', display: 'Become invisible in dim light/darkness until you act' },
    'invocation-otherworldly-leap': { type: 'info_only', display: 'Cast Jump on self at will' },
    'invocation-repelling-blast': { type: 'info_only', display: 'Eldritch Blast pushes creature 10 ft straight away' },
    'invocation-sculptor-of-flesh': { type: 'info_only', display: 'Cast Polymorph once using a warlock spell slot' },
    'invocation-sign-of-ill-omen': { type: 'info_only', display: 'Cast Bestow Curse once using a warlock spell slot' },
    'invocation-thief-of-five-fates': { type: 'info_only', display: 'Cast Bane once using a warlock spell slot' },
    'invocation-thirsting-blade': { type: 'info_only', display: 'Pact of the Blade: attack twice per Attack action' },
    'invocation-visions-of-distant-realms': { type: 'info_only', display: 'Cast Arcane Eye at will' },
    'invocation-voice-of-the-chain-master': { type: 'info_only', display: 'Communicate telepathically with/perceive through familiar' },
    'invocation-whispers-of-the-grave': { type: 'info_only', display: 'Cast Speak with Dead at will' },
    'invocation-witch-sight': { type: 'info_only', display: 'See true form of shapechangers/illusions within 30 ft' },

    // --- The Fiend (SRD) ---
    'dark-ones-blessing': { type: 'info_only', display: 'Gain CHA mod + warlock level temp HP when you reduce hostile to 0 HP' },
    'dark-ones-own-luck': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Add 1d10 to ability check or saving throw'
    },
    'fiendish-resilience': { type: 'info_only', display: 'Resistance to one damage type of your choice (change on rest)' },
    'hurl-through-hell': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'On hit, banish target through lower planes: 10d10 psychic damage'
    },

    // --- The Archfey (PHB) ---
    'fey-presence': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Charm or frighten creatures in 10 ft cube (WIS save)'
    },
    'misty-escape': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'When damaged, reaction: become invisible and teleport 60 ft'
    },
    'beguiling-defenses': { type: 'info_only', display: 'Immune to charm, can redirect charm back at caster (WIS save)' },
    'dark-delirium': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Charm or frighten creature for 1 min (WIS save), illusory realm'
    },

    // --- The Great Old One (PHB) ---
    'awakened-mind': { type: 'info_only', display: 'Telepathic communication with creatures within 30 ft' },
    'entropic-ward': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Reaction: impose disadvantage on attack vs you, if miss gain advantage on next attack vs that creature'
    },
    'thought-shield': { type: 'info_only', display: 'Thoughts can\'t be read, resistance to psychic damage, reflect on saves' },
    'create-thrall': { type: 'info_only', display: 'Charm incapacitated humanoid: telepathic link, charmed' },

    // ==========================================
    // WIZARD
    // ==========================================
    'arcane-recovery': {
        type: 'usable_feature', uses: 1, recharge: 'long',
        display: 'Recover spell slots on short rest (total ≤ ⌈wizard level / 2⌉)'
    },
    'spell-mastery': { type: 'info_only', display: 'Choose one 1st and one 2nd level spell: cast at lowest level without slot' },
    'signature-spells': { type: 'info_only', display: 'Choose two 3rd-level spells: always prepared, cast once each without slot' },

    // --- School of Evocation (SRD) ---
    'evocation-savant': { type: 'info_only', display: 'Copy evocation spells in half time and half gold' },
    'sculpt-spells': { type: 'info_only', display: 'Exclude 1 + spell level creatures from evocation AoE (auto-succeed save, no damage)' },
    'potent-cantrip': { type: 'info_only', display: 'Creatures that save against cantrips still take half damage' },
    'empowered-evocation': { type: 'info_only', display: 'Add INT mod to one damage roll of any wizard evocation spell' },
    'overchannel': { type: 'info_only', display: 'Maximize damage of 1st-5th level spell (2d12 necrotic self-damage after first use/rest)' },

    // --- School of Abjuration (PHB) ---
    'abjuration-savant': { type: 'info_only', display: 'Copy abjuration spells in half time and half gold' },
    'arcane-ward': { type: 'info_only', display: 'Create ward with HP = 2× wizard level + INT mod when casting abjuration' },
    'projected-ward': { type: 'info_only', display: 'Ward can absorb damage for allies within 30 ft' },
    'improved-abjuration': { type: 'info_only', display: 'Add proficiency to ability checks for dispelling/counterspelling' },
    'spell-resistance': { type: 'info_only', display: 'Advantage on saves vs spells, resistance to spell damage' },

    // --- School of Conjuration (PHB) ---
    'conjuration-savant': { type: 'info_only', display: 'Copy conjuration spells in half time and half gold' },
    'minor-conjuration': { type: 'info_only', display: 'Conjure a non-magical object (up to 3 ft, 10 lbs) for 1 hour' },
    'benign-transposition': { type: 'info_only', display: 'Teleport 30 ft or swap places with willing creature (recharges on casting conjuration)' },
    'focused-conjuration': { type: 'info_only', display: 'Concentration on conjuration can\'t be broken by taking damage' },
    'durable-summons': { type: 'info_only', display: 'Conjured creatures gain 30 temp HP' },

    // --- School of Divination (PHB) ---
    'divination-savant': { type: 'info_only', display: 'Copy divination spells in half time and half gold' },
    'portent': { type: 'info_only', display: 'Roll 2d20 after long rest, replace any attack/save/check you can see' },
    'expert-divination': { type: 'info_only', display: 'Casting divination spells recovers spell slot of lower level' },
    'the-third-eye': { type: 'info_only', display: 'Choose: darkvision 60ft, ethereal sight 60ft, read any language, or see invisible 10ft' },
    'greater-portent': { type: 'info_only', display: 'Roll 3d20 for Portent instead of 2' },

    // --- School of Enchantment (PHB) ---
    'enchantment-savant': { type: 'info_only', display: 'Copy enchantment spells in half time and half gold' },
    'hypnotic-gaze': { type: 'info_only', display: 'Action: charm creature within 5 ft (WIS save), incapacitated while you maintain' },
    'instinctive-charm': { type: 'info_only', display: 'Reaction: redirect attack to another creature (WIS save)' },
    'split-enchantment': { type: 'info_only', display: 'Single-target enchantment spells can target 2 creatures' },
    'alter-memories': { type: 'info_only', display: 'Charmed creature unaware of being charmed, can erase memory of time charmed' },

    // --- School of Illusion (PHB) ---
    'illusion-savant': { type: 'info_only', display: 'Copy illusion spells in half time and half gold' },
    'improved-minor-illusion': { type: 'info_only', display: 'Minor Illusion creates both sound and image' },
    'malleable-illusions': { type: 'info_only', display: 'Change nature of illusion as action (duration remaining)' },
    'illusory-self': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Create illusory duplicate: attack auto-misses once'
    },
    'illusory-reality': { type: 'info_only', display: 'Make one object in illusion real for 1 min' },

    // --- School of Necromancy (PHB) ---
    'necromancy-savant': { type: 'info_only', display: 'Copy necromancy spells in half time and half gold' },
    'grim-harvest': { type: 'info_only', display: 'Regain HP when killing with spells: 2× spell level (3× for necromancy)' },
    'undead-thralls': { type: 'info_only', display: 'Animate Dead creates extra undead, undead gain your prof bonus to damage and max HP' },
    'inured-to-undeath': { type: 'info_only', display: 'Resistance to necrotic damage, max HP can\'t be reduced' },
    'command-undead': { type: 'info_only', display: 'Action: control one undead (CHA save, advantage if INT 8+)' },

    // --- School of Transmutation (PHB) ---
    'transmutation-savant': { type: 'info_only', display: 'Copy transmutation spells in half time and half gold' },
    'minor-alchemy': { type: 'info_only', display: 'Transform material (wood/stone/iron/copper/silver) into another for 1 hour' },
    'transmuters-stone': { type: 'info_only', display: 'Create stone: darkvision 60ft, +10 speed, CON save proficiency, or resistance to one element' },
    'shapechanger': { type: 'info_only', display: 'Cast Polymorph on self without slot, only into beasts CR ≤ 1' },
    'master-transmuter': { type: 'info_only', display: 'Destroy stone to: transmute, remove all curses/diseases/poisons, raise dead, or restore youth' },
};


// ============================================================
// SECTION 3: FIGHTING STYLE EFFECTS
// ============================================================
// Separated because they need selection UI during level-up

const FIGHTING_STYLE_EFFECTS = {
    // Generic (class-agnostic) - these are applied with class prefix at runtime
    'archery': {
        type: 'passive_bonus', target: 'ranged_attack_bonus', value: 2,
        display: '+2 to ranged attack rolls'
    },
    'defense': {
        type: 'passive_bonus', target: 'ac_bonus', value: 1,
        condition: 'wearing_armor', display: '+1 AC while wearing armor'
    },
    'dueling': {
        type: 'passive_bonus', target: 'melee_damage_bonus', value: 2,
        condition: 'one_handed_melee', display: '+2 damage with one-handed melee (no other weapon)'
    },
    'great-weapon-fighting': {
        type: 'info_only', display: 'Reroll 1s and 2s on damage dice with two-handed/versatile weapons'
    },
    'protection': {
        type: 'info_only', display: 'Reaction: impose disadvantage on attack vs adjacent ally (requires shield)'
    },
    'two-weapon-fighting': {
        type: 'info_only', display: 'Add ability modifier to off-hand attack damage'
    },
};

// Which classes get which fighting styles and at what level
const FIGHTING_STYLE_OPTIONS = {
    'Fighter': {
        level: 1,
        styles: ['archery', 'defense', 'dueling', 'great-weapon-fighting', 'protection', 'two-weapon-fighting']
    },
    'Paladin': {
        level: 2,
        styles: ['defense', 'dueling', 'great-weapon-fighting', 'protection']
    },
    'Ranger': {
        level: 2,
        styles: ['archery', 'defense', 'dueling', 'two-weapon-fighting']
    },
};


// ============================================================
// SECTION 4: CLASS RESOURCE TRACKING
// ============================================================
// Defines level-based resource pools that aren't individual features

const CLASS_RESOURCES = {
    'Barbarian': {
        'rage_uses': { 1:2, 2:2, 3:3, 4:3, 5:3, 6:4, 7:4, 8:4, 9:4, 10:4, 11:4, 12:5, 13:5, 14:5, 15:5, 16:5, 17:6, 18:6, 19:6, 20:'unlimited' },
        'rage_damage': { 1:2, 2:2, 3:2, 4:2, 5:2, 6:2, 7:2, 8:2, 9:3, 10:3, 11:3, 12:3, 13:3, 14:3, 15:3, 16:4, 17:4, 18:4, 19:4, 20:4 },
    },
    'Bard': {
        'bardic_inspiration_die': { 1:'d6', 5:'d8', 10:'d10', 15:'d12' },
    },
    'Fighter': {
        'superiority_dice': { 3:4, 7:5, 15:6 },  // Battle Master only
        'superiority_die_size': { 3:'d8', 10:'d10', 18:'d12' },  // Battle Master only
    },
    'Monk': {
        'ki_points': 'level',  // = monk level
        'martial_arts_die': { 1:'d4', 5:'d6', 11:'d8', 17:'d10' },
        'unarmored_movement': { 2:10, 6:15, 10:20, 14:25, 18:30 },
    },
    'Paladin': {
        'lay_on_hands_pool': 'level * 5',  // = paladin level × 5
    },
    'Sorcerer': {
        'sorcery_points': 'level',  // = sorcerer level, starts at level 2
    },
    'Warlock': {
        'spell_slots': { 1:1, 2:2, 11:3, 17:4 },  // Pact Magic slots
        'slot_level': { 1:1, 3:2, 5:3, 7:4, 9:5 },  // All slots are this level
        'invocations_known': { 2:2, 5:3, 7:4, 9:5, 12:6, 15:7, 18:8 },
    },
    'Wizard': {
        'arcane_recovery_slots': 'ceil(level / 2)',
    },
};


// ============================================================
// SECTION 5: COMBINED FEATURE_EFFECTS REGISTRY
// ============================================================
// Merges CLASS_FEATURE_EFFECTS + legacy prefixed fighting styles
// + generates ASI and Extra Attack entries for all classes

const FEATURE_EFFECTS = { ...CLASS_FEATURE_EFFECTS };

// Generate class-prefixed fighting style entries (for backward compatibility)
// These match the custom keys from Phase 1 engine
Object.entries(FIGHTING_STYLE_OPTIONS).forEach(([cls, config]) => {
    config.styles.forEach(style => {
        const prefix = cls.toLowerCase();
        const key = `${prefix}-fighting-style-${style}`;
        const base = FIGHTING_STYLE_EFFECTS[style];
        if (base) {
            FEATURE_EFFECTS[key] = { ...base };
        }
    });
});
// Also create generic (non-prefixed) versions for Paladin/Ranger
Object.keys(FIGHTING_STYLE_EFFECTS).forEach(style => {
    FEATURE_EFFECTS[`fighting-style-${style}`] = { ...FIGHTING_STYLE_EFFECTS[style] };
});

// Generate ASI entries for all classes
const ASI_CLASSES = [
    'barbarian', 'bard', 'cleric', 'druid', 'fighter', 'monk',
    'paladin', 'ranger', 'rogue', 'sorcerer', 'warlock', 'wizard'
];
ASI_CLASSES.forEach(cls => {
    const count = cls === 'fighter' ? 7 : cls === 'rogue' ? 6 : 5;
    for (let i = 1; i <= count; i++) {
        FEATURE_EFFECTS[`${cls}-ability-score-improvement-${i}`] = {
            type: 'ability_score_improvement',
            options: { increase_one_by_2: true, increase_two_by_1: true, feat: true },
            display: 'Increase ability scores or take a feat'
        };
    }
});

// Generate class-specific Extra Attack entries
['barbarian', 'fighter', 'monk', 'paladin', 'ranger'].forEach(cls => {
    FEATURE_EFFECTS[`${cls}-extra-attack`] = {
        type: 'info_only', display: 'Attack twice per Attack action'
    };
});
// Fighter Extra Attack upgrades
FEATURE_EFFECTS['extra-attack-2'] = { type: 'info_only', display: 'Attack three times per Attack action' };
FEATURE_EFFECTS['extra-attack-3'] = { type: 'info_only', display: 'Attack four times per Attack action' };


// ============================================================
// SECTION 6: EXPORT
// ============================================================

window.FeatureRegistry = {
    FEAT_EFFECTS,
    CLASS_FEATURE_EFFECTS,
    FIGHTING_STYLE_EFFECTS,
    FIGHTING_STYLE_OPTIONS,
    CLASS_RESOURCES,
    FEATURE_EFFECTS,
};

console.log(`[FeatureRegistry] Loaded: ${Object.keys(FEATURE_EFFECTS).length} class features, ${Object.keys(FEAT_EFFECTS).length} feats, ${Object.keys(FIGHTING_STYLE_EFFECTS).length} fighting styles`);
