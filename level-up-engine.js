// ============================================================
// LEVEL-UP ENGINE (level-up-engine.js)
// D&D 5e Feature Effects System for taphou5e
// ============================================================
// This file adds to the global scope. Load AFTER app.js.
// It hooks into existing functions and adds new capabilities.
// ============================================================

// ============================================================
// SECTION 1: RACIAL ABILITY BONUSES
// ============================================================

const RACIAL_ABILITY_BONUSES = {
    'Human':       { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
    'Dwarf':       { constitution: 2 },
    'Elf':         { dexterity: 2 },
    'Halfling':    { dexterity: 2 },
    'Dragonborn':  { strength: 2, charisma: 1 },
    'Gnome':       { intelligence: 2 },
    'Half-Elf':    { charisma: 2 },  // +1 to two others (choice) — handled in UI
    'Half-Orc':    { strength: 2, constitution: 1 },
    'Tiefling':    { charisma: 2, intelligence: 1 },
    'Aasimar':     { charisma: 2 },
    'Goliath':     { strength: 2, constitution: 1 },
    'Tabaxi':      { dexterity: 2, charisma: 1 },
    'Kenku':       { dexterity: 2, wisdom: 1 },
    'Tortle':      { strength: 2, wisdom: 1 },
};

const RACIAL_SPEED = {
    'Human': 30, 'Dwarf': 25, 'Elf': 30, 'Halfling': 25,
    'Dragonborn': 30, 'Gnome': 25, 'Half-Elf': 30, 'Half-Orc': 30,
    'Tiefling': 30, 'Aasimar': 30, 'Goliath': 30, 'Tabaxi': 30,
    'Kenku': 30, 'Tortle': 30,
};

// Half-Elf gets +1 to two abilities of choice (not CHA)
const HALF_ELF_CHOICE_COUNT = 2;
const HALF_ELF_EXCLUDED = 'charisma';

// ============================================================
// SECTION 2: CLASS SAVING THROW PROFICIENCIES
// ============================================================

const CLASS_SAVING_THROWS = {
    'Barbarian':  ['str', 'con'],
    'Bard':       ['dex', 'cha'],
    'Cleric':     ['wis', 'cha'],
    'Druid':      ['int', 'wis'],
    'Fighter':    ['str', 'con'],
    'Monk':       ['str', 'dex'],
    'Paladin':    ['wis', 'cha'],
    'Ranger':     ['str', 'dex'],
    'Rogue':      ['dex', 'int'],
    'Sorcerer':   ['con', 'cha'],
    'Warlock':    ['wis', 'cha'],
    'Wizard':     ['int', 'wis'],
    'Artificer':  ['con', 'int'],
};

// ============================================================
// SECTION 3: FEATURE EFFECTS REGISTRY
// ============================================================

const FEATURE_EFFECTS = {
    // --- FIGHTING STYLES (Fighter) ---
    'fighter-fighting-style-archery': {
        type: 'passive_bonus', target: 'ranged_attack_bonus', value: 2,
        display: '+2 to ranged attack rolls'
    },
    'fighter-fighting-style-defense': {
        type: 'passive_bonus', target: 'ac_bonus', value: 1,
        condition: 'wearing_armor', display: '+1 AC while wearing armor'
    },
    'fighter-fighting-style-dueling': {
        type: 'passive_bonus', target: 'melee_damage_bonus', value: 2,
        condition: 'one_handed_melee', display: '+2 damage with one-handed melee'
    },
    'fighter-fighting-style-great-weapon-fighting': {
        type: 'info_only', display: 'Reroll 1s and 2s on damage dice (two-handed)'
    },
    'fighter-fighting-style-protection': {
        type: 'info_only', display: 'Impose disadvantage on attacks vs adjacent allies'
    },
    'fighter-fighting-style-two-weapon-fighting': {
        type: 'info_only', display: 'Add ability modifier to off-hand damage'
    },

    // --- FIGHTING STYLES (Paladin) ---
    'fighting-style-defense': {
        type: 'passive_bonus', target: 'ac_bonus', value: 1,
        condition: 'wearing_armor', display: '+1 AC while wearing armor'
    },
    'fighting-style-dueling': {
        type: 'passive_bonus', target: 'melee_damage_bonus', value: 2,
        condition: 'one_handed_melee', display: '+2 damage with one-handed melee'
    },
    'fighting-style-great-weapon-fighting': {
        type: 'info_only', display: 'Reroll 1s and 2s on damage dice (two-handed)'
    },
    'fighting-style-protection': {
        type: 'info_only', display: 'Impose disadvantage on attacks vs adjacent allies'
    },

    // --- FIGHTING STYLES (Ranger) ---
    'ranger-fighting-style-archery': {
        type: 'passive_bonus', target: 'ranged_attack_bonus', value: 2,
        display: '+2 to ranged attack rolls'
    },
    'ranger-fighting-style-defense': {
        type: 'passive_bonus', target: 'ac_bonus', value: 1,
        condition: 'wearing_armor', display: '+1 AC while wearing armor'
    },
    'ranger-fighting-style-dueling': {
        type: 'passive_bonus', target: 'melee_damage_bonus', value: 2,
        condition: 'one_handed_melee', display: '+2 damage with one-handed melee'
    },
    'ranger-fighting-style-two-weapon-fighting': {
        type: 'info_only', display: 'Add ability modifier to off-hand damage'
    },

    // --- UNARMORED DEFENSE ---
    'barbarian-unarmored-defense': {
        type: 'ac_calculation', formula: '10 + dex_mod + con_mod',
        condition: 'no_armor', display: 'AC = 10 + DEX mod + CON mod (no armor)'
    },
    'monk-unarmored-defense': {
        type: 'ac_calculation', formula: '10 + dex_mod + wis_mod',
        condition: 'no_armor_no_shield', display: 'AC = 10 + DEX mod + WIS mod (no armor/shield)'
    },

    // --- SPEED MODIFIERS ---
    'fast-movement': {
        type: 'passive_bonus', target: 'speed', value: 10,
        condition: 'no_heavy_armor', display: '+10 ft speed (no heavy armor)'
    },
    'unarmored-movement-1': {
        type: 'passive_bonus', target: 'speed', value: 10,
        display: '+10 ft speed (unarmored)'
    },
    'unarmored-movement-2': {
        type: 'passive_bonus', target: 'speed', value: 5,
        replaces: 'unarmored-movement-1',
        display: '+15 ft speed (unarmored, replaces +10)'
    },

    // --- FEATURES WITH USES ---
    'second-wind': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Regain 1d10 + fighter level HP'
    },
    'action-surge-1-use': {
        type: 'usable_feature', uses: 1, recharge: 'short',
        display: 'Take one additional action'
    },
    'action-surge-2-uses': {
        type: 'usable_feature', uses: 2, recharge: 'short',
        replaces: 'action-surge-1-use',
        display: 'Take one additional action (2 uses)'
    },
    'rage': {
        type: 'usable_feature', uses_by_level: { 1:2, 3:3, 6:4, 12:5, 17:6, 20:'unlimited' },
        recharge: 'long', display: 'Enter rage for bonus damage and resistance'
    },
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
    'ki': {
        type: 'usable_feature', uses_equal_level: true, recharge: 'short',
        display: 'Ki points (equal to monk level)'
    },
    'lay-on-hands': {
        type: 'usable_feature', uses_formula: 'level * 5', recharge: 'long',
        display: 'Healing pool of level × 5 HP'
    },
    'divine-sense': {
        type: 'usable_feature', uses_formula: '1 + cha_mod', recharge: 'long',
        display: 'Detect celestials, fiends, undead'
    },
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

    // --- ABILITY SCORE CAPSTONE ---
    'primal-champion': {
        type: 'ability_increase', increases: { strength: 4, constitution: 4 },
        max: 24, display: '+4 STR, +4 CON (max 24)'
    },

    // --- PASSIVE FEATURES (info only, no stat changes) ---
    'extra-attack-1': { type: 'info_only', display: 'Attack twice per Attack action' },
    'extra-attack-2': { type: 'info_only', replaces: 'extra-attack-1', display: 'Attack three times per Attack action' },
    'extra-attack-3': { type: 'info_only', replaces: 'extra-attack-2', display: 'Attack four times per Attack action' },
    'evasion': { type: 'info_only', display: 'DEX saves: half damage on fail, no damage on success' },
    'uncanny-dodge': { type: 'info_only', display: 'Halve damage from one attack as reaction' },
    'reliable-talent': { type: 'info_only', display: 'Minimum 10 on proficient ability checks' },
    'jack-of-all-trades': {
        type: 'passive_bonus', target: 'jack_of_all_trades', value: true,
        display: '+half proficiency to non-proficient ability checks'
    },
    'remarkable-athlete': {
        type: 'passive_bonus', target: 'remarkable_athlete', value: true,
        display: '+half proficiency to STR/DEX/CON checks (non-proficient)'
    },
};

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


