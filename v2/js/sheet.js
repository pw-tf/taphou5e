// ========================================
// TAPHOU5E v2 — character sheet
//
// Play from one screen: HP and combat first, then abilities, skills, actions.
//
// Write semantics deliberately mirror v1 (app.js): HP clamps to [0, max],
// updates are optimistic then persisted, and temporary hit points are stored
// alongside rather than absorbing damage first. Matching v1 matters more than
// matching the rulebook here -- both versions write the same columns, and a
// divergence would show up as the two disagreeing about a character's state.
// ========================================

(function () {
    if (!requireSession()) return;

    const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled',
        'Incapacitated', 'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone',
        'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];

    const ABILITIES = [
        { key: 'strength',     code: 'str', label: 'STR' },
        { key: 'dexterity',    code: 'dex', label: 'DEX' },
        { key: 'constitution', code: 'con', label: 'CON' },
        { key: 'intelligence', code: 'int', label: 'INT' },
        { key: 'wisdom',       code: 'wis', label: 'WIS' },
        { key: 'charisma',     code: 'cha', label: 'CHA' }
    ];

    // Which ability drives each skill. Matches the 18 skill_name values already
    // stored per character.
    const SKILL_ABILITY = {
        'Acrobatics': 'dex', 'Animal Handling': 'wis', 'Arcana': 'int', 'Athletics': 'str',
        'Deception': 'cha', 'History': 'int', 'Insight': 'wis', 'Intimidation': 'cha',
        'Investigation': 'int', 'Medicine': 'wis', 'Nature': 'int', 'Perception': 'wis',
        'Performance': 'cha', 'Persuasion': 'cha', 'Religion': 'int', 'Sleight of Hand': 'dex',
        'Stealth': 'dex', 'Survival': 'wis'
    };

    const TABS = [
        { id: 'stats',     label: 'Stats',     icon: 'overview' },
        { id: 'skills',    label: 'Skills',    icon: 'user' },
        { id: 'actions',   label: 'Actions',   icon: 'sword' },
        { id: 'spells',    label: 'Spells',    icon: 'star' },
        { id: 'inventory', label: 'Inventory', icon: 'bag' },
        { id: 'notes',     label: 'Notes',     icon: 'book' }
    ];

    const characterId = new URLSearchParams(window.location.search).get('id');
    let c = null;              // the character, with its related rows
    let activeTab = 'stats';
    let detail = null;         // { title, body } shown in the pane / bottom sheet

    // ========================================
    // Derived values
    // ========================================

    const scores = () => c.ability_scores || {};
    const mod = key => abilityMod(scores()[key]);
    const prof = () => c.proficiency_bonus || 2;

    function saveBonus(code) {
        const ability = ABILITIES.find(a => a.code === code);
        const row = (c.saving_throws || []).find(s => s.ability === code);
        return mod(ability.key) + (row && row.proficient ? prof() : 0);
    }

    function skillBonus(skill) {
        const code = SKILL_ABILITY[skill.skill_name] || 'dex';
        const ability = ABILITIES.find(a => a.code === code);
        let bonus = mod(ability.key);
        if (skill.proficient) bonus += prof();
        if (skill.expertise) bonus += prof();
        return bonus;
    }

    const passivePerception = () => {
        const perception = (c.skills || []).find(s => s.skill_name === 'Perception');
        return 10 + (perception ? skillBonus(perception) : mod('wisdom'));
    };

    // ========================================
    // Persistence
    // ========================================

    async function patchCharacter(updates) {
        Object.assign(c, updates);          // optimistic, as v1 does
        draw();
        const { error } = await db.from('characters').update(updates).eq('id', c.id);
        if (error) {
            console.error('Update failed:', error);
            toast('Could not save that change.', 'error');
        }
    }

    function setHP(next) {
        const clamped = Math.max(0, Math.min(c.hit_point_maximum || 0, next));
        return patchCharacter({ current_hit_points: clamped });
    }

    function amountField() {
        const input = $('#hp-amount');
        const value = parseInt(input && input.value, 10);
        return Number.isFinite(value) ? value : 0;
    }

    window.sheetDamage = () => {
        const amount = Math.abs(amountField()) || 1;
        setHP((c.current_hit_points || 0) - amount);
    };
    window.sheetHeal = () => {
        const amount = Math.abs(amountField()) || 1;
        setHP((c.current_hit_points || 0) + amount);
    };
    // A signed value typed into the field, matching v1's applyHPDelta.
    window.sheetApply = () => {
        const delta = amountField();
        if (!delta) return;
        setHP((c.current_hit_points || 0) + delta);
    };

    window.sheetTempHP = value => {
        patchCharacter({ temporary_hit_points: Math.max(0, parseInt(value, 10) || 0) });
    };

    window.sheetDeathSave = (type, index) => {
        const field = type === 'success' ? 'death_save_successes' : 'death_save_failures';
        const current = c[field] || 0;
        patchCharacter({ [field]: current >= index ? index - 1 : index });
    };

    window.sheetToggleCondition = condition => {
        const active = Array.isArray(c.active_conditions) ? c.active_conditions.slice() : [];
        const at = active.indexOf(condition);
        if (at === -1) active.push(condition);
        else active.splice(at, 1);
        patchCharacter({ active_conditions: active });
    };

    window.sheetToggleSkill = async id => {
        const skill = (c.skills || []).find(s => s.id === id);
        if (!skill) return;
        skill.proficient = !skill.proficient;
        if (!skill.proficient) skill.expertise = false;
        draw();
        const { error } = await db.from('skills')
            .update({ proficient: skill.proficient, expertise: skill.expertise })
            .eq('id', id);
        if (error) toast('Could not save that change.', 'error');
    };

    window.sheetToggleSave = async id => {
        const row = (c.saving_throws || []).find(s => s.id === id);
        if (!row) return;
        row.proficient = !row.proficient;
        draw();
        const { error } = await db.from('saving_throws').update({ proficient: row.proficient }).eq('id', id);
        if (error) toast('Could not save that change.', 'error');
    };

    // Rests mirror v1: a short rest resets short-rest features, a long rest
    // restores HP, clears temp HP and death saves, returns half the hit dice,
    // and resets every limited feature and spell slot.
    window.sheetShortRest = async () => {
        const features = (c.features_traits || []).filter(f =>
            f.uses_per_rest === 'short' || f.uses_per_rest === 'short_or_long');
        features.forEach(f => { f.uses_remaining = f.uses_total || 1; });
        draw();
        for (const f of features) {
            await db.from('features_traits').update({ uses_remaining: f.uses_total || 1 }).eq('id', f.id);
        }
        toast('Short rest taken.');
    };

    window.sheetLongRest = async () => {
        const total = c.level || 1;
        const regained = Math.max(1, Math.floor(total / 2));
        const updates = {
            current_hit_points: c.hit_point_maximum,
            temporary_hit_points: 0,
            death_save_successes: 0,
            death_save_failures: 0,
            hit_dice_remaining: Math.min(total, (c.hit_dice_remaining || 0) + regained)
        };
        const features = (c.features_traits || []).filter(f => f.uses_per_rest);
        const slots = c.spell_slots || [];
        features.forEach(f => { f.uses_remaining = f.uses_total || 1; });
        slots.forEach(s => { s.used = 0; });

        Object.assign(c, updates);
        draw();

        await db.from('characters').update(updates).eq('id', c.id);
        for (const f of features) {
            await db.from('features_traits').update({ uses_remaining: f.uses_total || 1 }).eq('id', f.id);
        }
        for (const s of slots) {
            await db.from('spell_slots').update({ used: 0 }).eq('id', s.id);
        }
        toast('Long rest taken.');
    };

    // ========================================
    // Writing to the sheet
    //
    // The sheet was read-only everywhere except hit points, conditions,
    // proficiency toggles and rests, which meant a player had to open the
    // classic version to add a spell they had just learned. These close that.
    //
    // Each write follows the same shape as the HP handlers already here:
    // change the local copy, redraw, then persist. A failed write says so and
    // reloads, rather than leaving the screen disagreeing with the database.
    // ========================================

    // ---- SRD damage for carried weapons -----------------------------------

    // inventory_items stores a name and nothing else about how a weapon hits,
    // so the numbers come from the SRD, keyed by lower-cased name. Resolved
    // once per page load; a name the SRD does not know is remembered as empty
    // so it is not looked up again on every redraw.
    var srdWeaponCache = {};
    var srdWeaponPending = false;

    async function fillCarriedWeaponStats() {
        if (srdWeaponPending) return;

        const wanted = (c.inventory_items || [])
            .filter(i => i.item_type === 'Weapon' && i.equipped)
            .map(i => i.name)
            .filter(name => srdWeaponCache[name.toLowerCase()] === undefined);

        if (!wanted.length) return;
        srdWeaponPending = true;

        try {
            const index = await srdIndex('equipment');
            for (const name of wanted) {
                const key = name.toLowerCase();
                const match = index.find(e => e.name.toLowerCase() === key);
                if (!match) { srdWeaponCache[key] = {}; continue; }
                try {
                    const detail = await srdDetail('equipment', match.index);
                    const damage = detail.damage || {};
                    srdWeaponCache[key] = {
                        damage: damage.damage_dice || null,
                        damage_type: (damage.damage_type || {}).name || null
                    };
                } catch (err) {
                    srdWeaponCache[key] = {};
                }
            }
        } catch (err) {
            // Offline, or the SRD is down. The rows still list; they just
            // carry no damage, which is what they did before this existed.
            wanted.forEach(name => { srdWeaponCache[name.toLowerCase()] = {}; });
        }

        srdWeaponPending = false;
        if (activeTab === 'actions') draw();
    }

    async function persist(promise, failure) {
        const { error } = await promise;
        if (error) {
            console.error(failure, error);
            toast(failure, 'error');
            await reload();
            return false;
        }
        return true;
    }

    // One insert path for every child table: push the returned row into the
    // local copy so the redraw shows it without a full reload.
    async function addRow(table, payload, listKey) {
        const { data, error } = await db.from(table).insert({
            character_id: c.id, ...payload
        }).select().single();

        if (error || !data) {
            console.error(`Could not add to ${table}:`, error);
            toast('Could not save that. Check your connection and try again.', 'error');
            return;
        }
        c[listKey] = (c[listKey] || []).concat(data);
        draw();
    }

    async function removeRow(table, id, listKey) {
        const before = c[listKey] || [];
        c[listKey] = before.filter(row => row.id !== id);
        detail = null;
        draw();
        await persist(db.from(table).delete().eq('id', id), 'Could not delete that.');
    }

    // ---- Spells ----------------------------------------------------------

    window.sheetAddSpell = () => {
        openSrdForm({
            title: 'Add a spell',
            which: 'spells',
            toValues: spell => ({
                name: spell.name,
                level: spell.level ?? 0,
                school: (spell.school || {}).name || '',
                casting_time: spell.casting_time || '',
                range: spell.range || '',
                components: (spell.components || []).join(', '),
                duration: spell.duration || '',
                description: srdText(spell.desc),
                api_index: spell.index || ''
            }),
            fields: [
                { name: 'name', label: 'Name', required: true },
                { name: 'level', label: 'Level', type: 'number', value: 0,
                  hint: '0 is a cantrip.' },
                { name: 'school', label: 'School' },
                { name: 'casting_time', label: 'Casting time', placeholder: '1 action' },
                { name: 'range', label: 'Range', placeholder: '120 feet' },
                { name: 'components', label: 'Components', placeholder: 'V, S, M' },
                { name: 'duration', label: 'Duration', placeholder: 'Instantaneous' },
                { name: 'description', label: 'Description', type: 'textarea', rows: 4 },
                { name: 'api_index', label: '', type: 'hidden' },
                { name: 'prepared', type: 'checkbox', label: '',
                  checkboxLabel: 'Prepared', value: false }
            ],
            onSubmit: async values => {
                const level = Number(values.level);
                if (!Number.isInteger(level) || level < 0 || level > 9) {
                    throw new Error('Spell level must be between 0 and 9.');
                }
                await addRow('spells', {
                    name: values.name, level,
                    school: values.school || null,
                    casting_time: values.casting_time || null,
                    range: values.range || null,
                    components: values.components || null,
                    duration: values.duration || null,
                    description: values.description || null,
                    api_index: values.api_index || null,
                    prepared: values.prepared
                }, 'spells');
            }
        });
    };

    window.sheetTogglePrepared = async id => {
        const spell = (c.spells || []).find(sp => sp.id === id);
        if (!spell) return;
        spell.prepared = !spell.prepared;
        draw();
        await persist(db.from('spells').update({ prepared: spell.prepared }).eq('id', id),
                      'Could not change that spell.');
    };

    // ---- Spell slots -----------------------------------------------------

    // Tap to spend, hold to give back. Spending is the common action during a
    // session, so it is the one that costs a single tap.
    window.sheetUseSlot = async (id, restore) => {
        const slot = (c.spell_slots || []).find(sl => sl.id === id);
        if (!slot) return;

        const used = restore ? Math.max(0, (slot.used || 0) - 1)
                             : Math.min(slot.total || 0, (slot.used || 0) + 1);
        if (used === slot.used) {
            toast(restore ? `No level ${slot.slot_level} slots to restore.`
                          : `No level ${slot.slot_level} slots left.`);
            return;
        }
        slot.used = used;
        draw();
        await persist(db.from('spell_slots').update({ used }).eq('id', id),
                      'Could not update that slot.');
    };

    // ---- Weapons ---------------------------------------------------------

    window.sheetAddWeapon = () => {
        openSrdForm({
            title: 'Add a weapon',
            which: 'equipment',
            toValues: item => {
                const damage = item.damage || {};
                return {
                    name: item.name,
                    damage: (damage.damage_dice) || '',
                    damage_type: (damage.damage_type || {}).name || '',
                    properties: (item.properties || []).map(pr => pr.name).join(', ')
                };
            },
            fields: [
                { name: 'name', label: 'Name', required: true },
                { name: 'attack_bonus', label: 'Attack bonus', type: 'number', value: 0 },
                { name: 'damage', label: 'Damage', placeholder: '1d8+3' },
                { name: 'damage_type', label: 'Damage type', placeholder: 'Slashing' },
                { name: 'properties', label: 'Properties', placeholder: 'Versatile, Finesse' },
                { name: 'equipped', type: 'checkbox', label: '',
                  checkboxLabel: 'Equipped', value: true }
            ],
            onSubmit: async values => {
                await addRow('weapons', {
                    name: values.name,
                    attack_bonus: values.attack_bonus ?? 0,
                    damage: values.damage || null,
                    damage_type: values.damage_type || null,
                    properties: values.properties || null,
                    equipped: values.equipped
                }, 'weapons');
            }
        });
    };

    window.sheetToggleWeaponEquipped = async id => {
        const weapon = (c.weapons || []).find(w => w.id === id);
        if (!weapon) return;
        weapon.equipped = !weapon.equipped;
        draw();
        await persist(db.from('weapons').update({ equipped: weapon.equipped }).eq('id', id),
                      'Could not update that weapon.');
    };

    // ---- Inventory -------------------------------------------------------

    const ITEM_TYPES = ['Gear', 'Weapon', 'Armor', 'Consumable', 'Treasure', 'Other'];

    window.sheetAddItem = () => {
        openSrdForm({
            title: 'Add an item',
            which: 'equipment',
            toValues: item => ({
                name: item.name,
                weight: item.weight ?? null,
                item_type: ITEM_TYPES.find(t =>
                    t.toLowerCase() === ((item.equipment_category || {}).name || '').toLowerCase()) || 'Gear',
                description: srdText(item.desc)
            }),
            fields: [
                { name: 'name', label: 'Name', required: true },
                { name: 'quantity', label: 'Quantity', type: 'number', value: 1 },
                { name: 'item_type', label: 'Type', type: 'select', value: 'Gear',
                  options: ITEM_TYPES.map(t => ({ value: t, label: t })) },
                { name: 'weight', label: 'Weight (lb)', type: 'number' },
                { name: 'description', label: 'Description', type: 'textarea', rows: 3 },
                { name: 'equipped', type: 'checkbox', label: '', checkboxLabel: 'Equipped', value: false },
                { name: 'attuned', type: 'checkbox', label: '', checkboxLabel: 'Attuned', value: false }
            ],
            onSubmit: async values => {
                const quantity = Number(values.quantity);
                if (!Number.isInteger(quantity) || quantity < 1) {
                    throw new Error('Quantity must be at least 1.');
                }
                await addRow('inventory_items', {
                    name: values.name, quantity,
                    item_type: values.item_type || 'Gear',
                    weight: values.weight,
                    description: values.description || null,
                    equipped: values.equipped,
                    attuned: values.attuned
                }, 'inventory_items');
            }
        });
    };

    window.sheetItemQuantity = async (id, delta) => {
        const item = (c.inventory_items || []).find(i => i.id === id);
        if (!item) return;
        const quantity = Math.max(0, (item.quantity ?? 1) + delta);
        // Dropping the last one removes the row: an item with a quantity of
        // zero is clutter nobody wants to tidy up by hand.
        if (quantity === 0) {
            await removeRow('inventory_items', id, 'inventory_items');
            return;
        }
        item.quantity = quantity;
        draw();
        await persist(db.from('inventory_items').update({ quantity }).eq('id', id),
                      'Could not update that item.');
    };

    window.sheetToggleItemFlag = async (id, field) => {
        const item = (c.inventory_items || []).find(i => i.id === id);
        if (!item) return;
        item[field] = !item[field];
        draw();
        await persist(db.from('inventory_items').update({ [field]: item[field] }).eq('id', id),
                      'Could not update that item.');
    };

    // ---- Features --------------------------------------------------------

    window.sheetAddFeature = () => {
        openSrdForm({
            title: 'Add a feature or trait',
            which: 'features',
            toValues: feature => ({
                name: feature.name,
                description: srdText(feature.desc),
                source: (feature.class || {}).name
                    ? `${feature.class.name} Level ${feature.level || ''}`.trim()
                    : ''
            }),
            fields: [
                { name: 'name', label: 'Name', required: true },
                { name: 'source', label: 'Source', placeholder: 'Fighter Level 3, Elf, a feat…' },
                { name: 'description', label: 'Description', type: 'textarea', rows: 4 },
                { name: 'uses_total', label: 'Uses', type: 'number',
                  hint: 'Leave blank for a feature with no limited uses.' },
                { name: 'uses_per_rest', label: 'Recharges on', type: 'select', value: '',
                  options: [
                      { value: '', label: '— never —' },
                      { value: 'short', label: 'A short rest' },
                      { value: 'short_or_long', label: 'A short or long rest' },
                      { value: 'long', label: 'A long rest' }
                  ] },
                { name: 'is_bonus_action', type: 'checkbox', label: '',
                  checkboxLabel: 'Used as a bonus action', value: false }
            ],
            onSubmit: async values => {
                const total = values.uses_total;
                if (total !== null && (!Number.isInteger(total) || total < 1)) {
                    throw new Error('Uses must be a whole number of at least 1, or blank.');
                }
                await addRow('features_traits', {
                    name: values.name,
                    source: values.source || null,
                    description: values.description || null,
                    uses_total: total,
                    uses_remaining: total,
                    uses_per_rest: values.uses_per_rest || null,
                    is_bonus_action: values.is_bonus_action
                }, 'features_traits');
            }
        });
    };

    window.sheetUseFeature = async (id, restore) => {
        const feature = (c.features_traits || []).find(f => f.id === id);
        if (!feature || !feature.uses_total) return;

        const remaining = restore
            ? Math.min(feature.uses_total, (feature.uses_remaining ?? 0) + 1)
            : Math.max(0, (feature.uses_remaining ?? 0) - 1);
        if (remaining === feature.uses_remaining) {
            toast(restore ? `${feature.name} is already full.` : `No uses of ${feature.name} left.`);
            return;
        }
        feature.uses_remaining = remaining;
        draw();
        await persist(db.from('features_traits').update({ uses_remaining: remaining }).eq('id', id),
                      'Could not update that feature.');
    };

    // ---- Currency --------------------------------------------------------

    const COINS = [
        ['platinum', 'Platinum'], ['gold', 'Gold'], ['electrum', 'Electrum'],
        ['silver', 'Silver'], ['copper', 'Copper']
    ];

    window.sheetEditCurrency = () => {
        const money = c.currency || {};
        openModal({
            title: 'Currency',
            submitLabel: 'Save',
            fields: COINS.map(([key, label]) => ({
                name: key, label, type: 'number', value: money[key] ?? 0
            })),
            onSubmit: async values => {
                const purse = {};
                for (const [key, label] of COINS) {
                    const amount = values[key] ?? 0;
                    if (!Number.isInteger(amount) || amount < 0) {
                        throw new Error(`${label} must be zero or more.`);
                    }
                    purse[key] = amount;
                }
                Object.assign(c.currency = c.currency || {}, purse);
                draw();
                await persist(db.from('currency').update(purse).eq('character_id', c.id),
                              'Could not save your currency.');
            }
        });
    };

    window.sheetTab = id => { activeTab = id; detail = null; draw(); };
    window.sheetShowDetail = (kind, id) => { detail = buildDetail(kind, id); draw(); };
    window.sheetCloseDetail = () => { detail = null; draw(); };

    // ========================================
    // Tab bodies
    // ========================================

    function statsTab() {
        const abilities = ABILITIES.map(a => {
            const row = (c.saving_throws || []).find(s => s.ability === a.code);
            const isProf = !!(row && row.proficient);
            return `
                <div class="ability-box">
                    <div class="label mono">${a.label}</div>
                    <div class="score">${scores()[a.key] ?? 10}</div>
                    <div class="mod">${formatMod(mod(a.key))}</div>
                    <div class="save${isProf ? ' is-prof' : ''}"
                         ${row ? `onclick="sheetToggleSave('${row.id}')" role="button" tabindex="0"` : ''}
                         title="Saving throw${row ? ' — tap to toggle proficiency' : ''}">
                        S ${formatMod(saveBonus(a.code))}
                    </div>
                </div>`;
        }).join('');

        const active = Array.isArray(c.active_conditions) ? c.active_conditions : [];
        const conditions = CONDITIONS.map(name => `
            <button class="condition-tag${active.includes(name) ? ' active' : ''}"
                    onclick="sheetToggleCondition('${name}')">${name}</button>`).join('');

        const down = (c.current_hit_points || 0) <= 0;
        const deathSaves = !down ? '' : `
            <div class="section-head"><span class="eyebrow">Death saves</span><span class="rule"></span></div>
            <div class="death-saves">
                <div class="death-row">
                    <span class="label">Successes</span>
                    ${[1, 2, 3].map(i => `<button class="death-dot success${(c.death_save_successes || 0) >= i ? ' filled' : ''}"
                        onclick="sheetDeathSave('success', ${i})" aria-label="Success ${i}"></button>`).join('')}
                </div>
                <div class="death-row">
                    <span class="label">Failures</span>
                    ${[1, 2, 3].map(i => `<button class="death-dot failure${(c.death_save_failures || 0) >= i ? ' filled' : ''}"
                        onclick="sheetDeathSave('failure', ${i})" aria-label="Failure ${i}"></button>`).join('')}
                </div>
            </div>`;

        return `
            ${deathSaves}
            <div class="section-head"><span class="eyebrow">Abilities &amp; saves</span><span class="rule"></span></div>
            <div class="ability-grid">${abilities}</div>

            <div class="section-head"><span class="eyebrow">Temporary HP</span><span class="rule"></span></div>
            <div class="temp-row">
                <input type="number" min="0" class="temp-input mono" value="${c.temporary_hit_points || 0}"
                       onchange="sheetTempHP(this.value)" aria-label="Temporary hit points">
                <span class="hint">Stored alongside current HP, as in the classic version.</span>
            </div>

            <div class="section-head"><span class="eyebrow">Conditions</span><span class="rule"></span></div>
            <div class="conditions-grid">${conditions}</div>

            <div class="section-head rest-head"><span class="eyebrow">Rest</span><span class="rule"></span></div>
            <div class="rest-row">
                <button class="btn btn-rest short" onclick="sheetShortRest()">Short rest</button>
                <button class="btn btn-rest long" onclick="sheetLongRest()">Long rest</button>
                <div class="chip">${c.hit_dice_remaining ?? 0}<span>HD ${escapeHtml(c.hit_dice_total || '')}</span></div>
            </div>`;
    }

    function skillsTab() {
        const rows = (c.skills || [])
            .slice()
            .sort((a, b) => a.skill_name.localeCompare(b.skill_name))
            .map(s => `
                <div class="skill-row${s.proficient ? ' proficient' : ''}"
                     onclick="sheetToggleSkill('${s.id}')" role="button" tabindex="0">
                    <span class="skill-dot"></span>
                    <span class="skill-name">${escapeHtml(s.skill_name)}</span>
                    <span class="skill-ability">${(SKILL_ABILITY[s.skill_name] || '').toUpperCase()}</span>
                    <span class="skill-mod mono">${formatMod(skillBonus(s))}</span>
                </div>`).join('');

        return `
            <div class="section-head"><span class="eyebrow">Skills</span><span class="rule"></span></div>
            <div class="skills-grid">${rows || '<p class="hint">No skills recorded.</p>'}</div>`;
    }

    function listTab(kind, items, emptyText, renderRow, addCall) {
        if (!items.length) {
            return `<div class="empty-state">
                        <p>${escapeHtml(emptyText)}</p>
                        ${addCall ? `<button class="btn btn-accent" onclick="${addCall}">Add one</button>` : ''}
                    </div>`;
        }
        return `<div class="stack holdable">${items.map(renderRow).join('')}</div>`;
    }

    // Every list on the sheet gets the same header: what it is, and the one
    // button that adds to it.
    function sectionHead(label, addCall) {
        return `
            <div class="section-head">
                <span class="eyebrow">${escapeHtml(label)}</span>
                <span class="rule"></span>
                ${addCall ? `<button class="btn btn-quiet btn-tiny" onclick="${addCall}">Add</button>` : ''}
            </div>`;
    }

    // What you can attack with comes from two tables. `weapons` is the weapon
    // list proper and is always shown, equipped sorted to the top. An
    // inventory item typed Weapon is something being carried, and only counts
    // as an action while it is equipped -- pick a dagger up, equip it, and it
    // is there to swing.
    //
    // inventory_items has no damage columns, so an inventory weapon's numbers
    // are looked up from the SRD by name. srdWeaponStats fills them in after
    // the fact; until then the row shows without them rather than waiting.
    function attackList() {
        const owned = (c.weapons || []).map(w => ({
            id: w.id, kind: 'weapon', name: w.name, equipped: !!w.equipped,
            damage: w.damage, damage_type: w.damage_type,
            attack_bonus: w.attack_bonus || 0, fromInventory: false
        }));

        const carried = (c.inventory_items || [])
            .filter(i => i.item_type === 'Weapon' && i.equipped)
            .map(i => {
                const stats = srdWeaponCache[i.name.toLowerCase()] || {};
                return {
                    id: i.id, kind: 'item', name: i.name, equipped: true,
                    damage: stats.damage || null, damage_type: stats.damage_type || null,
                    attack_bonus: null, fromInventory: true,
                    quantity: i.quantity ?? 1
                };
            });

        // Equipped first, then by name, so the thing in your hands is at the
        // top of the list you are reading mid-turn.
        return owned.concat(carried).sort((a, b) => {
            if (a.equipped !== b.equipped) return a.equipped ? -1 : 1;
            return (a.name || '').localeCompare(b.name || '');
        });
    }

    function actionsTab() {
        // Fire and forget: it redraws itself once the names resolve.
        fillCarriedWeaponStats();
        const attacks = attackList();
        const weapons = attacks.length
            ? `<div class="stack holdable">${attacks.map(a => `
                <div class="list-row" onclick="sheetShowDetail('${a.kind}','${a.id}')" role="button" tabindex="0"
                     data-holdable data-kind="${a.kind}" data-id="${a.id}">
                    <div class="who">
                        <div class="name">${escapeHtml(a.name)}${
                            a.quantity > 1 ? ` <span class="mono">&times;${a.quantity}</span>` : ''}${
                            a.equipped ? ' <span class="tag tag-accent">EQUIPPED</span>' : ''}</div>
                        <div class="meta">${
                            a.damage
                                ? `${escapeHtml(a.damage)} ${escapeHtml(a.damage_type || '')}`
                                : a.fromInventory ? 'Carried &mdash; no damage recorded' : ''}</div>
                    </div>
                    ${a.attack_bonus === null ? '' : `<div class="mono lvl">${formatMod(a.attack_bonus)}</div>`}
                </div>`).join('')}</div>`
            : `<div class="empty-state">
                   <p>Nothing to attack with. Add a weapon, or equip one you are carrying.</p>
                   <button class="btn btn-accent" onclick="sheetAddWeapon()">Add a weapon</button>
               </div>`;

        const features = listTab('feature', c.features_traits || [], 'No features recorded.', f => `
            <div class="list-row" onclick="sheetShowDetail('feature','${f.id}')" role="button" tabindex="0"
                 data-holdable data-kind="feature" data-id="${f.id}">
                <div class="who">
                    <div class="name">${escapeHtml(f.name)}</div>
                    <div class="meta">${escapeHtml(f.source || '')}</div>
                </div>
                ${f.uses_total ? `
                    <button class="charge${f.uses_remaining ? '' : ' is-spent'}"
                            onclick="event.stopPropagation();sheetUseFeature('${f.id}',false)"
                            title="Use one; hold to give it back"
                            data-charge="${f.id}">
                        <span class="mono">${f.uses_remaining ?? 0}/${f.uses_total}</span>
                    </button>` : ''}
            </div>`, 'sheetAddFeature()');

        return `
            ${sectionHead('Weapons', 'sheetAddWeapon()')}
            ${weapons}
            ${sectionHead('Features & traits', 'sheetAddFeature()')}
            ${features}`;
    }

    function spellsTab() {
        const slots = (c.spell_slots || []).slice().sort((a, b) => a.slot_level - b.slot_level);
        const slotRow = slots.length ? `
            <div class="section-head">
                <span class="eyebrow">Spell slots</span><span class="rule"></span>
                <span class="hint">Tap to spend, hold to restore</span>
            </div>
            <div class="chipline slot-line holdable">
                ${slots.map(sl => {
                    const left = (sl.total || 0) - (sl.used || 0);
                    return `<button class="chip slot-chip${left ? '' : ' is-spent'}"
                                    onclick="sheetUseSlot('${sl.id}',false)"
                                    data-holdable data-kind="slot" data-id="${sl.id}"
                                    aria-label="Level ${sl.slot_level}: ${left} of ${sl.total || 0} left">
                                ${left}/${sl.total || 0}<span>L${sl.slot_level}</span>
                            </button>`;
                }).join('')}
            </div>` : '';

        const byLevel = {};
        (c.spells || []).forEach(s => {
            (byLevel[s.level || 0] = byLevel[s.level || 0] || []).push(s);
        });

        const groups = Object.keys(byLevel).sort((a, b) => a - b).map(level => `
            <div class="section-head">
                <span class="eyebrow">${level === '0' ? 'Cantrips' : 'Level ' + level}</span>
                <span class="rule"></span>
            </div>
            <div class="stack holdable">
                ${byLevel[level].map(sp => `
                    <div class="list-row" onclick="sheetShowDetail('spell','${sp.id}')" role="button" tabindex="0"
                         data-holdable data-kind="spell" data-id="${sp.id}">
                        <div class="who">
                            <div class="name">${escapeHtml(sp.name)}</div>
                            <div class="meta">${escapeHtml(sp.school || '')}${sp.casting_time ? ' · ' + escapeHtml(sp.casting_time) : ''}</div>
                        </div>
                        <button class="prep-toggle${sp.prepared ? ' is-on' : ''}"
                                onclick="event.stopPropagation();sheetTogglePrepared('${sp.id}')"
                                aria-pressed="${!!sp.prepared}"
                                aria-label="${sp.prepared ? 'Prepared' : 'Not prepared'}">PREP</button>
                    </div>`).join('')}
            </div>`).join('');

        return slotRow
            + sectionHead('Spells', 'sheetAddSpell()')
            + (groups || `<div class="empty-state">
                              <p>No spells recorded.</p>
                              <button class="btn btn-accent" onclick="sheetAddSpell()">Add a spell</button>
                          </div>`);
    }

    function inventoryTab() {
        const money = c.currency || {};
        const coins = ['platinum', 'gold', 'electrum', 'silver', 'copper'];
        const purse = `
            ${sectionHead('Currency', 'sheetEditCurrency()')}
            <div class="chipline" role="button" tabindex="0" onclick="sheetEditCurrency()"
                 style="cursor:pointer" aria-label="Edit currency">
                ${coins.map(k => `<div class="chip">${money[k] ?? 0}<span>${k.slice(0, 2).toUpperCase()}</span></div>`).join('')}
            </div>`;

        const items = listTab('item', c.inventory_items || [], 'Nothing carried.', i => `
            <div class="list-row" onclick="sheetShowDetail('item','${i.id}')" role="button" tabindex="0"
                 data-holdable data-kind="item" data-id="${i.id}">
                <div class="who">
                    <div class="name">${escapeHtml(i.name)}${i.equipped ? ' <span class="tag tag-accent">EQUIPPED</span>' : ''}${
                        i.attuned ? ' <span class="tag tag-warning">ATTUNED</span>' : ''}</div>
                    <div class="meta">${escapeHtml(i.item_type || 'Gear')}${i.weight ? ` · ${i.weight} lb` : ''}</div>
                </div>
                <div class="qty" onclick="event.stopPropagation()">
                    <button onclick="sheetItemQuantity('${i.id}',-1)" aria-label="One fewer">&minus;</button>
                    <span class="mono">${i.quantity ?? 1}</span>
                    <button onclick="sheetItemQuantity('${i.id}',1)" aria-label="One more">+</button>
                </div>
            </div>`, 'sheetAddItem()');

        return `${purse}
            ${sectionHead('Carried', 'sheetAddItem()')}
            ${items}`;
    }

    // The eight prose fields on character_details, and the six short ones.
    const DETAIL_FIELDS = [
        ['personality_traits', 'Personality traits'], ['ideals', 'Ideals'],
        ['bonds', 'Bonds'], ['flaws', 'Flaws'], ['backstory', 'Backstory'],
        ['allies_organizations', 'Allies & organizations'],
        ['additional_features', 'Additional features'], ['treasure', 'Treasure']
    ];
    const APPEARANCE_FIELDS = [
        ['age', 'Age'], ['height', 'Height'], ['weight', 'Weight'],
        ['eyes', 'Eyes'], ['skin', 'Skin'], ['hair', 'Hair']
    ];

    function notesTab() {
        const d = c.character_details || {};
        const written = DETAIL_FIELDS.filter(([key]) => d[key] && String(d[key]).trim());
        const physical = APPEARANCE_FIELDS.filter(([key]) => d[key] && String(d[key]).trim());

        if (!written.length && !physical.length && !c.notes) {
            return `<div class="empty-state">
                        <p>Nothing written down yet.</p>
                        <button class="btn btn-accent" onclick="sheetEditAppearance()">Describe them</button>
                        <button class="btn" onclick="sheetEditNotes()">Add a note</button>
                    </div>`;
        }

        return `
            ${sectionHead('Appearance', 'sheetEditAppearance()')}
            ${physical.length
                ? `<div class="chipline wrap" role="button" tabindex="0" style="cursor:pointer"
                        onclick="sheetEditAppearance()" aria-label="Edit appearance">
                       ${physical.map(([key, label]) =>
                           `<div class="chip">${escapeHtml(d[key])}<span>${escapeHtml(label)}</span></div>`).join('')}
                   </div>`
                : '<p class="hint">No description yet.</p>'}
            ${sectionHead('Notes', 'sheetEditNotes()')}
            ${c.notes
                ? `<p class="prose editable" role="button" tabindex="0" onclick="sheetEditNotes()">${escapeHtml(c.notes)}</p>`
                : '<p class="hint">Nothing noted yet.</p>'}
            ${DETAIL_FIELDS.map(([key, label]) => `
                ${sectionHead(label, `sheetEditDetail('${key}')`)}
                ${d[key] && String(d[key]).trim()
                    ? `<p class="prose editable" role="button" tabindex="0"
                          onclick="sheetEditDetail('${key}')">${escapeHtml(d[key])}</p>`
                    : `<p class="hint">Nothing written yet.</p>`}`).join('')}`;
    }

    // ---- Notes and details ------------------------------------------------

    async function saveDetails(values) {
        Object.assign(c.character_details = c.character_details || {}, values);
        draw();
        await persist(db.from('character_details').update(values).eq('character_id', c.id),
                      'Could not save that.');
    }

    window.sheetEditDetail = key => {
        const label = (DETAIL_FIELDS.find(([k]) => k === key) || [key, key])[1];
        openModal({
            title: label,
            submitLabel: 'Save',
            fields: [{ name: 'value', label, type: 'textarea', rows: 6,
                       value: (c.character_details || {})[key] || '' }],
            onSubmit: values => saveDetails({ [key]: values.value || null })
        });
    };

    window.sheetEditAppearance = () => {
        const d = c.character_details || {};
        openModal({
            title: 'Appearance',
            submitLabel: 'Save',
            fields: APPEARANCE_FIELDS.map(([key, label]) => ({
                name: key, label, value: d[key] || ''
            })),
            onSubmit: async values => {
                const next = {};
                APPEARANCE_FIELDS.forEach(([key]) => { next[key] = values[key] || null; });
                await saveDetails(next);
            }
        });
    };

    // characters.notes is a column on the character, not on character_details,
    // which is why this one does not go through saveDetails.
    window.sheetEditNotes = () => {
        openModal({
            title: 'Notes',
            submitLabel: 'Save',
            fields: [{ name: 'notes', label: 'Notes', type: 'textarea', rows: 8,
                       value: c.notes || '',
                       hint: 'Anything you want on the sheet. Your DM can see it.' }],
            onSubmit: async values => {
                c.notes = values.notes || null;
                draw();
                await persist(db.from('characters').update({ notes: c.notes }).eq('id', c.id),
                              'Could not save your notes.');
            }
        });
    };

    // ========================================
    // Detail pane
    // ========================================

    function buildDetail(kind, id) {
        if (kind === 'weapon') {
            const w = (c.weapons || []).find(x => x.id === id);
            if (!w) return null;
            return { title: w.name, body: `
                <div class="stat-trio">
                    <div><b>${formatMod(w.attack_bonus || 0)}</b><span>ATTACK</span></div>
                    <div><b>${escapeHtml(w.damage || '—')}</b><span>DAMAGE</span></div>
                    <div><b>${escapeHtml(w.damage_type || '—')}</b><span>TYPE</span></div>
                </div>
                ${w.properties ? `<p>${escapeHtml(w.properties)}</p>` : ''}` };
        }
        if (kind === 'feature') {
            const f = (c.features_traits || []).find(x => x.id === id);
            if (!f) return null;
            return { title: f.name, body: `
                <p class="flavour">${escapeHtml(f.source || '')}</p>
                ${f.uses_total ? `<p class="mono">${f.uses_remaining ?? 0} / ${f.uses_total} uses${
                    f.uses_per_rest ? ` · resets on a ${f.uses_per_rest.replace(/_/g, ' ')} rest` : ''}</p>` : ''}
                ${f.description ? `<p>${escapeHtml(f.description)}</p>` : ''}` };
        }
        if (kind === 'spell') {
            const s = (c.spells || []).find(x => x.id === id);
            if (!s) return null;
            return { title: s.name, body: `
                <p class="flavour">${s.level ? 'Level ' + s.level : 'Cantrip'}${s.school ? ' · ' + escapeHtml(s.school) : ''}</p>
                <div class="stat-trio">
                    <div><b>${escapeHtml(s.casting_time || '—')}</b><span>CAST</span></div>
                    <div><b>${escapeHtml(s.range || '—')}</b><span>RANGE</span></div>
                    <div><b>${escapeHtml(s.duration || '—')}</b><span>DURATION</span></div>
                </div>
                ${s.components ? `<p class="mono">${escapeHtml(s.components)}</p>` : ''}
                ${s.description ? `<p>${escapeHtml(s.description)}</p>` : ''}` };
        }
        const i = (c.inventory_items || []).find(x => x.id === id);
        if (!i) return null;
        return { title: i.name, body: `
            <div class="stat-trio">
                <div><b>${i.quantity ?? 1}</b><span>QTY</span></div>
                <div><b>${i.weight ?? '—'}</b><span>WEIGHT</span></div>
                <div><b>${escapeHtml(i.item_type || 'Gear')}</b><span>TYPE</span></div>
            </div>
            ${i.description ? `<p>${escapeHtml(i.description)}</p>` : ''}` };
    }

    // ========================================
    // Render
    // ========================================

    function tabBody() {
        switch (activeTab) {
            case 'skills':    return skillsTab();
            case 'actions':   return actionsTab();
            case 'spells':    return spellsTab();
            case 'inventory': return inventoryTab();
            case 'notes':     return notesTab();
            default:          return statsTab();
        }
    }

    function draw() {
        const subclass = c.subclass ? ` ${c.subclass}` : '';
        const meta = `Lv ${c.level || 1} ${c.class || ''}${subclass} · ${c.player_name || ''}`;

        // Layout follows the handoff: above 900px the icon rail and the tab rail
        // are siblings of .app-main, so the sticky combat header sits beside
        // them rather than stretching over the whole viewport.
        document.body.innerHTML = `
            <div class="app-shell">
                <aside class="rail">
                    <div class="rail-brand">T5</div>
                    <a class="icon-btn" href="index.html" title="Overview">${icon('overview', 16)}</a>
                    <a class="icon-btn is-current" href="characters.html" title="Characters">${icon('user', 16)}</a>
                    <span class="icon-btn is-pending" title="Encounter tracker — not built yet">${icon('monster', 16)}</span>
                    <span class="icon-btn is-pending" title="Compendium — not built yet">${icon('search', 16)}</span>
                </aside>

                <nav class="sheet-nav">
                    <div>
                        <div class="nav-name">${escapeHtml(c.name)}</div>
                        <div class="nav-meta">${escapeHtml(meta)}</div>
                    </div>
                    ${renderHP(c.current_hit_points, c.hit_point_maximum, c.temporary_hit_points, 'inline')}
                    <div class="tabs">
                        ${TABS.map(t => `
                            <div class="${t.id === activeTab ? 'is-active' : ''}"
                                 onclick="sheetTab('${t.id}')" role="button" tabindex="0">
                                ${icon(t.icon, 16)}${t.label}
                            </div>`).join('')}
                    </div>
                    <div class="nav-rests">
                        <button class="btn btn-rest short btn-block" onclick="sheetShortRest()">Short rest</button>
                        <button class="btn btn-rest long btn-block" onclick="sheetLongRest()">Long rest</button>
                    </div>
                </nav>

                <div class="app-main sheet-page">
                    <header class="sheet-header">
                        <div class="sheet-id">
                            <a class="icon-btn" href="characters.html" aria-label="Back to roster">
                                <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                                     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>
                                </svg>
                            </a>
                            <h1>${escapeHtml(c.name)}</h1>
                            <span class="level-badge mono">LV ${c.level || 1}</span>
                            <button class="icon-btn" id="menu-btn" aria-label="Open menu"
                                    style="margin-left:auto">${icon('menu', 19)}</button>
                        </div>
                        <div class="sheet-combat">
                            <div class="hp-big">
                                <span class="mono current">${c.current_hit_points ?? 0}</span>
                                <span class="mono max">/${c.hit_point_maximum ?? 0}</span>
                                ${c.temporary_hit_points > 0
                                    ? `<span class="mono temp">+${c.temporary_hit_points}</span>` : ''}
                                <span class="hp-state state-${hpClass(c.current_hit_points, c.hit_point_maximum)}"
                                      style="margin-left:auto">${hpStateLabel(c.current_hit_points, c.hit_point_maximum)}</span>
                            </div>
                            <div class="hp-bar">
                                <div class="fill ${hpClass(c.current_hit_points, c.hit_point_maximum)}"
                                     style="width:${c.hit_point_maximum ? Math.max(0, Math.min(100, (c.current_hit_points / c.hit_point_maximum) * 100)) : 0}%"></div>
                            </div>
                            <div class="hp-ctl">
                                <button class="hp-btn damage" onclick="sheetDamage()" aria-label="Apply damage">−</button>
                                <input id="hp-amount" type="number" inputmode="numeric" placeholder="0"
                                       aria-label="Hit point amount">
                                <button class="hp-btn heal" onclick="sheetHeal()" aria-label="Heal">+</button>
                                <button class="btn btn-accent" onclick="sheetApply()">Apply</button>
                            </div>
                            <div class="chipline">
                                <div class="chip">${c.armor_class ?? 10}<span>AC</span></div>
                                <div class="chip">${formatMod(c.initiative_bonus ?? mod('dexterity'))}<span>INIT</span></div>
                                <div class="chip chip-sp">${c.speed ?? 30}<span>SPD</span></div>
                                <div class="chip">${formatMod(prof())}<span>PROF</span></div>
                                <div class="chip">${passivePerception()}<span>PP</span></div>
                            </div>
                        </div>
                    </header>

                    <div class="sheet-content">
                        <div class="sheet-scroll">
                            ${c.pending_level_up || needsSubclassSelection(c) ? `
                                <button class="levelup-banner" onclick="sheetLevelUp()">
                                    <span class="body">
                                        <span class="title">${c.pending_level_up ? 'Level up' : 'Choose a subclass'}</span>
                                        <span class="meta">${c.pending_level_up
                                            ? 'Hit points, improvements and new features are waiting.'
                                            : `A level ${c.level} ${escapeHtml(c.class || '')} has a subclass to pick.`}</span>
                                    </span>
                                    <span class="go">&rarr;</span>
                                </button>` : ''}
                            ${tabBody()}
                        </div>
                        ${detail ? `
                            <aside class="pane detail-open">
                                <button class="icon-btn pane-close" onclick="sheetCloseDetail()" aria-label="Close">&times;</button>
                                <div class="statblock">
                                    <span class="eyebrow">Detail</span>
                                    <h2>${escapeHtml(detail.title)}</h2>
                                    ${detail.body}
                                </div>
                            </aside>` : ''}
                    </div>

                    <nav class="tab-bar">
                        ${TABS.map(t => `
                            <button class="tab-btn${t.id === activeTab ? ' active' : ''}" onclick="sheetTab('${t.id}')">
                                ${icon(t.icon, 19)}<span>${t.label}</span>
                            </button>`).join('')}
                    </nav>
                </div>
            </div>
            ${renderSideMenu('characters')}`;

        wireSideMenu();
        wireCardMenus('.sheet-scroll', '[data-holdable]', sheetRowMenu);
        if (typeof window.markThemeButtons === 'function') window.markThemeButtons();
    }

    // Holding a row reaches the things that have no room on it: deleting,
    // equipping, attuning, and giving back a spent slot or charge.
    function sheetRowMenu(row) {
        const id = row.dataset.id;

        switch (row.dataset.kind) {
            case 'spell': {
                const spell = (c.spells || []).find(sp => sp.id === id);
                if (!spell) return null;
                return {
                    title: spell.name,
                    actions: [
                        { label: 'Show details', run: () => window.sheetShowDetail('spell', id) },
                        { label: spell.prepared ? 'Mark unprepared' : 'Mark prepared',
                          run: () => window.sheetTogglePrepared(id) },
                        { label: 'Forget this spell', danger: true,
                          run: () => removeRow('spells', id, 'spells') }
                    ]
                };
            }

            case 'slot': {
                const slot = (c.spell_slots || []).find(sl => sl.id === id);
                if (!slot) return null;
                return {
                    title: `Level ${slot.slot_level} slots`,
                    actions: [
                        { label: 'Restore one', hint: `${(slot.total || 0) - (slot.used || 0)} of ${slot.total || 0} left`,
                          run: () => window.sheetUseSlot(id, true) },
                        { label: 'Spend one', run: () => window.sheetUseSlot(id, false) }
                    ]
                };
            }

            case 'weapon': {
                const weapon = (c.weapons || []).find(w => w.id === id);
                if (!weapon) return null;
                return {
                    title: weapon.name,
                    actions: [
                        { label: 'Show details', run: () => window.sheetShowDetail('weapon', id) },
                        { label: weapon.equipped ? 'Unequip' : 'Equip',
                          hint: 'Equipped weapons sort to the top',
                          run: () => window.sheetToggleWeaponEquipped(id) },
                        { label: 'Delete', danger: true,
                          run: () => removeRow('weapons', id, 'weapons') }
                    ]
                };
            }

            case 'item': {
                const item = (c.inventory_items || []).find(i => i.id === id);
                if (!item) return null;
                return {
                    title: item.name,
                    actions: [
                        { label: 'Show details', run: () => window.sheetShowDetail('item', id) },
                        { label: item.equipped ? 'Unequip' : 'Equip',
                          // A carried weapon is only an action while equipped,
                          // so this is the switch that puts it on the tab.
                          hint: item.item_type === 'Weapon'
                              ? (item.equipped ? 'Takes it off your actions' : 'Adds it to your actions')
                              : undefined,
                          run: () => window.sheetToggleItemFlag(id, 'equipped') },
                        { label: item.attuned ? 'End attunement' : 'Attune',
                          run: () => window.sheetToggleItemFlag(id, 'attuned') },
                        { label: 'Drop', danger: true,
                          hint: `All ${item.quantity ?? 1} of them`,
                          run: () => removeRow('inventory_items', id, 'inventory_items') }
                    ]
                };
            }

            case 'feature': {
                const feature = (c.features_traits || []).find(f => f.id === id);
                if (!feature) return null;
                const actions = [
                    { label: 'Show details', run: () => window.sheetShowDetail('feature', id) }
                ];
                if (feature.uses_total) {
                    actions.push({ label: 'Restore one use',
                        hint: `${feature.uses_remaining ?? 0} of ${feature.uses_total} left`,
                        run: () => window.sheetUseFeature(id, true) });
                }
                actions.push({ label: 'Delete', danger: true,
                    run: () => removeRow('features_traits', id, 'features_traits') });
                return { title: feature.name, actions };
            }

            default:
                return null;
        }
    }

    // ========================================
    // Load
    // ========================================

    (async function init() {
        if (!characterId) {
            window.location.replace('characters.html');
            return;
        }

        const { data, error } = await db
            .from('characters')
            .select(`*,
                ability_scores(*), skills(*), saving_throws(*), weapons(*),
                inventory_items(*), spells(*), spell_slots(*), features_traits(*),
                currency(*), character_details(*)`)
            .eq('id', characterId)
            .single();

        if (error || !data) {
            console.error('Failed to load character:', error);
            document.body.innerHTML = `
                <div class="app-shell"><div class="app-main">
                    <div class="main-content">
                        <div class="error-banner">Could not load that character.</div>
                        <a class="btn" href="characters.html">Back to the roster</a>
                    </div>
                </div></div>`;
            return;
        }

        // Supabase returns one-to-one embeds as an object, but older shapes and
        // some filters yield a single-element array. Normalise both.
        const first = value => Array.isArray(value) ? (value[0] || null) : value;
        data.ability_scores = first(data.ability_scores) || {};
        data.currency = first(data.currency) || {};
        data.character_details = first(data.character_details) || {};

        // The character must belong to this world. Nothing else scopes this
        // query, and the character tables carry no row level security of their own.
        if (data.game_world_id !== session.gameWorldId) {
            document.body.innerHTML = `
                <div class="app-shell"><div class="app-main">
                    <div class="main-content">
                        <div class="error-banner">That character belongs to another world.</div>
                        <a class="btn" href="characters.html">Back to the roster</a>
                    </div>
                </div></div>`;
            return;
        }

        c = data;
        draw();
    })();

    // ========================================
    // Levelling
    // ========================================

    async function reload() {
        const { data } = await db
            .from('characters')
            .select(`*,
                ability_scores(*), skills(*), saving_throws(*), weapons(*),
                inventory_items(*), spells(*), spell_slots(*), features_traits(*),
                currency(*), character_details(*)`)
            .eq('id', characterId)
            .single();
        if (!data) return;
        const first = value => Array.isArray(value) ? (value[0] || null) : value;
        data.ability_scores = first(data.ability_scores) || {};
        data.currency = first(data.currency) || {};
        data.character_details = first(data.character_details) || {};
        c = data;
        draw();
    }

    window.sheetLevelUp = () => {
        if (typeof window.openLevelUp === 'function') window.openLevelUp(c, reload);
    };

    // v1 opens its wizard automatically when a subclass is missing. v2 shows
    // the banner instead: a modal that appears over the sheet traps someone
    // who opened it to check their hit points mid-fight, and the choice is
    // one tap away either way.
})();
