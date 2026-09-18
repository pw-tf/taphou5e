// ========================================
// TAPHOU5E v2 — Level-up wizard
//
// Opened from the sheet when a character is owed a level or is missing a
// subclass. Multi-level aware, exactly as v1 is: a DM who grants three levels
// at once gets three hit point choices and every ASI in the range, not one
// level's worth repeated.
//
// The write semantics at the end mirror app.js's completeLevelUp step for
// step. Both versions write the same columns for the same reasons, and a
// character levelled in one must look identical in the other.
//
// Deliberately NOT used: LevelUpEngine.enhanceLevelUpCompletion. It ends in
// recalculateCharacterStats, which writes `passive_perception` -- a column
// `characters` does not have -- and recomputes armor_class from equipment,
// discarding any AC set by hand. v1 loads the engine but never calls it, so
// that path has never run against this schema. Feat and feature effects are
// applied here the way v1 applies them, straight from FeatureRegistry.
// ========================================

(function () {
    const API = 'https://www.dnd5eapi.co/api';

    let st = null;      // wizard state, null when closed
    let onFinish = null;

    // ========================================
    // Opening
    // ========================================

    // Which levels this run covers. A DM granting several levels at once
    // stores the level the character was on before the grant; without it a
    // 1 -> 3 jump would silently skip level 2's choices.
    function levelRange(c) {
        const preGrant = parseInt(localStorage.getItem(`preGrantLevel_${c.id}`), 10) || 0;
        const start = preGrant > 0 && preGrant < c.level ? preGrant + 1 : c.level;
        const fromStorage = parseInt(localStorage.getItem(`targetLevel_${c.id}`), 10) || 0;
        const fromExp = c.experience_points ? levelForExp(c.experience_points) : 0;
        const target = Math.min(20, Math.max(c.level, fromStorage, fromExp));
        const levels = [];
        for (let lvl = start; lvl <= target; lvl++) levels.push(lvl);
        return { start, target, levels };
    }

    window.openLevelUp = async function (character, done) {
        const owed = character.pending_level_up;
        const owedSubclass = needsSubclassSelection(character);
        if (!owed && !owedSubclass) return;

        onFinish = done;

        // A character at level 3+ with no subclass but no pending level gets a
        // one-step wizard: pick the subclass, change nothing else.
        const onlySubclass = !owed && owedSubclass;
        const range = onlySubclass
            ? { start: character.level, target: character.level, levels: [character.level] }
            : levelRange(character);

        st = {
            c: character,
            onlySubclass,
            start: range.start,
            target: range.target,
            levels: range.levels,
            classByLevel: {},
            step: 0,
            busy: true,
            hp: range.levels.map(lvl => ({ level: lvl, amount: null, method: null })),
            asi: [],
            subclass: null,
            about: null,              // subclass whose description is expanded
            spells: [],
            newSpells: []
        };

        render();

        // One request per level, because the SRD exposes features per level.
        // A level that fails to load simply contributes no features; it must
        // not stop the level-up.
        await Promise.all(range.levels.map(async lvl => {
            try {
                const res = await fetch(`${API}/classes/${character.class.toLowerCase()}/levels/${lvl}`);
                if (res.ok) st.classByLevel[lvl] = await res.json();
            } catch (e) { /* offline or non-SRD class */ }
        }));

        st.asi = range.levels
            .filter(lvl => isASILevel(character.class, lvl))
            .map(lvl => ({ level: lvl, mode: 'asi', abilities: {}, feat: null, featAbility: null }));

        st.needsSubclass = !character.subclass && range.levels.some(lvl => lvl >= SUBCLASS_LEVEL);
        st.busy = false;
        st.step = firstStep();
        render();
    };

    // ========================================
    // Steps
    // ========================================

    const STEPS = [
        { id: 'hp',       label: 'Hit points' },
        { id: 'asi',      label: 'ASI' },
        { id: 'subclass', label: 'Subclass' },
        { id: 'spells',   label: 'Spells' },
        { id: 'features', label: 'Features' }
    ];

    // Skip rules follow v1's shouldSkipStep exactly.
    function skip(i) {
        switch (STEPS[i].id) {
            case 'hp':       return st.onlySubclass;
            case 'asi':      return st.onlySubclass || st.asi.length === 0;
            case 'subclass': return !st.needsSubclass;
            case 'spells':   return st.onlySubclass || newSpellCount() === 0;
            case 'features': return st.onlySubclass;
            default:         return false;
        }
    }

    function firstStep() {
        for (let i = 0; i < STEPS.length; i++) if (!skip(i)) return i;
        return STEPS.length - 1;
    }

    function activeSteps() {
        return STEPS.map((s, i) => i).filter(i => !skip(i));
    }

    function newSpellCount() {
        const data = st.classByLevel[st.target];
        if (!data || !data.spellcasting) return 0;
        const known = data.spellcasting.spells_known_at_level || 0;
        const have = (st.c.spells || []).length;
        return Math.max(0, known - have);
    }

    function conMod() {
        const scores = st.c.ability_scores || {};
        return getModifier(scores.constitution ?? 10);
    }

    // The Tough feat adds 2 HP per level, so a character who already has it
    // takes a bigger average -- and one who picks it here gets it applied
    // retroactively at the end, as v1 does.
    function hasTough() {
        return (st.c.features_traits || []).some(f => f.name === 'Tough');
    }

    function averageGain() {
        return averageHPGain(st.c.class, conMod()) + (hasTough() ? 2 : 0);
    }

    // ---- Hit points ------------------------------------------------------

    function stepHP() {
        const avg = averageGain();
        const multi = st.levels.length > 1;
        return `
            <p class="hint">${multi
                ? `Choose hit points for each of the ${st.levels.length} levels gained.`
                : 'Take the average or roll your hit die. Your Constitution modifier is included.'}</p>
            ${multi ? `<button class="btn" id="lu-avg-all">Take the average for all (+${avg} each)</button>` : ''}
            <div class="ability-assign">
                ${st.hp.map((entry, i) => `
                    <div class="hp-choice-row">
                        <span class="mono ab">LV ${entry.level}</span>
                        <div class="hp-choice-actions">
                            <button class="btn${entry.method === 'average' ? ' btn-accent' : ''}"
                                    data-hp="${i}" data-method="average">Average +${avg}</button>
                            <button class="btn${entry.method === 'roll' ? ' btn-accent' : ''}"
                                    data-hp="${i}" data-method="roll">
                                ${entry.method === 'roll' ? `Rolled +${entry.amount}` : `Roll d${HIT_DICE[st.c.class] || 8}`}
                            </button>
                        </div>
                    </div>`).join('')}
            </div>
            <p class="hint">Total gain: <strong>+${st.hp.reduce((sum, e) => sum + (e.amount || 0), 0)}</strong></p>`;
    }

    function wireHP() {
        const all = $('#lu-avg-all');
        if (all) all.addEventListener('click', () => {
            const avg = averageGain();
            st.hp.forEach(e => { e.method = 'average'; e.amount = avg; });
            render();
        });
        $$('[data-hp]').forEach(b => b.addEventListener('click', () => {
            const entry = st.hp[Number(b.dataset.hp)];
            if (b.dataset.method === 'average') {
                entry.method = 'average';
                entry.amount = averageGain();
            } else {
                // Re-rolling is allowed: the button shows the roll, and a
                // second press rolls again rather than locking the first.
                entry.method = 'roll';
                entry.amount = rollHPGain(st.c.class, conMod()) + (hasTough() ? 2 : 0);
            }
            render();
        }));
    }

    // ---- Ability score improvement ---------------------------------------

    function asiSpent(entry) {
        return Object.values(entry.abilities).reduce((sum, n) => sum + n, 0);
    }

    function stepASI() {
        return st.asi.map((entry, i) => {
            const scores = st.c.ability_scores || {};
            const spent = asiSpent(entry);
            return `
            <div class="asi-block">
                ${st.asi.length > 1 ? `<div class="section-head"><span class="eyebrow">Level ${entry.level}</span><span class="rule"></span></div>` : ''}
                <div class="seg" role="tablist">
                    <button class="${entry.mode === 'asi' ? 'is-on' : ''}" data-asimode="asi" data-i="${i}">Ability scores</button>
                    <button class="${entry.mode === 'feat' ? 'is-on' : ''}" data-asimode="feat" data-i="${i}">Feat</button>
                </div>
                ${entry.mode === 'asi' ? `
                    <p class="hint">Spend 2 points. No score goes above 20.</p>
                    <div class="budget${spent > 2 ? ' is-over' : ''}"><span class="mono">${2 - spent}</span> point${2 - spent === 1 ? '' : 's'} left</div>
                    <div class="ability-assign">
                        ${ABILITIES.map(a => {
                            const long = ABILITY_LONG[a];
                            const base = scores[long] ?? 10;
                            const added = entry.abilities[a] || 0;
                            return `
                            <div class="ability-assign-row">
                                <span class="mono ab">${a.toUpperCase()}</span>
                                <div class="stepper">
                                    <button data-asi="${i}" data-ab="${a}" data-delta="-1" ${added <= 0 ? 'disabled' : ''}>&minus;</button>
                                    <span class="mono val">${base + added}</span>
                                    <button data-asi="${i}" data-ab="${a}" data-delta="1"
                                        ${spent >= 2 || base + added >= 20 ? 'disabled' : ''}>+</button>
                                </div>
                                <span class="score-readout">
                                    ${added ? `<span class="racial">+${added}</span>` : ''}
                                    <span class="mod">${formatMod(getModifier(base + added))}</span>
                                </span>
                            </div>`;
                        }).join('')}
                    </div>`
                : `
                    <div class="form-group">
                        <label for="lu-feat-${i}">Feat</label>
                        <select id="lu-feat-${i}" data-featpick="${i}">
                            <option value="">Choose a feat&hellip;</option>
                            ${FEATS.map(f => `<option value="${escapeHtml(f.name)}"${f.name === entry.feat ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
                        </select>
                        ${entry.feat ? `<p class="hint">${escapeHtml((FEATS.find(f => f.name === entry.feat) || {}).description || '')}</p>` : ''}
                    </div>
                    ${featAbilityPicker(entry, i)}`}
            </div>`;
        }).join('');
    }

    // Some feats raise a score the player chooses (Athlete: STR or DEX). The
    // registry says which, so the choice is offered inline instead of in the
    // engine's own modal.
    function featAbilityPicker(entry, i) {
        if (!entry.feat) return '';
        const effect = featEffect(entry.feat);
        if (!effect || effect.type !== 'ability_choice' || !effect.choices) return '';
        return `
            <div class="chip-row">
                ${effect.choices.map(long => `
                    <button class="chip${entry.featAbility === long ? ' is-on' : ''}"
                            data-featab="${i}" data-ab="${escapeHtml(long)}"
                            aria-pressed="${entry.featAbility === long}">
                        ${escapeHtml(long.charAt(0).toUpperCase() + long.slice(1))} +${effect.bonus || 1}
                    </button>`).join('')}
            </div>`;
    }

    function featEffect(name) {
        const registry = window.FeatureRegistry ? window.FeatureRegistry.FEAT_EFFECTS : null;
        if (!registry) return null;
        return registry[name.toLowerCase().replace(/\s+/g, '-')] || null;
    }

    function wireASI() {
        $$('[data-asimode]').forEach(b => b.addEventListener('click', () => {
            const entry = st.asi[Number(b.dataset.i)];
            entry.mode = b.dataset.asimode;
            // Switching away discards the other mode's choice rather than
            // saving both, which would apply an ASI and a feat for one level.
            if (entry.mode === 'asi') { entry.feat = null; entry.featAbility = null; }
            else entry.abilities = {};
            render();
        }));

        $$('[data-asi]').forEach(b => b.addEventListener('click', () => {
            const entry = st.asi[Number(b.dataset.asi)];
            const a = b.dataset.ab;
            const delta = Number(b.dataset.delta);
            const next = (entry.abilities[a] || 0) + delta;
            if (next < 0 || (delta > 0 && asiSpent(entry) >= 2)) return;
            if (next === 0) delete entry.abilities[a];
            else entry.abilities[a] = next;
            render();
        }));

        $$('[data-featpick]').forEach(sel => sel.addEventListener('change', () => {
            const entry = st.asi[Number(sel.dataset.featpick)];
            entry.feat = sel.value || null;
            entry.featAbility = null;
            render();
        }));

        $$('[data-featab]').forEach(b => b.addEventListener('click', () => {
            const entry = st.asi[Number(b.dataset.featab)];
            entry.featAbility = entry.featAbility === b.dataset.ab ? null : b.dataset.ab;
            render();
        }));
    }

    // ---- Subclass ---------------------------------------------------------

    // Descriptions expand in place rather than opening a panel. There is one
    // modal host, so openPanel would have closed the wizard to show the info
    // and left nothing behind when it was dismissed -- and reading about a
    // subclass while choosing one is better side by side anyway.
    const srdText = {};       // subclass name -> description, '' when absent

    function stepSubclass() {
        const options = SUBCLASSES[st.c.class] || [];
        return `
            <p class="hint">A ${escapeHtml(st.c.class)} chooses a subclass at level ${SUBCLASS_LEVEL}. Its features are added automatically where the SRD has them.</p>
            <div class="pick-list" role="radiogroup" aria-label="Subclass">
                ${options.map(name => {
                    const open = st.about === name;
                    const text = srdText[name];
                    return `
                    <div class="pick-row-wrap">
                        <div class="pick-row-main">
                            <button class="pick-row${st.subclass === name ? ' is-on' : ''}" data-subclass="${escapeHtml(name)}"
                                    role="radio" aria-checked="${st.subclass === name}">
                                <span class="name">${escapeHtml(name)}</span>
                                <span class="meta">${escapeHtml(subclassSummary(name) || '')}</span>
                            </button>
                            <button class="info-btn${open ? ' is-on' : ''}" data-about="${escapeHtml(name)}"
                                    aria-expanded="${open}" aria-label="About ${escapeHtml(name)}">i</button>
                        </div>
                        ${open ? `
                            <div class="subclass-about">
                                ${text === undefined
                                    ? '<div class="skeleton"></div>'
                                    : text
                                        ? `<span class="eyebrow">From the SRD</span>
                                           <p class="prose">${escapeHtml(text)}</p>`
                                        : `<p class="hint">Not in the SRD &mdash; this one is from the
                                           Player's Handbook or a later book, so the line above is all
                                           the app has. Check the book before you commit to it.</p>`}
                            </div>` : ''}
                    </div>`;
                }).join('')}
            </div>`;
    }

    function wireSubclass() {
        $$('[data-subclass]').forEach(b => b.addEventListener('click', () => {
            st.subclass = b.dataset.subclass;
            render();
        }));

        $$('[data-about]').forEach(b => b.addEventListener('click', e => {
            // The row beside it picks the subclass; reading about one is not
            // the same as taking it.
            e.stopPropagation();
            const name = b.dataset.about;
            st.about = st.about === name ? null : name;
            render();
            if (st.about) loadSubclassText(name);
        }));
    }

    // The SRD carries a real description for twelve of the hundred-odd
    // subclasses. An empty string means "looked, found nothing", so a second
    // press does not fetch again.
    async function loadSubclassText(name) {
        if (srdText[name] !== undefined) return;
        try {
            const list = await srdIndex(`classes/${st.c.class.toLowerCase()}/subclasses`);
            const match = matchSubclass(list, name);
            srdText[name] = match
                ? [].concat((await srdDetail('subclasses', match.index)).desc || []).join('\n\n')
                : '';
        } catch (err) {
            srdText[name] = '';
        }
        if (st && st.about === name) render();
    }

    // ---- Spells -----------------------------------------------------------

    function stepSpells() {
        const allowed = newSpellCount();
        return `
            <p class="hint">You can learn ${allowed} new spell${allowed === 1 ? '' : 's'} at level ${st.target}.</p>
            <div class="form-group">
                <label for="lu-spell-search">Search the SRD</label>
                <input id="lu-spell-search" type="text" placeholder="Fireball" autocomplete="off">
            </div>
            <div id="lu-spell-results" class="pick-list"></div>
            ${st.spells.length ? `
                <div class="section-head"><span class="eyebrow">Learning</span><span class="rule"></span></div>
                <div class="chip-row">
                    ${st.spells.map((sp, i) => `
                        <button class="chip is-on" data-unspell="${i}">${escapeHtml(sp.name)} &times;</button>`).join('')}
                </div>` : ''}`;
    }

    async function wireSpells(carried) {
        const box = $('#lu-spell-search');
        const out = $('#lu-spell-results');
        if (!box || !out) return;

        if (carried) box.value = carried.value;

        const index = await srdIndex('spells');
        const allowed = newSpellCount();

        const draw = () => {
            const q = box.value.trim().toLowerCase();
            if (!q) { out.innerHTML = ''; return; }
            const taken = new Set(st.spells.map(s => s.index));
            const hits = index.filter(s => s.name.toLowerCase().includes(q) && !taken.has(s.index)).slice(0, 8);
            out.innerHTML = hits.length
                ? hits.map(s => `<button class="pick-row" data-spell="${escapeHtml(s.index)}" data-name="${escapeHtml(s.name)}"><span class="name">${escapeHtml(s.name)}</span></button>`).join('')
                : '<p class="hint">Nothing matches.</p>';

            $$('[data-spell]', out).forEach(b => b.addEventListener('click', async () => {
                if (st.spells.length >= allowed) {
                    toast(`You can only learn ${allowed} spell${allowed === 1 ? '' : 's'} at this level.`, 'error');
                    return;
                }
                const detail = await srdDetail('spells', b.dataset.spell);
                st.spells.push({
                    index: b.dataset.spell,
                    name: b.dataset.name,
                    level: detail ? (detail.level ?? 0) : 0
                });
                render();
            }));
        };

        box.addEventListener('input', draw);
        // Redraw the results for a query carried across a rebuild, otherwise
        // picking a spell would clear the list someone was working through.
        if (carried && carried.value) draw();
        if (!carried || carried.focused) box.focus();

        $$('[data-unspell]').forEach(b => b.addEventListener('click', () => {
            st.spells.splice(Number(b.dataset.unspell), 1);
            render();
        }));
    }

    // ---- Features ---------------------------------------------------------

    function stepFeatures() {
        const rows = [];
        st.levels.forEach(lvl => {
            const data = st.classByLevel[lvl];
            (data && data.features ? data.features : []).forEach(f => rows.push({ lvl, name: f.name }));
        });

        const prof = getProfBonus(st.target);
        const hpGain = st.hp.reduce((sum, e) => sum + (e.amount || 0), 0);

        return `
            <div class="review-head">
                <h3>Level ${st.start - 1 < 1 ? 1 : st.start - 1} &rarr; ${st.target}</h3>
                <p class="meta">${escapeHtml(st.c.name)} &middot; ${escapeHtml(st.c.class)}${st.subclass ? ` (${escapeHtml(st.subclass)})` : st.c.subclass ? ` (${escapeHtml(st.c.subclass)})` : ''}</p>
            </div>
            <div class="review-grid">
                <div><span class="k">Hit points</span><span class="mono v">+${hpGain}</span></div>
                <div><span class="k">Proficiency</span><span class="mono v">${formatMod(prof)}</span></div>
                <div><span class="k">Hit dice</span><span class="mono v">${st.target}d${HIT_DICE[st.c.class] || 8}</span></div>
            </div>
            ${rows.length ? `
                <div class="section-head"><span class="eyebrow">New features</span><span class="rule"></span></div>
                <div class="pick-list">
                    ${rows.map(r => `<div class="pick-row" aria-disabled="true">
                        <span class="name">${escapeHtml(r.name)}</span>
                        <span class="meta">Level ${r.lvl}</span>
                    </div>`).join('')}
                </div>`
            : '<p class="hint">No new class features at these levels. Everything else still applies.</p>'}
            ${st.asi.filter(e => e.feat).length ? `
                <div class="section-head"><span class="eyebrow">Feats</span><span class="rule"></span></div>
                <div class="chip-row">${st.asi.filter(e => e.feat).map(e =>
                    `<span class="chip is-on">${escapeHtml(e.feat)}</span>`).join('')}</div>` : ''}`;
    }

    // ========================================
    // Gating
    // ========================================

    function blocker() {
        const id = STEPS[st.step].id;
        if (id === 'hp' && st.hp.some(e => e.amount === null)) {
            return 'Choose hit points for every level.';
        }
        if (id === 'asi') {
            for (const entry of st.asi) {
                if (entry.mode === 'asi' && asiSpent(entry) !== 2) {
                    return `Spend both points for level ${entry.level}.`;
                }
                if (entry.mode === 'feat') {
                    if (!entry.feat) return `Choose a feat for level ${entry.level}.`;
                    const effect = featEffect(entry.feat);
                    if (effect && effect.type === 'ability_choice' && !entry.featAbility) {
                        return `Choose which ability ${entry.feat} raises.`;
                    }
                }
            }
        }
        if (id === 'subclass' && !st.subclass) return 'Choose a subclass.';
        return null;
    }

    // ========================================
    // Saving
    // ========================================

    // Mirrors app.js completeLevelUp. The order matters: ability scores are
    // written once after every ASI and feat has been folded in, so a character
    // taking two ASIs in one run does not get two competing updates.
    async function save() {
        const c = st.c;

        if (st.onlySubclass) {
            await db.from('characters').update({ subclass: st.subclass }).eq('id', c.id);
            await saveSubclassFeatures(c.id, c.class, st.subclass, c.level);
            return;
        }

        const scores = { ...(c.ability_scores || {}) };
        delete scores.id;
        delete scores.character_id;
        delete scores.created_at;
        delete scores.updated_at;

        let toughBonus = 0;
        let scoresTouched = false;

        for (const entry of st.asi) {
            if (entry.mode === 'feat' && entry.feat) {
                const feat = FEATS.find(f => f.name === entry.feat);
                const description = feat ? feat.description : '';
                await db.from('features_traits').insert({
                    character_id: c.id,
                    name: entry.feat,
                    description,
                    source: `Feat (Level ${entry.level})`,
                    is_bonus_action: description.toLowerCase().includes('bonus action')
                });

                // Tough is retroactive: 2 HP for every level the character has,
                // not just the ones gained in this run.
                if (entry.feat === 'Tough') toughBonus += 2 * st.target;

                const effect = featEffect(entry.feat);
                if (effect) {
                    if (effect.type === 'ability_increase' && effect.increases) {
                        for (const [long, amount] of Object.entries(effect.increases)) {
                            if (scores[long] !== undefined) {
                                scores[long] = Math.min(20, (scores[long] || 10) + amount);
                                scoresTouched = true;
                            }
                        }
                    } else if (effect.type === 'ability_choice' && entry.featAbility) {
                        const long = entry.featAbility;
                        if (scores[long] !== undefined) {
                            scores[long] = Math.min(20, (scores[long] || 10) + (effect.bonus || 1));
                            scoresTouched = true;
                        }
                    }
                    if (effect.type === 'passive_bonus' && effect.target === 'speed') {
                        await db.from('characters')
                            .update({ speed: (c.speed || 30) + (effect.value || 0) })
                            .eq('id', c.id);
                    }
                }
            } else {
                for (const [short, increase] of Object.entries(entry.abilities)) {
                    const long = ABILITY_LONG[short];
                    if (increase > 0 && scores[long] !== undefined) {
                        scores[long] = Math.min(20, (scores[long] || 10) + increase);
                        scoresTouched = true;
                    }
                }
            }
        }

        if (scoresTouched) {
            await db.from('ability_scores').update(scores).eq('character_id', c.id);
        }

        const hpGain = st.hp.reduce((sum, e) => sum + (e.amount || 0), 0) + toughBonus;
        if (hpGain) {
            await db.from('characters').update({
                hit_point_maximum: (c.hit_point_maximum || 0) + hpGain,
                current_hit_points: (c.current_hit_points || 0) + hpGain
            }).eq('id', c.id);
        }

        for (const lvl of st.levels) {
            const data = st.classByLevel[lvl];
            for (const feature of (data && data.features ? data.features : [])) {
                await saveFeatureFromAPI(c.id, feature, `Class Feature (${c.class} Level ${lvl})`);
            }
        }

        if (st.subclass) {
            await db.from('characters').update({ subclass: st.subclass }).eq('id', c.id);
        }
        const subclass = st.subclass || c.subclass;
        if (subclass) {
            for (const lvl of st.levels) {
                await saveSubclassFeatures(c.id, c.class, subclass, lvl);
            }
        }

        for (const spell of st.spells) {
            await db.from('spells').insert({
                character_id: c.id,
                name: spell.name,
                level: spell.level,
                api_index: spell.index,
                prepared: false
            });
        }

        await db.from('characters').update({
            level: st.target,
            proficiency_bonus: getProfBonus(st.target),
            hit_dice_total: `${st.target}d${HIT_DICE[c.class] || 8}`,
            hit_dice_remaining: st.target,
            pending_level_up: false
        }).eq('id', c.id);

        // The wizard owns these keys; leaving them behind would make the next
        // single level look like a multi-level jump.
        try {
            localStorage.removeItem(`targetLevel_${c.id}`);
            localStorage.removeItem(`preGrantLevel_${c.id}`);
        } catch (e) { /* private mode */ }

        const targetData = st.classByLevel[st.target];
        if (targetData && targetData.spellcasting) {
            await updateSpellSlots(c.id, targetData.spellcasting);
        }
    }

    // Features come from the SRD, which stores the text on a separate record.
    // A feature already saved under the same name is left alone so a repeated
    // level-up cannot duplicate it.
    async function saveFeatureFromAPI(charId, feature, source) {
        const { data: existing } = await db.from('features_traits')
            .select('id').eq('character_id', charId).eq('name', feature.name).maybeSingle();
        if (existing) return;

        let description = '';
        try {
            const res = await fetch(`${API}/features/${feature.index}`);
            if (res.ok) {
                const data = await res.json();
                description = Array.isArray(data.desc) ? data.desc.join('\n\n') : (data.desc || '');
            }
        } catch (e) { /* keep the name even without the text */ }

        const uses = feature.name.match(/\((\d+)\s+uses?\)/i);
        await db.from('features_traits').insert({
            character_id: charId,
            name: feature.name,
            description,
            source,
            uses_total: uses ? parseInt(uses[1], 10) : null,
            is_bonus_action: description.toLowerCase().includes('bonus action')
        });
    }

    async function saveSubclassFeatures(charId, className, subclassName, level) {
        try {
            const listRes = await fetch(`${API}/classes/${className.toLowerCase()}/subclasses`);
            if (!listRes.ok) return;
            const list = await listRes.json();
            const match = matchSubclass(list.results || [], subclassName);
            if (!match) return;   // homebrew or non-SRD subclass

            const levelRes = await fetch(`${API}/subclasses/${match.index}/levels/${level}`);
            if (!levelRes.ok) return;
            const data = await levelRes.json();
            for (const feature of (data.features || [])) {
                await saveFeatureFromAPI(charId, feature, `Subclass Feature (${subclassName} Level ${level})`);
            }
        } catch (e) { /* non-SRD subclasses have no API data */ }
    }

    // The SRD names a subclass by its distinguishing word -- "Berserker",
    // "Evocation", "Open Hand" -- where the app spells out the full title.
    // v1 compares the two for exact equality, so it finds a match for only
    // four of the twelve classes and silently saves no subclass features for
    // the rest. Fall back to matching the SRD name as a whole phrase inside
    // the chosen one, which covers "Path of the Berserker" and its kin.
    function matchSubclass(results, chosen) {
        const want = chosen.toLowerCase();
        const exact = results.find(r => r.name.toLowerCase() === want);
        if (exact) return exact;
        return results.find(r => {
            const name = r.name.toLowerCase();
            return new RegExp(`(^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(want);
        }) || null;
    }

    async function updateSpellSlots(charId, spellcasting) {
        const slots = spellcasting.spell_slots_level || {};
        for (let level = 1; level <= 9; level++) {
            const total = slots[String(level)] || 0;
            if (!total) continue;
            const { data: existing } = await db.from('spell_slots')
                .select('id').eq('character_id', charId).eq('slot_level', level).maybeSingle();
            if (existing) await db.from('spell_slots').update({ total }).eq('id', existing.id);
            else await db.from('spell_slots').insert({
                character_id: charId, slot_level: level, total, used: 0
            });
        }
    }

    // ========================================
    // Navigation and rendering
    // ========================================

    async function next() {
        if (blocker()) return;
        const steps = activeSteps();
        const at = steps.indexOf(st.step);

        if (at < steps.length - 1) {
            st.step = steps[at + 1];
            render();
            return;
        }

        st.busy = true;
        render();
        try {
            await save();
        } catch (err) {
            console.error('Level-up failed:', err);
            st.busy = false;
            render();
            toast('Could not save the level-up. Check your connection and try again.', 'error');
            return;
        }
        const done = onFinish;
        st = null;
        onFinish = null;
        closeModal();
        if (done) done();
    }

    function back() {
        const steps = activeSteps();
        const at = steps.indexOf(st.step);
        if (at <= 0) return;
        st.step = steps[at - 1];
        render();
    }

    function render() {
        if (!st) return;

        // openPanel rebuilds the dialog, so a redraw while someone is typing
        // in the spell search would drop both the caret and the query.
        const searchBox = $('#lu-spell-search');
        const carried = searchBox
            ? { value: searchBox.value, focused: document.activeElement === searchBox }
            : null;

        // ...and it drops the scroll position with them. Pressing + on the
        // level 6 improvement, which is below the fold when two levels owe
        // one, threw the dialog back to the top on every click.
        const scroller = $('#modal-host .modal');
        const scrollTop = scroller ? scroller.scrollTop : 0;

        const steps = activeSteps();
        const at = steps.indexOf(st.step);
        const last = at === steps.length - 1;
        const blocked = st.busy ? 'Working…' : blocker();

        const body = st.busy && !st.levels.length ? '<div class="skeleton"></div>' : `
            <ol class="wizard-steps" aria-label="Progress">
                ${steps.map((i, n) => `
                    <li class="${i === st.step ? 'is-current' : n < at ? 'is-done' : ''}">
                        <span class="dot">${n < at ? '&check;' : n + 1}</span>
                        <span class="label">${escapeHtml(STEPS[i].label)}</span>
                    </li>`).join('')}
            </ol>
            <div class="wizard-body" id="lu-body">${stepBody()}</div>
            ${blocked ? `<p class="wizard-blocker" role="status">${escapeHtml(blocked)}</p>` : ''}
            <div class="wizard-nav">
                <button class="btn" id="lu-back" ${at <= 0 || st.busy ? 'disabled' : ''}>Back</button>
                <button class="btn btn-accent" id="lu-next" ${blocked || st.busy ? 'disabled' : ''}>
                    ${last ? 'Finish' : 'Next'}
                </button>
            </div>`;

        openPanel({
            title: st.onlySubclass ? 'Choose a subclass'
                 : st.levels.length > 1 ? `Level up — ${st.start - 1} to ${st.target}`
                 : 'Level up',
            body,
            wide: true,
            onMount: () => {
                // Before anything else, so the dialog never flashes at the top.
                const rebuilt = $('#modal-host .modal');
                if (rebuilt && scrollTop) rebuilt.scrollTop = scrollTop;

                if (st.busy && !st.levels.length) return;
                const id = STEPS[st.step].id;
                if (id === 'hp') wireHP();
                if (id === 'asi') wireASI();
                if (id === 'subclass') wireSubclass();
                if (id === 'spells') wireSpells(carried);
                const nextBtn = $('#lu-next');
                const backBtn = $('#lu-back');
                if (nextBtn) nextBtn.addEventListener('click', next);
                if (backBtn) backBtn.addEventListener('click', back);
            }
        });
    }

    function stepBody() {
        switch (STEPS[st.step].id) {
            case 'hp':       return stepHP();
            case 'asi':      return stepASI();
            case 'subclass': return stepSubclass();
            case 'spells':   return stepSpells();
            default:         return stepFeatures();
        }
    }
})();