// ============================================================
// SECTION 4: STAT CALCULATION ENGINE
// ============================================================

/**
 * Calculate final ability scores from base + effects
 * @param {Object} baseScores - { strength: 10, dexterity: 14, ... }
 * @param {Array} effects - Array of character_effects rows
 * @returns {Object} Final ability scores (capped at 20, or 24 for Primal Champion)
 */
function calculateFinalAbilityScores(baseScores, effects) {
    const finals = { ...baseScores };
    let maxCap = 20;

    effects.forEach(eff => {
        if (eff.effect_type === 'ability_increase' && eff.active) {
            const data = typeof eff.value === 'string' ? JSON.parse(eff.value) : eff.value;
            if (typeof data === 'object' && data !== null) {
                // Structured increase (e.g., { strength: 2, constitution: 1 })
                Object.entries(data).forEach(([ability, amount]) => {
                    if (finals[ability] !== undefined) {
                        finals[ability] += amount;
                    }
                });
            }
        }
        // Check for cap increase (Primal Champion)
        if (eff.feature_index === 'primal-champion' && eff.active) {
            maxCap = 24;
        }
    });

    // Apply cap
    Object.keys(finals).forEach(ability => {
        finals[ability] = Math.min(finals[ability], maxCap);
    });

    return finals;
}

