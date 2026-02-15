// ============================================================
// LEVEL-UP ENGINE (level-up-engine.js)
// D&D 5e Feature Effects System for taphou5e
// ============================================================
// Load AFTER app.js and feature-registry.js.
// Depends on: db, getModifier, HIT_DICE, ABILITY_FULL, ABILITIES (from app.js)
//             FeatureRegistry (from feature-registry.js)
// ============================================================


// ============================================================
// SECTION 1: RACIAL DATA
// ============================================================

const RACIAL_ABILITY_BONUSES = {
    'Human':       { strength: 1, dexterity: 1, constitution: 1, intelligence: 1, wisdom: 1, charisma: 1 },
    'Dwarf':       { constitution: 2 },
    'Elf':         { dexterity: 2 },
    'Halfling':    { dexterity: 2 },
    'Dragonborn':  { strength: 2, charisma: 1 },
    'Gnome':       { intelligence: 2 },
    'Half-Elf':    { charisma: 2 },
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
// SECTION 3: FEATURE EFFECT RESOLUTION
// ============================================================

function getFeatureEffect(featureIndex) {
    if (window.FeatureRegistry && window.FeatureRegistry.FEATURE_EFFECTS[featureIndex]) {
        return window.FeatureRegistry.FEATURE_EFFECTS[featureIndex];
    }
    return null;
}

function getFeatEffect(featIndex) {
    if (window.FeatureRegistry && window.FeatureRegistry.FEAT_EFFECTS[featIndex]) {
        return window.FeatureRegistry.FEAT_EFFECTS[featIndex];
    }
    return null;
}


// ============================================================
// SECTION 4: STAT CALCULATION ENGINE
// ============================================================

function calculateFinalAbilityScores(baseScores, effects) {
    const finals = { ...baseScores };
    let maxCap = 20;

    effects.forEach(eff => {
        if (eff.effect_type === 'ability_increase' && eff.active) {
            const data = typeof eff.value === 'string' ? JSON.parse(eff.value) : eff.value;
            if (typeof data === 'object' && data !== null) {
                Object.entries(data).forEach(([ability, amount]) => {
                    if (finals[ability] !== undefined) finals[ability] += amount;
                });
            }
        }
        if (eff.feature_index === 'primal-champion' && eff.active) maxCap = 24;
    });

    Object.keys(finals).forEach(ab => { finals[ab] = Math.min(finals[ab], maxCap); });
    return finals;
}

function calculateAC(abilityScores, effects, equipment = {}) {
    const dexMod = getModifier(abilityScores.dexterity);
    const conMod = getModifier(abilityScores.constitution);
    const wisMod = getModifier(abilityScores.wisdom);
    let baseAC = 10 + dexMod;

    // Unarmored AC calculations (Barbarian, Monk, Draconic Resilience)
    const acCalcs = effects.filter(e => e.active && e.effect_type === 'ac_calculation' && e.formula);

    if (!equipment.hasArmor && acCalcs.length > 0) {
        let bestAC = baseAC;
        for (const calc of acCalcs) {
            let calcAC = baseAC;
            if (calc.formula === '10 + dex_mod + con_mod') calcAC = 10 + dexMod + conMod;
            else if (calc.formula === '10 + dex_mod + wis_mod' && !equipment.hasShield) calcAC = 10 + dexMod + wisMod;
            else if (calc.formula === '13 + dex_mod') calcAC = 13 + dexMod;
            if (calcAC > bestAC) bestAC = calcAC;
        }
        baseAC = bestAC;
    } else if (equipment.hasArmor) {
        baseAC = equipment.armorBaseAC || 10;
        const medArmorMaster = effects.find(e => e.active && e.effect_type === 'passive_bonus' && e.target === 'medium_armor_dex_cap');
        const medDexCap = medArmorMaster ? (medArmorMaster.value || 3) : 2;
        if (equipment.armorType === 'light') baseAC += dexMod;
        else if (equipment.armorType === 'medium') baseAC += Math.min(dexMod, medDexCap);
    }

    if (equipment.hasShield) baseAC += 2;

    let acBonuses = 0;
    effects.forEach(eff => {
        if (eff.active && eff.effect_type === 'passive_bonus' && eff.target === 'ac_bonus') {
            if (eff.condition === 'wearing_armor' && !equipment.hasArmor) return;
            if (eff.condition === 'dual_wielding') return; // TODO: detect from equipment
            acBonuses += (eff.value || 0);
        }
    });

    return baseAC + acBonuses;
}

function calculateSpeed(race, effects, equipment = {}) {
    let baseSpeed = RACIAL_SPEED[race] || 30;
    effects.forEach(eff => {
        if (eff.active && eff.effect_type === 'passive_bonus' && eff.target === 'speed') {
            if (eff.condition === 'no_heavy_armor' && equipment.hasHeavyArmor) return;
            if (eff.condition === 'no_armor_no_shield' && (equipment.hasArmor || equipment.hasShield)) return;
            baseSpeed += (eff.value || 0);
        }
    });
    return baseSpeed;
}

function calculateInitiative(abilityScores, effects, profBonus = 2) {
    let init = getModifier(abilityScores.dexterity);
    effects.forEach(eff => {
        if (!eff.active) return;
        if (eff.effect_type === 'passive_bonus') {
            if (eff.target === 'initiative_bonus') init += (eff.value || 0);
            if (eff.target === 'jack_of_all_trades' && eff.value) init += Math.floor(profBonus / 2);
            if (eff.target === 'remarkable_athlete' && eff.value) init += Math.ceil(profBonus / 2);
        }
    });
    return init;
}

function calculateMaxHP(charLevel, charClass, conScore, effects) {
    const conMod = getModifier(conScore);
    const hitDie = HIT_DICE[charClass] || 8;
    let hp = hitDie + conMod; // Level 1: max die + CON

    for (let lvl = 2; lvl <= charLevel; lvl++) {
        hp += Math.floor(hitDie / 2) + 1 + conMod;
    }

    // HP-per-level bonuses (Tough feat, Draconic Resilience)
    effects.forEach(eff => {
        if (eff.active && eff.effect_type === 'hp_per_level') {
            hp += (eff.value || 0) * charLevel;
        }
    });

    return Math.max(1, hp);
}


// ============================================================
// SECTION 5: CHARACTER CREATION ENHANCEMENTS
// ============================================================

function applyRacialBonuses(baseScores, race, halfElfChoices = []) {
    const bonuses = RACIAL_ABILITY_BONUSES[race] || {};
    const result = { ...baseScores };
    Object.entries(bonuses).forEach(([ability, bonus]) => {
        if (result[ability] !== undefined) result[ability] += bonus;
    });
    if (race === 'Half-Elf' && halfElfChoices.length === 2) {
        halfElfChoices.forEach(ability => {
            if (result[ability] !== undefined && ability !== 'charisma') result[ability] += 1;
        });
    }
    return result;
}

function getClassSavingThrows(className) {
    return CLASS_SAVING_THROWS[className] || [];
}

async function applyClassSavingThrows(characterId, className) {
    const proficientSaves = getClassSavingThrows(className);
    if (proficientSaves.length === 0) return;

    const { data: existingSaves } = await db
        .from('saving_throws').select('*').eq('character_id', characterId);

    for (const save of proficientSaves) {
        const existing = existingSaves?.find(s => s.ability === save);
        if (existing) {
            await db.from('saving_throws').update({ proficient: true }).eq('id', existing.id);
        } else {
            await db.from('saving_throws').insert({ character_id: characterId, ability: save, proficient: true });
        }
    }
}

async function applyRacialEffects(characterId, race, baseScores, halfElfChoices = []) {
    const bonuses = RACIAL_ABILITY_BONUSES[race] || {};
    const effects = [];

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

    if (effects.length > 0) {
        await db.from('character_effects').insert(effects);
    }

    const finalScores = applyRacialBonuses(baseScores, race, halfElfChoices);
    await db.from('ability_scores').update({
        strength: finalScores.strength,
        dexterity: finalScores.dexterity,
        constitution: finalScores.constitution,
        intelligence: finalScores.intelligence,
        wisdom: finalScores.wisdom,
        charisma: finalScores.charisma,
    }).eq('character_id', characterId);

    return finalScores;
}

async function enhanceCharacterCreation(characterId, charData, baseScores, halfElfChoices = []) {
    try {
        const finalScores = await applyRacialEffects(characterId, charData.race, baseScores, halfElfChoices);
        await applyClassSavingThrows(characterId, charData.class);

        const raceSpeed = RACIAL_SPEED[charData.race] || 30;
        await db.from('characters').update({ speed: raceSpeed }).eq('id', characterId);

        const conMod = getModifier(finalScores.constitution);
        const hitDie = HIT_DICE[charData.class] || 8;
        const level = charData.level || 1;
        let hp;
        if (level === 1) {
            hp = Math.max(1, hitDie + conMod);
        } else {
            hp = Math.max(1, hitDie + conMod + (level - 1) * (Math.floor(hitDie / 2) + 1 + conMod));
        }

        await db.from('characters').update({
            hit_point_maximum: hp,
            current_hit_points: hp
        }).eq('id', characterId);

        console.log(`[LevelUpEngine] Enhanced character ${characterId}: racial bonuses, saves, speed, HP`);
    } catch (err) {
        console.error('[LevelUpEngine] Error enhancing character:', err);
    }
}


// ============================================================
// SECTION 6: FEATURE EFFECT APPLICATION
// ============================================================

async function applyFeatureEffect(characterId, featureIndex, source = 'class', extraData = {}) {
    const effect = getFeatureEffect(featureIndex);
    if (!effect) return;

    // Handle multi_effect (e.g. Draconic Resilience: HP + AC)
    if (effect.type === 'multi_effect' && effect.effects) {
        for (const subEffect of effect.effects) {
            await applyEffectByType(characterId, featureIndex, subEffect, source, extraData);
        }
        return;
    }

    await applyEffectByType(characterId, featureIndex, effect, source, extraData);
}

async function applyEffectByType(characterId, featureIndex, effect, source, extraData = {}) {
    // Handle feature replacement (e.g., Action Surge 1 → 2)
    if (effect.replaces) {
        await db.from('character_effects')
            .update({ active: false })
            .eq('character_id', characterId)
            .eq('feature_index', effect.replaces);
    }

    switch (effect.type) {
        case 'passive_bonus':
            await db.from('character_effects').insert({
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
            await db.from('character_effects').insert({
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
            if (effect.increases) {
                for (const [ability, amount] of Object.entries(effect.increases)) {
                    await db.from('character_effects').insert({
                        character_id: characterId,
                        feature_index: featureIndex,
                        effect_type: 'ability_increase',
                        target: ability,
                        value: amount,
                        active: true,
                        source
                    });
                }
                // Update actual ability_scores
                const { data: scores } = await db
                    .from('ability_scores').select('*').eq('character_id', characterId).single();
                if (scores) {
                    const updates = {};
                    const cap = effect.max || 20;
                    for (const [ability, amount] of Object.entries(effect.increases)) {
                        updates[ability] = Math.min((scores[ability] || 10) + amount, cap);
                    }
                    await db.from('ability_scores').update(updates).eq('character_id', characterId);
                }
            }
            break;

        case 'ability_score_improvement':
            if (extraData.asiChoices) {
                for (const [ability, amount] of Object.entries(extraData.asiChoices)) {
                    await db.from('character_effects').insert({
                        character_id: characterId,
                        feature_index: featureIndex,
                        effect_type: 'ability_increase',
                        target: ability,
                        value: amount,
                        active: true,
                        source: 'asi'
                    });
                }
                const { data: scores } = await db
                    .from('ability_scores').select('*').eq('character_id', characterId).single();
                if (scores) {
                    const updates = {};
                    for (const [ability, amount] of Object.entries(extraData.asiChoices)) {
                        updates[ability] = Math.min((scores[ability] || 10) + amount, 20);
                    }
                    await db.from('ability_scores').update(updates).eq('character_id', characterId);
                }
            }
            break;

        case 'hp_per_level': {
            // Store as a persistent effect, recalculate HP
            await db.from('character_effects').insert({
                character_id: characterId,
                feature_index: featureIndex,
                effect_type: 'hp_per_level',
                value: effect.value || 0,
                active: true,
                source
            });
            // Retroactive HP update
            if (effect.retroactive) {
                const { data: char } = await db
                    .from('characters').select('level, hit_point_maximum, current_hit_points').eq('id', characterId).single();
                if (char) {
                    const hpGain = (effect.value || 0) * char.level;
                    await db.from('characters').update({
                        hit_point_maximum: char.hit_point_maximum + hpGain,
                        current_hit_points: char.current_hit_points + hpGain
                    }).eq('id', characterId);
                }
            }
            break;
        }

        case 'usable_feature':
            // Update features_traits with usage tracking data
            if (effect.uses) {
                await db.from('features_traits')
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
            break;
    }
}


// ============================================================
// SECTION 7: FEAT EFFECT APPLICATION (with ability choice modal)
// ============================================================

/**
 * Apply a feat's mechanical effects. For feats with ability_choice,
 * shows a picker modal and waits for player selection.
 */
async function applyFeatEffect(characterId, featIndex, source = 'feat') {
    const effect = getFeatEffect(featIndex);
    if (!effect) return;

    switch (effect.type) {
        case 'ability_choice': {
            // Show picker modal for the player to choose which ability to increase
            const chosen = await showFeatAbilityChoice(
                featIndex, effect.choices, effect.pick || 1, effect.bonus || 1
            );
            if (chosen && Object.keys(chosen).length > 0) {
                // Store as ability increases
                for (const [ability, amount] of Object.entries(chosen)) {
                    await db.from('character_effects').insert({
                        character_id: characterId,
                        feature_index: `feat-${featIndex}`,
                        effect_type: 'ability_increase',
                        target: ability,
                        value: amount,
                        active: true,
                        source: 'feat'
                    });
                }
                // Update actual ability scores
                const { data: scores } = await db
                    .from('ability_scores').select('*').eq('character_id', characterId).single();
                if (scores) {
                    const updates = {};
                    for (const [ability, amount] of Object.entries(chosen)) {
                        updates[ability] = Math.min((scores[ability] || 10) + amount, 20);
                    }
                    await db.from('ability_scores').update(updates).eq('character_id', characterId);
                }
            }
            // Also apply any extra effects (e.g. Observant: +5 passive Perception)
            if (effect.extra) {
                await applyEffectByType(characterId, `feat-${featIndex}-extra`, effect.extra, 'feat');
                // For Resilient, the extra grants save proficiency in the chosen ability
                if (effect.extra.type === 'save_proficiency' && chosen) {
                    const chosenAbility = Object.keys(chosen)[0];
                    if (chosenAbility) {
                        const shortKey = chosenAbility.substring(0, 3);
                        await db.from('saving_throws')
                            .upsert({
                                character_id: characterId,
                                ability: shortKey,
                                proficient: true
                            }, { onConflict: 'character_id,ability' });
                    }
                }
            }
            break;
        }

        case 'ability_increase':
            await applyEffectByType(characterId, `feat-${featIndex}`, effect, 'feat');
            // Apply extra effects if present (e.g. Heavy Armor Master damage reduction)
            if (effect.extra) {
                await db.from('character_effects').insert({
                    character_id: characterId,
                    feature_index: `feat-${featIndex}-extra`,
                    effect_type: effect.extra.type || 'info_only',
                    target: effect.extra.target || null,
                    value: effect.extra.value || 0,
                    condition: effect.extra.condition || null,
                    active: true,
                    source: 'feat'
                });
            }
            break;

        case 'passive_bonus':
            await applyEffectByType(characterId, `feat-${featIndex}`, effect, 'feat');
            break;

        case 'hp_per_level':
            await applyEffectByType(characterId, `feat-${featIndex}`, effect, 'feat');
            break;

        case 'usable_feature':
            await db.from('character_effects').insert({
                character_id: characterId,
                feature_index: `feat-${featIndex}`,
                effect_type: 'usable_feature',
                value: effect.uses || 0,
                condition: effect.recharge || 'long',
                active: true,
                source: 'feat'
            });
            break;

        case 'info_only':
            break;
    }
}

/**
 * Show a modal for players to pick which ability gets a feat bonus.
 * Returns a Promise that resolves with { ability: bonus } object.
 */
function showFeatAbilityChoice(featIndex, choices, pickCount, bonusPerPick) {
    return new Promise((resolve) => {
        const selected = new Set();
        const featName = featIndex.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content" style="max-width: 380px;">
                <h2 style="margin-bottom: 4px;">${featName}</h2>
                <p style="color: var(--text-secondary); margin-bottom: 12px;">
                    Choose ${pickCount} ability score${pickCount > 1 ? 's' : ''} to increase by +${bonusPerPick}:
                </p>
                <div id="feat-ability-choices" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
                    ${choices.map(a => `
                        <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--bg-tertiary); border: 2px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer; transition: border-color 0.15s;">
                            <input type="${pickCount === 1 ? 'radio' : 'checkbox'}" name="feat-ability" value="${a}" class="feat-ability-input">
                            <span style="text-transform: capitalize; font-weight: 500;">${a}</span>
                            <span style="margin-left: auto; color: var(--text-tertiary); font-size: 13px;">+${bonusPerPick}</span>
                        </label>
                    `).join('')}
                </div>
                <div class="modal-actions" style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="feat-ability-confirm" class="btn-primary" disabled>Confirm</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        const inputs = modal.querySelectorAll('.feat-ability-input');
        const confirmBtn = modal.querySelector('#feat-ability-confirm');

        inputs.forEach(inp => {
            inp.addEventListener('change', () => {
                if (pickCount === 1) {
                    // Radio: only one selected
                    selected.clear();
                    selected.add(inp.value);
                } else {
                    if (inp.checked) selected.add(inp.value);
                    else selected.delete(inp.value);
                    // Enforce max picks
                    if (selected.size >= pickCount) {
                        inputs.forEach(i => { if (!i.checked) i.disabled = true; });
                    } else {
                        inputs.forEach(i => i.disabled = false);
                    }
                }
                confirmBtn.disabled = selected.size !== pickCount;

                // Highlight selected
                inputs.forEach(i => {
                    i.closest('label').style.borderColor =
                        i.checked ? 'var(--accent-primary)' : 'var(--border-subtle)';
                });
            });
        });

        confirmBtn.addEventListener('click', () => {
            modal.remove();
            const result = {};
            selected.forEach(ability => { result[ability] = bonusPerPick; });
            resolve(result);
        });
    });
}


// ============================================================
// SECTION 8: RECALCULATE CHARACTER STATS
// ============================================================

async function recalculateCharacterStats(characterId) {
    const { data: char } = await db
        .from('characters').select('*').eq('id', characterId).single();
    if (!char) return;

    const { data: scores } = await db
        .from('ability_scores').select('*').eq('character_id', characterId).single();
    if (!scores) return;

    const { data: effects } = await db
        .from('character_effects').select('*').eq('character_id', characterId).eq('active', true);

    const { data: inventory } = await db
        .from('inventory_items').select('*').eq('character_id', characterId).eq('equipped', true);

    // Determine equipment state
    const equipment = {
        hasArmor: false, hasShield: false, hasHeavyArmor: false,
        armorBaseAC: 10, armorType: null
    };

    if (inventory) {
        inventory.forEach(item => {
            const nameL = (item.name || '').toLowerCase();
            if (nameL.includes('shield')) {
                equipment.hasShield = true;
            } else if (item.item_type === 'Armor' || nameL.includes('armor') || nameL.includes('mail') ||
                       nameL.includes('hide') || nameL.includes('leather') || nameL.includes('breastplate') || nameL.includes('plate')) {
                equipment.hasArmor = true;
                if (nameL.includes('padded') || nameL.includes('leather') || nameL.includes('studded')) {
                    equipment.armorType = 'light';
                } else if (nameL.includes('hide') || nameL.includes('chain shirt') || nameL.includes('scale') ||
                           nameL.includes('breastplate') || nameL.includes('half plate')) {
                    equipment.armorType = 'medium';
                } else {
                    equipment.armorType = 'heavy';
                    equipment.hasHeavyArmor = true;
                }
            }
        });
    }

    const profBonus = Math.ceil(char.level / 4) + 1;
    const newAC = calculateAC(scores, effects || [], equipment);
    const newSpeed = calculateSpeed(char.race, effects || [], equipment);
    const newInitiative = calculateInitiative(scores, effects || [], profBonus);

    // Calculate passive perception
    const wisMod = getModifier(scores.wisdom);
    let passivePerception = 10 + wisMod;
    // Check for Observant feat (+5)
    (effects || []).forEach(eff => {
        if (eff.active && eff.effect_type === 'passive_bonus' && eff.target === 'passive_perception') {
            passivePerception += (eff.value || 0);
        }
    });

    const updates = {
        speed: newSpeed,
        initiative_bonus: newInitiative,
        proficiency_bonus: profBonus,
        armor_class: newAC,
        passive_perception: passivePerception,
    };

    await db.from('characters').update(updates).eq('id', characterId);

    return { ac: newAC, speed: newSpeed, initiative: newInitiative, proficiency: profBonus, passivePerception };
}


// ============================================================
// SECTION 9: LEVEL-UP COMPLETION HOOK
// ============================================================

async function enhanceLevelUpCompletion(characterId, newFeatures = [], asiChoices = null, featChosen = null) {
    try {
        // 1. Apply effects for each new feature
        for (const feature of newFeatures) {
            const apiIndex = feature.apiIndex || feature.api_index;
            if (apiIndex) {
                await applyFeatureEffect(characterId, apiIndex, feature.source || 'class');
            }
        }

        // 2. Apply ASI choices
        if (asiChoices && Object.keys(asiChoices).length > 0) {
            const { data: char } = await db
                .from('characters').select('class, level').eq('id', characterId).single();
            if (char) {
                const cls = char.class.toLowerCase();
                const registry = window.FeatureRegistry ? window.FeatureRegistry.FEATURE_EFFECTS : {};
                const asiFeatures = Object.keys(registry).filter(k =>
                    k.startsWith(`${cls}-ability-score-improvement-`)
                );
                const { data: usedEffects } = await db
                    .from('character_effects').select('feature_index')
                    .eq('character_id', characterId)
                    .like('feature_index', `${cls}-ability-score-improvement-%`);
                const usedIndices = new Set((usedEffects || []).map(e => e.feature_index));
                const nextAsi = asiFeatures.find(f => !usedIndices.has(f));
                if (nextAsi) {
                    await applyEffectByType(characterId, nextAsi,
                        { type: 'ability_score_improvement' }, 'asi', { asiChoices });
                }
            }
        }

        // 3. Apply feat effects (with ability choice modal if needed)
        if (featChosen) {
            await applyFeatEffect(characterId, featChosen, 'feat');
        }

        // 4. Recalculate all derived stats
        await recalculateCharacterStats(characterId);

        console.log(`[LevelUpEngine] Level-up effects applied for ${characterId}`);
    } catch (err) {
        console.error('[LevelUpEngine] Error applying level-up effects:', err);
    }
}


// ============================================================
// SECTION 10: UTILITY & DISPLAY HELPERS
// ============================================================

async function getActiveEffectsSummary(characterId) {
    const { data: effects } = await db
        .from('character_effects').select('*').eq('character_id', characterId).eq('active', true);

    if (!effects || effects.length === 0) return [];

    return effects.map(eff => {
        const registry = getFeatureEffect(eff.feature_index) || getFeatEffect(eff.feature_index);
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

function getRacialBonusDisplay(race) {
    const bonuses = RACIAL_ABILITY_BONUSES[race];
    if (!bonuses) return 'No racial bonuses defined';
    const parts = Object.entries(bonuses).map(([ability, bonus]) =>
        `+${bonus} ${ability.charAt(0).toUpperCase() + ability.slice(1, 3).toUpperCase()}`
    );
    let text = parts.join(', ');
    if (race === 'Half-Elf') text += ' + choose 2 others for +1';
    return text;
}


// ============================================================
// SECTION 11: HALF-ELF ABILITY CHOICE UI
// ============================================================

function showHalfElfAbilityChoice() {
    return new Promise((resolve) => {
        const abilities = ['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom'];
        const selected = new Set();

        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.innerHTML = `
            <div class="modal-backdrop"></div>
            <div class="modal-content" style="max-width: 380px;">
                <h2>Half-Elf Ability Bonuses</h2>
                <p style="color: var(--text-secondary);">Choose 2 abilities to increase by +1 (in addition to +2 CHA):</p>
                <div id="half-elf-choices" style="display: flex; flex-direction: column; gap: 6px; margin-bottom: 12px;">
                    ${abilities.map(a => `
                        <label style="display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--bg-tertiary); border: 2px solid var(--border-subtle); border-radius: var(--radius-md); cursor: pointer; transition: border-color 0.15s;">
                            <input type="checkbox" value="${a}" class="half-elf-check">
                            <span style="text-transform: capitalize; font-weight: 500;">${a}</span>
                            <span style="margin-left: auto; color: var(--text-tertiary); font-size: 13px;">+1</span>
                        </label>
                    `).join('')}
                </div>
                <p id="half-elf-count" style="text-align: center; color: var(--text-tertiary); margin-bottom: 12px;">Selected: 0 / 2</p>
                <div class="modal-actions" style="display: flex; gap: 8px; justify-content: flex-end;">
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
                if (cb.checked) selected.add(cb.value);
                else selected.delete(cb.value);
                if (selected.size >= 2) {
                    checkboxes.forEach(c => { if (!c.checked) c.disabled = true; });
                } else {
                    checkboxes.forEach(c => c.disabled = false);
                }
                countText.textContent = `Selected: ${selected.size} / 2`;
                confirmBtn.disabled = selected.size !== 2;
                checkboxes.forEach(c => {
                    c.closest('label').style.borderColor = c.checked ? 'var(--accent-primary)' : 'var(--border-subtle)';
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
// SECTION 12: RACIAL BONUS PREVIEW IN CREATE FORM
// ============================================================

function initRacialBonusPreview() {
    const raceSelect = document.getElementById('char-race');
    if (!raceSelect) return;

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
// SECTION 13: EXPORT / GLOBAL REGISTRATION
// ============================================================

window.LevelUpEngine = {
    // Constants
    RACIAL_ABILITY_BONUSES,
    RACIAL_SPEED,
    CLASS_SAVING_THROWS,

    // Registry access (forwarded from FeatureRegistry)
    get FEATURE_EFFECTS() {
        return window.FeatureRegistry ? window.FeatureRegistry.FEATURE_EFFECTS : {};
    },
    get FEAT_EFFECTS() {
        return window.FeatureRegistry ? window.FeatureRegistry.FEAT_EFFECTS : {};
    },
    get FIGHTING_STYLE_EFFECTS() {
        return window.FeatureRegistry ? window.FeatureRegistry.FIGHTING_STYLE_EFFECTS : {};
    },
    get FIGHTING_STYLE_OPTIONS() {
        return window.FeatureRegistry ? window.FeatureRegistry.FIGHTING_STYLE_OPTIONS : {};
    },
    get CLASS_RESOURCES() {
        return window.FeatureRegistry ? window.FeatureRegistry.CLASS_RESOURCES : {};
    },

    // Calculation functions
    calculateFinalAbilityScores,
    calculateAC,
    calculateSpeed,
    calculateInitiative,
    calculateMaxHP,
    applyRacialBonuses,
    getClassSavingThrows,

    // Database operations
    applyClassSavingThrows,
    applyRacialEffects,
    applyFeatureEffect,
    applyFeatEffect,
    recalculateCharacterStats,

    // High-level hooks
    enhanceCharacterCreation,
    enhanceLevelUpCompletion,

    // UI helpers
    getActiveEffectsSummary,
    getRacialBonusDisplay,
    showHalfElfAbilityChoice,
    showFeatAbilityChoice,
    initRacialBonusPreview,
};

console.log('[LevelUpEngine] Module loaded. Available at window.LevelUpEngine');
