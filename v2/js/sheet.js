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

    function listTab(kind, items, emptyText, renderRow) {
        if (!items.length) return `<div class="empty-state"><p>${escapeHtml(emptyText)}</p></div>`;
        return `<div class="stack">${items.map(renderRow).join('')}</div>`;
    }

    function actionsTab() {
        const weapons = listTab('weapon', c.weapons || [], 'No weapons recorded.', w => `
            <div class="list-row" onclick="sheetShowDetail('weapon','${w.id}')" role="button" tabindex="0">
                <div class="who">
                    <div class="name">${escapeHtml(w.name)}${w.equipped ? ' <span class="tag tag-accent">EQUIPPED</span>' : ''}</div>
                    <div class="meta">${escapeHtml(w.damage || '')} ${escapeHtml(w.damage_type || '')}</div>
                </div>
                <div class="mono lvl">${formatMod(w.attack_bonus || 0)}</div>
            </div>`);

        const features = listTab('feature', c.features_traits || [], 'No features recorded.', f => `
            <div class="list-row" onclick="sheetShowDetail('feature','${f.id}')" role="button" tabindex="0">
                <div class="who">
                    <div class="name">${escapeHtml(f.name)}</div>
                    <div class="meta">${escapeHtml(f.source || '')}${
                        f.uses_total ? ` · ${f.uses_remaining ?? 0}/${f.uses_total} uses` : ''
                    }</div>
                </div>
            </div>`);

        return `
            <div class="section-head"><span class="eyebrow">Weapons</span><span class="rule"></span></div>
            ${weapons}
            <div class="section-head"><span class="eyebrow">Features &amp; traits</span><span class="rule"></span></div>
            ${features}`;
    }

    function spellsTab() {
        const slots = (c.spell_slots || []).slice().sort((a, b) => a.slot_level - b.slot_level);
        const slotRow = slots.length ? `
            <div class="section-head"><span class="eyebrow">Spell slots</span><span class="rule"></span></div>
            <div class="chipline slot-line">
                ${slots.map(s => `<div class="chip">${(s.total || 0) - (s.used || 0)}/${s.total || 0}<span>L${s.slot_level}</span></div>`).join('')}
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
            <div class="stack">
                ${byLevel[level].map(s => `
                    <div class="list-row" onclick="sheetShowDetail('spell','${s.id}')" role="button" tabindex="0">
                        <div class="who">
                            <div class="name">${escapeHtml(s.name)}${s.prepared ? ' <span class="tag tag-accent">PREPARED</span>' : ''}</div>
                            <div class="meta">${escapeHtml(s.school || '')}${s.casting_time ? ' · ' + escapeHtml(s.casting_time) : ''}</div>
                        </div>
                    </div>`).join('')}
            </div>`).join('');

        return slotRow + (groups || '<div class="empty-state"><p>No spells recorded.</p></div>');
    }

    function inventoryTab() {
        const money = c.currency || {};
        const coins = ['platinum', 'gold', 'electrum', 'silver', 'copper'];
        const purse = `
            <div class="section-head"><span class="eyebrow">Currency</span><span class="rule"></span></div>
            <div class="chipline">
                ${coins.map(k => `<div class="chip">${money[k] ?? 0}<span>${k.slice(0, 2).toUpperCase()}</span></div>`).join('')}
            </div>`;

        const items = listTab('item', c.inventory_items || [], 'Nothing carried.', i => `
            <div class="list-row" onclick="sheetShowDetail('item','${i.id}')" role="button" tabindex="0">
                <div class="who">
                    <div class="name">${escapeHtml(i.name)}${i.equipped ? ' <span class="tag tag-accent">EQUIPPED</span>' : ''}${
                        i.attuned ? ' <span class="tag tag-warning">ATTUNED</span>' : ''}</div>
                    <div class="meta">${escapeHtml(i.item_type || 'Gear')}${i.weight ? ` · ${i.weight} lb` : ''}</div>
                </div>
                <div class="mono lvl">×${i.quantity ?? 1}</div>
            </div>`);

        return `${purse}
            <div class="section-head"><span class="eyebrow">Carried</span><span class="rule"></span></div>
            ${items}`;
    }

    function notesTab() {
        const d = c.character_details || {};
        const fields = [
            ['Personality traits', d.personality_traits], ['Ideals', d.ideals],
            ['Bonds', d.bonds], ['Flaws', d.flaws], ['Backstory', d.backstory],
            ['Allies & organizations', d.allies_organizations],
            ['Additional features', d.additional_features], ['Treasure', d.treasure]
        ].filter(([, value]) => value && String(value).trim());

        const physical = [
            ['Age', d.age], ['Height', d.height], ['Weight', d.weight],
            ['Eyes', d.eyes], ['Skin', d.skin], ['Hair', d.hair]
        ].filter(([, value]) => value && String(value).trim());

        if (!fields.length && !physical.length && !c.notes) {
            return '<div class="empty-state"><p>No notes recorded. Add them in the classic version.</p></div>';
        }

        return `
            ${physical.length ? `
                <div class="section-head"><span class="eyebrow">Appearance</span><span class="rule"></span></div>
                <div class="chipline wrap">${physical.map(([k, v]) =>
                    `<div class="chip">${escapeHtml(v)}<span>${escapeHtml(k)}</span></div>`).join('')}</div>` : ''}
            ${c.notes ? `
                <div class="section-head"><span class="eyebrow">Notes</span><span class="rule"></span></div>
                <p class="prose">${escapeHtml(c.notes)}</p>` : ''}
            ${fields.map(([label, value]) => `
                <div class="section-head"><span class="eyebrow">${escapeHtml(label)}</span><span class="rule"></span></div>
                <p class="prose">${escapeHtml(value)}</p>`).join('')}`;
    }

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
        if (typeof window.markThemeButtons === 'function') window.markThemeButtons();
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