/**
 * Calculate AC from base + equipment + effects
 * @param {Object} abilityScores - Final ability scores
 * @param {Array} effects - Active character_effects
 * @param {Object} equipment - { hasArmor: bool, armorBaseAC: int, hasShield: bool }
 * @returns {number} Final AC
 */
function calculateAC(abilityScores, effects, equipment = {}) {
    const dexMod = getModifier(abilityScores.dexterity);
    const conMod = getModifier(abilityScores.constitution);
    const wisMod = getModifier(abilityScores.wisdom);

    let baseAC = 10 + dexMod; // Default: unarmored

    // Check for Unarmored Defense calculations
    const unarmoredDefense = effects.find(e =>
        e.active && e.effect_type === 'ac_calculation' && e.formula
    );

    if (unarmoredDefense && !equipment.hasArmor) {
        if (unarmoredDefense.formula === '10 + dex_mod + con_mod') {
            baseAC = 10 + dexMod + conMod;
        } else if (unarmoredDefense.formula === '10 + dex_mod + wis_mod') {
            if (!equipment.hasShield) {
                baseAC = 10 + dexMod + wisMod;
            }
        }
    } else if (equipment.hasArmor) {
        baseAC = equipment.armorBaseAC || 10;
        // Add DEX mod based on armor type (simplified)
        if (equipment.armorType === 'light') {
            baseAC += dexMod;
        } else if (equipment.armorType === 'medium') {
            baseAC += Math.min(dexMod, 2);
        }
        // Heavy armor: no DEX mod (already included in armorBaseAC)
    }

    // Add shield bonus
    if (equipment.hasShield) {
        baseAC += 2;
    }

    // Add passive AC bonuses (Fighting Style: Defense, etc.)
    let acBonuses = 0;
    effects.forEach(eff => {
        if (eff.active && eff.effect_type === 'passive_bonus' && eff.target === 'ac_bonus') {
            // Check conditions
            if (eff.condition === 'wearing_armor' && !equipment.hasArmor) return;
            acBonuses += (eff.value || 0);
        }
    });

    return baseAC + acBonuses;
}

/**
 * Calculate speed from base + effects
 * @param {string} race - Character race
 * @param {Array} effects - Active character_effects
 * @param {Object} equipment - { hasHeavyArmor: bool }
 * @returns {number} Final speed
 */
function calculateSpeed(race, effects, equipment = {}) {
    let baseSpeed = RACIAL_SPEED[race] || 30;

    effects.forEach(eff => {
        if (eff.active && eff.effect_type === 'passive_bonus' && eff.target === 'speed') {
            if (eff.condition === 'no_heavy_armor' && equipment.hasHeavyArmor) return;
            baseSpeed += (eff.value || 0);
        }
    });

    return baseSpeed;
}


// ============================================================
// SECTION 5: CHARACTER CREATION ENHANCEMENTS
// ============================================================

/**
 * Apply racial ability bonuses to base scores
 * @param {Object} baseScores - { strength: 10, ... }
 * @param {string} race - Character race
 * @param {Array} halfElfChoices - For Half-Elf: array of 2 ability names
 * @returns {Object} Modified scores with racial bonuses applied
 */
function applyRacialBonuses(baseScores, race, halfElfChoices = []) {
    const bonuses = RACIAL_ABILITY_BONUSES[race] || {};
    const result = { ...baseScores };

    Object.entries(bonuses).forEach(([ability, bonus]) => {
        if (result[ability] !== undefined) {
            result[ability] += bonus;
        }
    });

    // Half-Elf: +1 to two chosen abilities (not CHA)
    if (race === 'Half-Elf' && halfElfChoices.length === 2) {
        halfElfChoices.forEach(ability => {
            if (result[ability] !== undefined && ability !== 'charisma') {
                result[ability] += 1;
            }
        });
    }

    return result;
}

/**
 * Get the class saving throw proficiencies
 * @param {string} className - Character class
 * @returns {Array} Array of saving throw abbreviations ['str', 'con']
 */
function getClassSavingThrows(className) {
    return CLASS_SAVING_THROWS[className] || [];
}

/**
 * Apply class saving throw proficiencies to the database
 * @param {string} characterId - Character UUID
 * @param {string} className - Character class
 */
async function applyClassSavingThrows(characterId, className) {
    const proficientSaves = getClassSavingThrows(className);
    if (proficientSaves.length === 0) return;

    // Fetch existing saving throws
    const { data: existingSaves } = await supabase
        .from('saving_throws')
        .select('*')
        .eq('character_id', characterId);

    for (const save of proficientSaves) {
        const existing = existingSaves?.find(s => s.ability === save);
        if (existing) {
            await supabase
                .from('saving_throws')
                .update({ proficient: true })
                .eq('id', existing.id);
        } else {
            await supabase
                .from('saving_throws')
                .insert({ character_id: characterId, ability: save, proficient: true });
        }
    }
}

/**
 * Apply racial bonuses and store as character_effects
 * @param {string} characterId - Character UUID
 * @param {string} race - Character race
 * @param {Object} baseScores - Base ability scores
 * @param {Array} halfElfChoices - For Half-Elf bonus choices
 */
async function applyRacialEffects(characterId, race, baseScores, halfElfChoices = []) {
    const bonuses = RACIAL_ABILITY_BONUSES[race] || {};
    const effects = [];

    // Standard racial bonuses
    Object.entries(bonuses).forEach(([ability, bonus]) => {
        effects.push({
            character_id: characterId,
            feature_index: `racial-${race.toLowerCase()}-${ability}`,
            effect_type: 'ability_increase',
            target: ability,
            value: bonus,
            active: true,
            source: 'race'
        });
    });

    // Half-Elf choices
    if (race === 'Half-Elf' && halfElfChoices.length === 2) {
        halfElfChoices.forEach(ability => {
            effects.push({
                character_id: characterId,
                feature_index: `racial-half-elf-choice-${ability}`,
                effect_type: 'ability_increase',
                target: ability,
                value: 1,
                active: true,
                source: 'race'
            });
        });
    }

    // Bulk insert effects
    if (effects.length > 0) {
        await supabase.from('character_effects').insert(effects);
    }

    // Also update the actual ability_scores with bonuses applied
    const finalScores = applyRacialBonuses(baseScores, race, halfElfChoices);
    await supabase
        .from('ability_scores')
        .update({
            strength: finalScores.strength,
            dexterity: finalScores.dexterity,
            constitution: finalScores.constitution,
            intelligence: finalScores.intelligence,
            wisdom: finalScores.wisdom,
            charisma: finalScores.charisma,
        })
        .eq('character_id', characterId);

    return finalScores;
}


// ============================================================
// SECTION 6: FEATURE EFFECT APPLICATION
// ============================================================

/**
 * Apply a feature's mechanical effects to a character
 * @param {string} characterId - Character UUID
 * @param {string} featureIndex - API feature index (e.g., 'fighter-fighting-style-defense')
 * @param {string} source - 'class', 'race', 'feat', 'subclass'
 * @param {Object} extraData - Additional data for ASIs, etc.
 */
async function applyFeatureEffect(characterId, featureIndex, source = 'class', extraData = {}) {
    const effect = FEATURE_EFFECTS[featureIndex];
    if (!effect) return; // No known mechanical effect

    // Handle feature replacement (e.g., Action Surge 1 → 2)
    if (effect.replaces) {
        await supabase
            .from('character_effects')
            .update({ active: false })
            .eq('character_id', characterId)
            .eq('feature_index', effect.replaces);
    }

    switch (effect.type) {
        case 'passive_bonus':
            await supabase.from('character_effects').insert({
                character_id: characterId,
                feature_index: featureIndex,
                effect_type: 'passive_bonus',
                target: effect.target,
                value: effect.value || 0,
                condition: effect.condition || null,
                active: true,
                source
            });
            break;

        case 'ac_calculation':
            await supabase.from('character_effects').insert({
                character_id: characterId,
                feature_index: featureIndex,
                effect_type: 'ac_calculation',
                formula: effect.formula,
                condition: effect.condition || null,
                active: true,
                source
            });
            break;

        case 'ability_increase':
            // Primal Champion style — fixed increases
            if (effect.increases) {
                for (const [ability, amount] of Object.entries(effect.increases)) {
                    await supabase.from('character_effects').insert({
                        character_id: characterId,
                        feature_index: featureIndex,
                        effect_type: 'ability_increase',
                        target: ability,
                        value: amount,
                        active: true,
                        source
                    });
                }
                // Actually update ability_scores
                const { data: scores } = await supabase
                    .from('ability_scores')
                    .select('*')
                    .eq('character_id', characterId)
                    .single();
                if (scores) {
                    const updates = {};
                    const cap = effect.max || 20;
                    for (const [ability, amount] of Object.entries(effect.increases)) {
                        updates[ability] = Math.min((scores[ability] || 10) + amount, cap);
                    }
                    await supabase.from('ability_scores').update(updates).eq('character_id', characterId);
                }
            }
            break;

        case 'ability_score_improvement':
            // ASIs are handled by the level-up wizard UI — this just records the choice
            if (extraData.asiChoices) {
                for (const [ability, amount] of Object.entries(extraData.asiChoices)) {
                    await supabase.from('character_effects').insert({
                        character_id: characterId,
                        feature_index: featureIndex,
                        effect_type: 'ability_increase',
                        target: ability,
                        value: amount,
                        active: true,
                        source: 'asi'
                    });
                }
                // Update actual ability_scores
                const { data: scores } = await supabase
                    .from('ability_scores')
                    .select('*')
                    .eq('character_id', characterId)
                    .single();
                if (scores) {
                    const updates = {};
                    for (const [ability, amount] of Object.entries(extraData.asiChoices)) {
                        updates[ability] = Math.min((scores[ability] || 10) + amount, 20);
                    }
                    await supabase.from('ability_scores').update(updates).eq('character_id', characterId);
                }
            }
            break;

        case 'usable_feature':
            // These are tracked in features_traits (uses_total, uses_remaining, uses_per_rest)
            // The effect registration is handled by saveFeatureFromAPI, but let's ensure
            // the usage data is set correctly
            if (effect.uses) {
                await supabase
                    .from('features_traits')
                    .update({
                        uses_total: effect.uses,
                        uses_remaining: effect.uses,
                        uses_per_rest: effect.recharge || 'long'
                    })
                    .eq('character_id', characterId)
                    .ilike('name', `%${featureIndex.replace(/-/g, '%')}%`);
            }
            break;

        case 'info_only':
            // No mechanical effect to apply
            break;
    }
}


// ============================================================
// SECTION 7: RECALCULATE CHARACTER
// ============================================================

/**
 * Full stat recalculation for a character based on all active effects.
 * Updates AC, speed, and related stats in the database.
 * Does NOT change ability_scores (those are applied directly during ASI/racial).
 * 
 * @param {string} characterId - Character UUID
 */
async function recalculateCharacterStats(characterId) {
    // Fetch character data
    const { data: char } = await supabase
        .from('characters')
        .select('*')
        .eq('id', characterId)
        .single();
    if (!char) return;

    // Fetch ability scores
    const { data: scores } = await supabase
        .from('ability_scores')
        .select('*')
        .eq('character_id', characterId)
        .single();
    if (!scores) return;

    // Fetch all active effects
    const { data: effects } = await supabase
        .from('character_effects')
        .select('*')
        .eq('character_id', characterId)
        .eq('active', true);

    // Fetch equipped armor/shield for AC calculation
    const { data: inventory } = await supabase
        .from('inventory_items')
        .select('*')
        .eq('character_id', characterId)
        .eq('equipped', true);

    // Determine equipment state (simplified)
    const equipment = {
        hasArmor: false,
        hasShield: false,
        hasHeavyArmor: false,
        armorBaseAC: 10,
        armorType: null
    };

    if (inventory) {
        inventory.forEach(item => {
            const nameL = (item.name || '').toLowerCase();
            if (nameL.includes('shield')) {
                equipment.hasShield = true;
            } else if (item.item_type === 'Armor' || nameL.includes('armor') || nameL.includes('mail') || nameL.includes('hide') || nameL.includes('leather') || nameL.includes('breastplate') || nameL.includes('plate')) {
                equipment.hasArmor = true;
                // Rough armor type detection
                if (nameL.includes('padded') || nameL.includes('leather') || nameL.includes('studded')) {
                    equipment.armorType = 'light';
                } else if (nameL.includes('hide') || nameL.includes('chain shirt') || nameL.includes('scale') || nameL.includes('breastplate') || nameL.includes('half plate')) {
                    equipment.armorType = 'medium';
                } else {
                    equipment.armorType = 'heavy';
                    equipment.hasHeavyArmor = true;
                }
            }
        });
    }

    // Calculate new stats
    const newAC = calculateAC(scores, effects || [], equipment);
    const newSpeed = calculateSpeed(char.race, effects || [], equipment);
    const dexMod = getModifier(scores.dexterity);
    const newInitiative = dexMod;
    const profBonus = Math.ceil(char.level / 4) + 1;

    // Update character
    const updates = {
        speed: newSpeed,
        initiative_bonus: newInitiative,
        proficiency_bonus: profBonus
    };

    // Only update AC if we're confident in the calculation
    // (user may have manually set AC for magic items, etc.)
    // We'll update AC but mark it as "calculated" — user can override
    updates.armor_class = newAC;

    await supabase.from('characters').update(updates).eq('id', characterId);

    return { ac: newAC, speed: newSpeed, initiative: newInitiative, proficiency: profBonus };
}


// ============================================================
// SECTION 8: HOOKS INTO EXISTING APP.JS
// ============================================================

/**
 * Enhanced character creation — call after the base character is created.
 * This applies racial bonuses, class saving throws, and speed.
 * 
 * Hook this into handleCreate() in app.js after the character & ability_scores
 * are inserted into the database.
 */
async function enhanceCharacterCreation(characterId, charData, baseScores, halfElfChoices = []) {
    try {
        // 1. Apply racial ability bonuses
        const finalScores = await applyRacialEffects(
            characterId, charData.race, baseScores, halfElfChoices
        );

        // 2. Apply class saving throw proficiencies
        await applyClassSavingThrows(characterId, charData.class);

        // 3. Set correct speed from race
        const raceSpeed = RACIAL_SPEED[charData.race] || 30;
        await supabase.from('characters').update({ speed: raceSpeed }).eq('id', characterId);

        // 4. Recalculate HP based on final CON
        const conMod = getModifier(finalScores.constitution);
        const hitDie = HIT_DICE[charData.class] || 8;
        const level = charData.level || 1;
        let hp;
        if (level === 1) {
            hp = Math.max(1, hitDie + conMod);
        } else {
            hp = Math.max(1, hitDie + conMod + (level - 1) * (Math.floor(hitDie / 2) + 1 + conMod));
        }

        await supabase.from('characters').update({
            hit_point_maximum: hp,
            current_hit_points: hp
        }).eq('id', characterId);

        console.log(`[LevelUpEngine] Enhanced character ${characterId}: racial bonuses, saves, speed, HP`);
    } catch (err) {
        console.error('[LevelUpEngine] Error enhancing character:', err);
    }
}

/**
 * Enhanced level-up completion — call during completeLevelUp() in app.js.
 * Applies mechanical effects from features gained during the level-up wizard.
 * 
 * @param {string} characterId 
 * @param {Array} newFeatures - Array of { apiIndex, name, source }
 * @param {Object} asiChoices - If ASI was taken: { strength: 2 } or { dexterity: 1, wisdom: 1 }
 * @param {string} featChosen - If feat was taken: feat index
 */
async function enhanceLevelUpCompletion(characterId, newFeatures = [], asiChoices = null, featChosen = null) {
    try {
        // Apply effects for each new feature
        for (const feature of newFeatures) {
            const apiIndex = feature.apiIndex || feature.api_index;
            if (apiIndex) {
                await applyFeatureEffect(characterId, apiIndex, feature.source || 'class');
            }
        }

        // Apply ASI choices
        if (asiChoices && Object.keys(asiChoices).length > 0) {
            // Find the ASI feature index for this class/level
            const { data: char } = await supabase
                .from('characters')
                .select('class, level')
                .eq('id', characterId)
                .single();
            if (char) {
                const cls = char.class.toLowerCase();
                const asiFeatures = Object.keys(FEATURE_EFFECTS).filter(k =>
                    k.startsWith(`${cls}-ability-score-improvement-`)
                );
                // Find the next unused ASI feature
                const { data: usedEffects } = await supabase
                    .from('character_effects')
                    .select('feature_index')
                    .eq('character_id', characterId)
                    .like('feature_index', `${cls}-ability-score-improvement-%`);
                const usedIndices = new Set((usedEffects || []).map(e => e.feature_index));
                const nextAsi = asiFeatures.find(f => !usedIndices.has(f));
                if (nextAsi) {
                    await applyFeatureEffect(characterId, nextAsi, 'asi', { asiChoices });
                }
            }
        }

        // Apply feat effects
        if (featChosen) {
            // Feats that grant ability increases are handled in the feat's own effect entry
            await applyFeatureEffect(characterId, featChosen, 'feat');
        }

        // Recalculate all derived stats
        await recalculateCharacterStats(characterId);

        console.log(`[LevelUpEngine] Level-up effects applied for ${characterId}`);
    } catch (err) {
        console.error('[LevelUpEngine] Error applying level-up effects:', err);
    }
}


// ============================================================
// SECTION 9: UTILITY DISPLAY HELPERS
// ============================================================

/**
 * Get a human-readable summary of all active effects for a character
 * Useful for showing in the Stats tab or a "Character Effects" panel
 */
async function getActiveEffectsSummary(characterId) {
    const { data: effects } = await supabase
        .from('character_effects')
        .select('*')
        .eq('character_id', characterId)
        .eq('active', true);

    if (!effects || effects.length === 0) return [];

    return effects.map(eff => {
        const registry = FEATURE_EFFECTS[eff.feature_index];
        return {
            featureIndex: eff.feature_index,
            source: eff.source,
            type: eff.effect_type,
            target: eff.target,
            value: eff.value,
            condition: eff.condition,
            display: registry ? registry.display : `${eff.effect_type}: ${eff.target} ${eff.value > 0 ? '+' : ''}${eff.value}`
        };
    });
}

/**
 * Get racial bonus display text for the character creation form
 */
function getRacialBonusDisplay(race) {
    const bonuses = RACIAL_ABILITY_BONUSES[race];
    if (!bonuses) return 'No racial bonuses defined';

    const parts = Object.entries(bonuses).map(([ability, bonus]) =>
        `+${bonus} ${ability.charAt(0).toUpperCase() + ability.slice(1, 3).toUpperCase()}`
    );

    let text = parts.join(', ');
    if (race === 'Half-Elf') {
        text += ' + choose 2 others for +1';
    }
    return text;
}


// ============================================================
// SECTION 10: HALF-ELF ABILITY CHOICE UI
// ============================================================

/**
 * Show a modal for Half-Elf players to pick 2 abilities for +1 bonus.
 * Returns a Promise that resolves with the chosen abilities.
 */
function showHalfElfAbilityChoice() {
    return new Promise((resolve) => {
        const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom'];
        const selected = new Set();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content">
                <h2>Half-Elf Ability Bonuses</h2>
                <p>Choose 2 abilities to increase by +1 (in addition to +2 CHA):</p>
                <div id="half-elf-choices" style="display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px;">
                    ${abilities.map(a => `
                        <label style="display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--bg-tertiary); border: 2px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer;">
                            <input type="checkbox" value="${a}" class="half-elf-check">
                            <span style="text-transform: capitalize;">${a}</span>
                        </label>
                    `).join('')}
                </div>
                <p id="half-elf-count" style="text-align: center; color: var(--text-tertiary); margin-bottom: 16px;">Selected: 0 / 2</p>
                <div class="modal-actions">
                    <button id="half-elf-confirm" class="btn-primary" disabled>Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const checkboxes = modal.querySelectorAll('.half-elf-check');
        const countText = modal.querySelector('#half-elf-count');
        const confirmBtn = modal.querySelector('#half-elf-confirm');

        checkboxes.forEach(cb => {
            cb.addEventListener('change', () => {
                if (cb.checked) {
                    selected.add(cb.value);
                } else {
                    selected.delete(cb.value);
                }
                // Enforce max 2
                if (selected.size >= 2) {
                    checkboxes.forEach(c => {
                        if (!c.checked) c.disabled = true;
                    });
                } else {
                    checkboxes.forEach(c => c.disabled = false);
                }
                countText.textContent = `Selected: ${selected.size} / 2`;
                confirmBtn.disabled = selected.size !== 2;

                // Highlight selected
                checkboxes.forEach(c => {
                    c.closest('label').style.borderColor =
                        c.checked ? 'var(--accent-primary)' : 'var(--border-subtle)';
                });
            });
        });

        confirmBtn.addEventListener('click', () => {
            modal.remove();
            resolve(Array.from(selected));
        });
    });
}


// ============================================================
// SECTION 11: RACIAL BONUS PREVIEW IN CREATE FORM
// ============================================================

/**
 * Update the character creation form to show racial bonus preview
 * and auto-apply bonuses to the displayed modifier calculations.
 * 
 * Call this from initCreatePage() in app.js, after the race dropdown
 * change listener is set up.
 */
function initRacialBonusPreview() {
    const raceSelect = document.getElementById('char-race');
    if (!raceSelect) return;

    // Create preview element if it doesn't exist
    let preview = document.getElementById('racial-bonus-preview');
    if (!preview) {
        preview = document.createElement('div');
        preview.id = 'racial-bonus-preview';
        preview.style.cssText = 'font-size: 13px; color: var(--accent-primary); margin-top: 4px; padding: 6px 10px; background: rgba(59, 130, 246, 0.08); border-radius: var(--radius-sm);';
        const raceGroup = raceSelect.closest('.form-group');
        if (raceGroup) raceGroup.appendChild(preview);
    }

    function updatePreview() {
        const race = raceSelect.value;
        preview.textContent = getRacialBonusDisplay(race);
    }

    raceSelect.addEventListener('change', updatePreview);
    updatePreview();
}


// ============================================================
// EXPORT / GLOBAL REGISTRATION
// ============================================================

// Make everything available globally for use in app.js
window.LevelUpEngine = {
    // Constants
    RACIAL_ABILITY_BONUSES,
    RACIAL_SPEED,
    CLASS_SAVING_THROWS,
    FEATURE_EFFECTS,

    // Calculation functions
    calculateFinalAbilityScores,
    calculateAC,
    calculateSpeed,
    applyRacialBonuses,
    getClassSavingThrows,

    // Database operations
    applyClassSavingThrows,
    applyRacialEffects,
    applyFeatureEffect,
    recalculateCharacterStats,

    // High-level hooks
    enhanceCharacterCreation,
    enhanceLevelUpCompletion,

    // UI helpers
    getActiveEffectsSummary,
    getRacialBonusDisplay,
    showHalfElfAbilityChoice,
    initRacialBonusPreview,
};

console.log('[LevelUpEngine] Module loaded. Available at window.LevelUpEngine');
