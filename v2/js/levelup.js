// ========================================
// TAPHOU5E v2 — Level-up wizard
//
// Opened from the sheet when a character is owed a level or is missing a
// subclass. Multi-level aware: a DM who grants three levels at once gets
// three hit point choices and every improvement in the range, not one
// level's worth repeated.
//
// The rules are fifth edition as published in 2014, which is what the
// character data in this app has always been. The class tables come from the
// SRD API's 2014 tree, named explicitly below: the unversioned path is only an
// alias for it, and the 2024 tree beside it uses different field names.
//
// It writes the same columns the classic wizard does, so a character levelled
// in one still reads correctly in the other, but it no longer mirrors that
// code line for line -- several of the things fixed here are still wrong
// there (see the notes on spell slots, hit dice and Constitution below).
//
// Deliberately NOT used: LevelUpEngine.enhanceLevelUpCompletion. It ends in
// recalculateCharacterStats, which writes `passive_perception` -- a column
// `characters` does not have -- and recomputes armor_class from equipment,
// discarding any AC set by hand. Feat and feature effects are applied here
// straight from FeatureRegistry instead.
// ========================================

(function () {
    const API = 'https://www.dnd5eapi.co/api/2014';

    // The one feat the 2014 rules let you take more than once.
    const REPEATABLE_FEATS = new Set(['Elemental Adept']);

    // Sorcerers of this origin gain a hit point per sorcerer level.
    const DRACONIC = 'Draconic Bloodline';

    let st = null;      // wizard state; kept while the dialog is dismissed
    let onFinish = null;

    // ========================================
    // Opening
    // ========================================

    // The last level this character actually finished. Every completed
    // level-up writes hit_dice_total as "<level>d<die>" and nothing that
    // grants a level touches it, so it is the one record of how far the
    // character got that every device can read.
    function completedLevel(c) {
        const m = /^\s*(\d+)\s*d\s*\d+\s*$/i.exec(String(c.hit_dice_total || ''));
        return m ? parseInt(m[1], 10) : 0;
    }

    function stored(key) {
        try { return parseInt(localStorage.getItem(key), 10) || 0; } catch (e) { return 0; }
    }

    // Which levels this run covers. A grant only raises `level`, so the range
    // starts after the last level the character completed. That used to come
    // from localStorage alone -- written on the DM's device at grant time --
    // so a player levelling on their own phone after two grants was offered
    // only the last level, and lost the hit points and improvements of the
    // one before. The stored key is still read, as a fallback for a row whose
    // hit dice say nothing useful.
    function levelRange(c) {
        const fromExp = c.experience_points ? levelForExp(c.experience_points) : 0;
        const target = Math.min(20, Math.max(c.level, stored(`targetLevel_${c.id}`), fromExp));
        const done = completedLevel(c);
        const preGrant = stored(`preGrantLevel_${c.id}`);
        const start = done >= 1 && done < c.level ? done + 1
                    : preGrant > 0 && preGrant < c.level ? preGrant + 1
                    : c.level;
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

        // The dialog closes on a stray tap outside it. Reopening for the same
        // run picks up where it was left, rolls and all, rather than starting
        // over -- or handing out a fresh set of hit point rolls.
        if (st && !st.saved && st.c.id === character.id && st.onlySubclass === onlySubclass
               && st.start === range.start && st.target === range.target) {
            st.c = character;
            render();
            return;
        }

        st = {
            c: character,
            onlySubclass,
            start: range.start,
            target: range.target,
            levels: range.levels,
            classByLevel: {},
            srd: 'ok',          // 'ok' | 'missing' (class not in the SRD) | 'failed' (unreachable)
            step: 0,
            loading: true,
            busy: false,
            saved: false,
            hp: range.levels.map(lvl => ({ level: lvl, die: null, method: null })),
            asi: onlySubclass ? [] : range.levels
                .filter(lvl => isASILevel(character.class, lvl))
                .map(lvl => ({ level: lvl, mode: 'asi', abilities: {}, feat: null, featAbility: null })),
            needsSubclass: !character.subclass && range.levels.some(lvl => lvl >= SUBCLASS_LEVEL),
            subclass: null,
            subData: {},        // subclass name -> 'loading' | null (not in the SRD) | { levels }
            spellList: null,
            spellFilter: { level: null, classOnly: true },
            spells: [],
            done: new Set(),    // save phases already written, so a retry repeats none
            wrote: new Set()    // feature names this run has inserted
        };

        const run = st;
        render();
        await loadClassLevels();
        if (st !== run) return;   // finished or replaced while that loaded
        run.loading = false;
        run.step = firstStep();
        render();
    };

    // One request per level, because the SRD exposes features per level, plus
    // the level before the run: the spellcasting table gives totals, so what
    // a level-up adds is the difference from where the character stood.
    async function loadClassLevels() {
        if (st.onlySubclass) return;
        const run = st;
        const cls = run.c.class.toLowerCase();
        const wanted = run.levels.slice();
        if (run.start > 1) wanted.unshift(run.start - 1);

        let unreachable = false;
        await Promise.all(wanted.map(async lvl => {
            if (run.classByLevel[lvl]) return;
            try {
                const res = await fetch(`${API}/classes/${cls}/levels/${lvl}`);
                if (res.ok) run.classByLevel[lvl] = await res.json();
                else if (res.status !== 404) unreachable = true;
            } catch (e) { unreachable = true; }
        }));

        // A level that fails to load contributes no features; it must not stop
        // the level-up. But it has to be said out loud on the review step, or
        // the player finishes with nothing added and no idea why.
        const loaded = run.levels.filter(lvl => run.classByLevel[lvl]).length;
        run.srd = unreachable ? 'failed' : loaded === 0 ? 'missing' : 'ok';
    }

    // ========================================
    // Steps
    // ========================================

    const STEPS = [
        { id: 'hp',       label: 'Hit points' },
        { id: 'asi',      label: 'ASI' },
        { id: 'subclass', label: 'Subclass' },
        { id: 'spells',   label: 'Spells' },
        { id: 'review',   label: 'Review' }
    ];

    function skip(i) {
        switch (STEPS[i].id) {
            case 'hp':       return st.onlySubclass;
            case 'asi':      return st.onlySubclass || st.asi.length === 0;
            case 'subclass': return !st.needsSubclass;
            case 'spells':   { const b = spellBudget(); return b.cantrips + b.spells === 0; }
            case 'review':   return st.onlySubclass;
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

    // ---- Ability scores, as this run will leave them ----------------------

    function baseScores() {
        const stored = st.c.ability_scores || {};
        const out = {};
        ABILITIES.forEach(a => {
            const n = Number(stored[ABILITY_LONG[a]]);
            out[ABILITY_LONG[a]] = Number.isFinite(n) && n > 0 ? n : 10;
        });
        return out;
    }

    // An improvement tops out at 20, but must never pull down a score that is
    // already past it (a belt, a tome, a capstone).
    function raise(score, by) {
        return Math.max(score, Math.min(20, score + by));
    }

    function featEffect(name) {
        const registry = window.FeatureRegistry ? window.FeatureRegistry.FEAT_EFFECTS : null;
        if (!registry || !name) return null;
        return registry[name.toLowerCase().replace(/\s+/g, '-')] || null;
    }

    // What one improvement adds, as { strength: 1, ... }.
    function increasesOf(entry) {
        const out = {};
        if (entry.mode === 'feat') {
            const effect = featEffect(entry.feat);
            if (effect && effect.type === 'ability_increase' && effect.increases) {
                Object.assign(out, effect.increases);
            }
            if (effect && effect.type === 'ability_choice' && entry.featAbility) {
                out[entry.featAbility] = effect.bonus || 1;
            }
        } else {
            Object.entries(entry.abilities).forEach(([a, n]) => {
                if (n > 0) out[ABILITY_LONG[a]] = n;
            });
        }
        return out;
    }

    // Scores going into improvement `upTo`. Two improvements in one run stack:
    // the second has to see what the first did, or it will happily spend
    // points on a score the first already took to 20 and the save would
    // quietly throw them away.
    function scoresBefore(upTo) {
        const scores = baseScores();
        st.asi.slice(0, upTo).forEach(entry => {
            Object.entries(increasesOf(entry)).forEach(([long, n]) => {
                if (scores[long] !== undefined) scores[long] = raise(scores[long], n);
            });
        });
        return scores;
    }

    function finalScores() {
        return scoresBefore(st.asi.length);
    }

    // ---- Hit points ------------------------------------------------------

    function hitDie() {
        return HIT_DICE[st.c.class] || 8;
    }

    function hasFeature(name) {
        const want = name.toLowerCase();
        return (st.c.features_traits || []).some(f => (f.name || '').toLowerCase() === want);
    }

    function takingFeat(name) {
        return st.asi.some(e => e.mode === 'feat' && e.feat === name);
    }

    function conModBefore() { return getModifier(baseScores().constitution); }
    function conModAfter()  { return getModifier(finalScores().constitution); }

    // Hit points every level adds on top of the die and Constitution, for
    // things the character already has. Ones gained in this run are counted
    // once, for every level, in hpPlan.
    function perLevelBonus() {
        return (hasFeature('Tough') ? 2 : 0)
             + (st.c.class === 'Sorcerer' && st.c.subclass === DRACONIC ? 1 : 0);
    }

    function levelGain(die) {
        return Math.max(1, die + conModAfter()) + perLevelBonus();
    }

    function averageDie() {
        return Math.floor(hitDie() / 2) + 1;
    }

    // Where the hit points come from. Constitution counts for every level a
    // character has, so an improvement that raises the modifier is worth a
    // point for each level already behind them too -- the levels in this run
    // pick it up through levelGain, the earlier ones through conRetro.
    function hpPlan() {
        const rolled = st.hp.reduce((sum, e) => sum + (e.die === null ? 0 : levelGain(e.die)), 0);
        const conRetro = (conModAfter() - conModBefore()) * (st.start - 1);
        const tough = takingFeat('Tough') && !hasFeature('Tough') ? 2 * st.target : 0;
        const draconic = st.c.class === 'Sorcerer' && st.subclass === DRACONIC
                      && st.c.subclass !== DRACONIC ? st.target : 0;
        return { rolled, conRetro, tough, draconic, total: rolled + conRetro + tough + draconic };
    }

    function hpRowReadout(entry) {
        return entry.die === null ? '' : `+${levelGain(entry.die)}`;
    }

    function stepHP() {
        const avg = levelGain(averageDie());
        const multi = st.levels.length > 1;
        const d = hitDie();
        return `
            <p class="hint">${multi
                ? `Choose hit points for each of the ${st.levels.length} levels gained.`
                : 'Choose how you gain hit points this level.'}
                Take the average, roll here, or type what your own d${d} showed.
                Your Constitution modifier (${formatMod(conModAfter())}) is added for you.</p>
            ${multi ? `<button class="btn" id="lu-avg-all">Take the average for all (+${avg} each)</button>` : ''}
            <div class="ability-assign">
                ${st.hp.map((entry, i) => `
                    <div class="hp-choice-row" data-hprow="${i}">
                        <span class="mono ab">LV ${entry.level}</span>
                        <div class="hp-choice-actions">
                            <button class="btn${entry.method === 'average' ? ' btn-accent' : ''}"
                                    data-hp="${i}" data-method="average">Average +${avg}</button>
                            <button class="btn${entry.method === 'roll' ? ' btn-accent' : ''}"
                                    data-hp="${i}" data-method="roll">${
                                        entry.method === 'roll' ? `Rolled ${entry.die} &middot; again` : `Roll d${d}`}</button>
                            <input class="hp-own" type="number" inputmode="numeric" min="1" max="${d}"
                                   data-hpown="${i}" placeholder="d${d}"
                                   aria-label="What you rolled on your own d${d} for level ${entry.level}"
                                   value="${entry.method === 'manual' ? entry.die : ''}">
                        </div>
                        <span class="mono hp-gain" data-hpgain="${i}">${hpRowReadout(entry)}</span>
                    </div>`).join('')}
            </div>
            <p class="hint" id="lu-hp-total">Total gain: <strong>+${hpPlan().rolled}</strong></p>`;
    }

    function wireHP() {
        const all = $('#lu-avg-all');
        if (all) all.addEventListener('click', () => {
            st.hp.forEach(e => { e.method = 'average'; e.die = averageDie(); });
            render();
        });

        $$('[data-hp]').forEach(b => b.addEventListener('click', () => {
            const entry = st.hp[Number(b.dataset.hp)];
            if (b.dataset.method === 'average') {
                entry.method = 'average';
                entry.die = averageDie();
            } else {
                // Re-rolling is allowed: the button shows the roll, and a
                // second press rolls again rather than locking the first.
                entry.method = 'roll';
                entry.die = Math.floor(Math.random() * hitDie()) + 1;
            }
            render();
        }));

        // A roll typed in is applied in place. Rebuilding the dialog on each
        // keystroke would drop the keyboard on a phone mid-number.
        $$('[data-hpown]').forEach(input => input.addEventListener('input', () => {
            const i = Number(input.dataset.hpown);
            const entry = st.hp[i];
            const n = parseInt(input.value, 10);
            const valid = Number.isInteger(n) && n >= 1 && n <= hitDie();

            if (valid) { entry.method = 'manual'; entry.die = n; }
            else if (entry.method === 'manual' || input.value !== '') { entry.method = null; entry.die = null; }
            else return;   // emptied while another choice stands: leave it alone

            const row = input.closest('.hp-choice-row');
            $$('[data-hp]', row).forEach(b => {
                b.classList.remove('btn-accent');
                if (b.dataset.method === 'roll') b.textContent = `Roll d${hitDie()}`;
            });
            $(`[data-hpgain="${i}"]`).textContent = hpRowReadout(entry);
            $('#lu-hp-total strong').textContent = `+${hpPlan().rolled}`;
            syncNav();
        }));
    }

    // ---- Ability score improvement ---------------------------------------

    function asiSpent(entry) {
        return Object.values(entry.abilities).reduce((sum, n) => sum + n, 0);
    }

    // How many points an improvement can actually place: two, unless the
    // character is so close to 20 everywhere that fewer will fit.
    function asiBudget(i) {
        const before = scoresBefore(i);
        const room = ABILITIES.reduce((sum, a) => sum + Math.max(0, 20 - before[ABILITY_LONG[a]]), 0);
        return Math.min(2, room);
    }

    // Feats already on the sheet can't be taken again, and nor can one chosen
    // for another level in this same run. Matched on the source the wizard
    // writes, so a racial trait that shares a feat's name does not hide it.
    function featChoices(entry) {
        const owned = new Set((st.c.features_traits || [])
            .filter(f => /^feat\b/i.test(f.source || ''))
            .map(f => (f.name || '').toLowerCase()));
        const elsewhere = new Set(st.asi
            .filter(e => e !== entry && e.mode === 'feat' && e.feat)
            .map(e => e.feat));
        return FEATS.filter(f => f.name === entry.feat || REPEATABLE_FEATS.has(f.name)
            || (!owned.has(f.name.toLowerCase()) && !elsewhere.has(f.name)));
    }

    function stepASI() {
        return st.asi.map((entry, i) => {
            const before = scoresBefore(i);
            const spent = asiSpent(entry);
            const budget = asiBudget(i);
            const left = budget - spent;
            return `
            <div class="asi-block">
                ${st.asi.length > 1 ? `<div class="section-head"><span class="eyebrow">Level ${entry.level}</span><span class="rule"></span></div>` : ''}
                <div class="seg" role="tablist">
                    <button class="${entry.mode === 'asi' ? 'is-on' : ''}" data-asimode="asi" data-i="${i}">Ability scores</button>
                    <button class="${entry.mode === 'feat' ? 'is-on' : ''}" data-asimode="feat" data-i="${i}">Feat</button>
                </div>
                ${entry.mode === 'asi' ? `
                    <p class="hint">Spend ${budget === 2 ? '2 points' : budget === 1 ? '1 point' : 'no points &mdash; every score is already 20'}:
                        +2 to one score, or +1 to two. No score goes above 20.</p>
                    <div class="budget${left < 0 ? ' is-over' : ''}"><span class="mono">${left}</span> point${left === 1 ? '' : 's'} left</div>
                    <div class="ability-assign">
                        ${ABILITIES.map(a => {
                            const base = before[ABILITY_LONG[a]];
                            const added = entry.abilities[a] || 0;
                            return `
                            <div class="ability-assign-row">
                                <span class="mono ab">${a.toUpperCase()}</span>
                                <div class="stepper">
                                    <button data-asi="${i}" data-ab="${a}" data-delta="-1" ${added <= 0 ? 'disabled' : ''}
                                            aria-label="Lower ${ABILITY_FULL[a]}">&minus;</button>
                                    <span class="mono val">${base + added}</span>
                                    <button data-asi="${i}" data-ab="${a}" data-delta="1"
                                            aria-label="Raise ${ABILITY_FULL[a]}"
                                        ${left <= 0 || base + added >= 20 ? 'disabled' : ''}>+</button>
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
                            ${featChoices(entry).map(f => `<option value="${escapeHtml(f.name)}"${f.name === entry.feat ? ' selected' : ''}>${escapeHtml(f.name)}</option>`).join('')}
                        </select>
                        ${entry.feat ? `<p class="hint">${escapeHtml((FEATS.find(f => f.name === entry.feat) || {}).description || '')}</p>` : ''}
                    </div>
                    ${featAbilityPicker(entry, i)}`}
            </div>`;
        }).join('');
    }

    // Some feats raise a score the player chooses (Athlete: STR or DEX). The
    // registry says which, so the choice is offered inline.
    function featAbilityPicker(entry, i) {
        const effect = featEffect(entry.feat);
        if (!effect || effect.type !== 'ability_choice' || !effect.choices) return '';
        const before = scoresBefore(i);
        return `
            <div class="chip-row">
                ${effect.choices.map(long => {
                    const capped = before[long] >= 20;
                    return `
                    <button class="chip${entry.featAbility === long ? ' is-on' : ''}"
                            data-featab="${i}" data-ab="${escapeHtml(long)}"
                            aria-pressed="${entry.featAbility === long}" ${capped ? 'disabled' : ''}>
                        ${escapeHtml(long.charAt(0).toUpperCase() + long.slice(1))} ${
                            capped ? 'is 20' : `+${effect.bonus || 1}`}
                    </button>`;
                }).join('')}
            </div>`;
    }

    // Whether a feat's "pick an ability" still has anything left to pick.
    function featNeedsAbility(entry, i) {
        const effect = featEffect(entry.feat);
        if (!effect || effect.type !== 'ability_choice' || !effect.choices) return false;
        const before = scoresBefore(i);
        return effect.choices.some(long => before[long] < 20);
    }

    function wireASI() {
        $$('[data-asimode]').forEach(b => b.addEventListener('click', () => {
            const entry = st.asi[Number(b.dataset.i)];
            if (entry.mode === b.dataset.asimode) return;
            entry.mode = b.dataset.asimode;
            // Switching away discards the other mode's choice rather than
            // saving both, which would apply an ASI and a feat for one level.
            if (entry.mode === 'asi') { entry.feat = null; entry.featAbility = null; }
            else entry.abilities = {};
            render();
        }));

        $$('[data-asi]').forEach(b => b.addEventListener('click', () => {
            const i = Number(b.dataset.asi);
            const entry = st.asi[i];
            const a = b.dataset.ab;
            const delta = Number(b.dataset.delta);
            const next = (entry.abilities[a] || 0) + delta;
            if (next < 0) return;
            if (delta > 0 && (asiSpent(entry) >= asiBudget(i)
                           || scoresBefore(i)[ABILITY_LONG[a]] + next > 20)) return;
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

    function subclassNow() {
        return st.subclass || st.c.subclass || '';
    }

    function stepSubclass() {
        const options = SUBCLASSES[st.c.class] || [];
        return `
            <p class="hint">A ${escapeHtml(st.c.class)} chooses a subclass at level ${SUBCLASS_LEVEL}.
                Only one per class is in the free rules, so only that one has its features
                filled in for you; for any other you add them from your book.</p>
            <div class="subclass-list" role="radiogroup" aria-label="Subclass">
                ${options.map(name => `
                    <button class="subclass-row${st.subclass === name ? ' is-on' : ''}" type="button"
                            data-subclass="${escapeHtml(name)}"
                            role="radio" aria-checked="${st.subclass === name}">
                        <span class="name">${escapeHtml(name)}</span>
                        <span class="summary">${escapeHtml(subclassSummary(name) || '')}</span>
                    </button>`).join('')}
            </div>`;
    }

    function wireSubclass() {
        $$('[data-subclass]').forEach(row => row.addEventListener('click', () => {
            st.subclass = row.dataset.subclass;
            render();
        }));
    }

    // The SRD names a subclass by its distinguishing word -- "Berserker",
    // "Evocation", "Open Hand" -- where the app spells out the full title.
    // Exact equality finds a match for only four of the twelve classes, so
    // fall back to matching the SRD name as a whole phrase inside the chosen
    // one, which covers "Path of the Berserker" and its kin.
    function matchSubclass(results, chosen) {
        const want = chosen.toLowerCase();
        const exact = results.find(r => r.name.toLowerCase() === want);
        if (exact) return exact;
        return results.find(r => {
            const name = r.name.toLowerCase();
            return new RegExp(`(^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|\\s)`).test(want);
        }) || null;
    }

    // The subclass's features by level, or null when the SRD does not carry
    // it (most of them: the SRD has one subclass per class). Resolved once
    // per run, for the review step to show and the save to write.
    async function subclassData(name) {
        const run = st;
        const known = run.subData[name];
        if (known !== undefined && known !== 'loading') return known;

        let found = null;
        try {
            const listRes = await fetch(`${API}/classes/${run.c.class.toLowerCase()}/subclasses`);
            const list = listRes.ok ? await listRes.json() : {};
            const match = matchSubclass(list.results || [], name);
            if (match) {
                const levelsRes = await fetch(`${API}/subclasses/${match.index}/levels`);
                if (levelsRes.ok) {
                    const levels = await levelsRes.json();
                    found = { levels: Array.isArray(levels) ? levels : [] };
                }
            }
        } catch (e) { /* offline: treated as not available */ }

        run.subData[name] = found;
        return found;
    }

    // Which levels' subclass features this run owes. A subclass chosen now
    // brings everything it has granted so far, not only the levels being
    // gained: a Life cleric's first-level features, or level 3's for someone
    // who reached level 5 before picking.
    function subclassLevels() {
        if (!st.subclass) return st.levels;
        const out = [];
        for (let lvl = 1; lvl <= st.target; lvl++) out.push(lvl);
        return out;
    }

    function subclassFeatureRows() {
        const data = st.subData[subclassNow()];
        if (!data || data === 'loading') return [];
        const wanted = new Set(subclassLevels());
        const rows = [];
        data.levels
            .filter(l => wanted.has(l.level))
            .sort((a, b) => a.level - b.level)
            .forEach(l => (l.features || []).forEach(f => rows.push({ lvl: l.level, feature: f })));
        return rows;
    }

    // ---- Spells -----------------------------------------------------------

    function casting(level) {
        const data = st.classByLevel[level];
        return (data && data.spellcasting) || null;
    }

    // What the run adds: new cantrips, new spells, and the highest spell
    // level the character can now cast. The SRD's `cantrips_known` and
    // `spells_known` are totals for a level, so the gain is the target's
    // figure less the one for the level before the run. Counting rows on the
    // sheet instead goes wrong both ways -- cantrips were being counted
    // against spells known, and a racial or feat spell used up a slot.
    function spellBudget() {
        const none = { cantrips: 0, spells: 0, maxLevel: 0 };
        if (st.onlySubclass) return none;
        const now = casting(st.target);
        if (!now) return none;

        const prior = st.start > 1 ? casting(st.start - 1) : null;
        const priorLoaded = st.start <= 1 || !!st.classByLevel[st.start - 1];
        const owned = st.c.spells || [];

        const gain = (key, onSheet) => {
            if (typeof now[key] !== 'number') return 0;
            // Without the earlier level to compare against, fall back to what
            // is on the sheet rather than offering the whole total again.
            const before = priorLoaded ? ((prior && prior[key]) || 0) : onSheet;
            return Math.max(0, now[key] - before);
        };

        let maxLevel = 0;
        for (let n = 1; n <= 9; n++) if (now[`spell_slots_level_${n}`] > 0) maxLevel = n;

        const cantrips = gain('cantrips_known', owned.filter(s => !s.level).length);
        // Wizards have no "known" column: they copy two spells into the
        // spellbook for every wizard level gained.
        const spells = st.c.class === 'Wizard'
            ? 2 * st.levels.length
            : gain('spells_known', owned.filter(s => s.level > 0).length);

        return { cantrips, spells, maxLevel };
    }

    function chosenCount() {
        return {
            cantrips: st.spells.filter(s => s.level === 0).length,
            spells: st.spells.filter(s => s.level > 0).length
        };
    }

    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

    function stepSpells() {
        const budget = spellBudget();
        const have = chosenCount();
        const parts = [];
        if (budget.cantrips) parts.push(plural(budget.cantrips, 'new cantrip'));
        if (budget.spells) parts.push(`${plural(budget.spells, 'new spell')} of level ${budget.maxLevel} or lower`);
        const wizard = st.c.class === 'Wizard';

        const levels = [];
        if (budget.cantrips) levels.push(0);
        if (budget.spells) for (let n = 1; n <= budget.maxLevel; n++) levels.push(n);

        return `
            <p class="hint">${wizard ? 'Your spellbook gains' : 'You learn'} ${parts.join(' and ')}.
                ${wizard ? '' : budget.spells ? 'You may also swap one spell you already know for another &mdash; do that on the Spells tab afterwards.' : ''}</p>
            <div class="budget">
                ${budget.cantrips ? `<span class="mono">${have.cantrips} / ${budget.cantrips}</span> cantrip${budget.cantrips === 1 ? '' : 's'}` : ''}
                ${budget.cantrips && budget.spells ? ' &middot; ' : ''}
                ${budget.spells ? `<span class="mono">${have.spells} / ${budget.spells}</span> spell${budget.spells === 1 ? '' : 's'}` : ''}
            </div>
            ${st.spells.length ? `
                <div class="chip-row">
                    ${st.spells.map((sp, i) => `
                        <button class="chip is-on" data-unspell="${i}"
                                aria-label="Remove ${escapeHtml(sp.name)}">${escapeHtml(sp.name)} &times;</button>`).join('')}
                </div>` : ''}
            <div class="form-group">
                <label for="lu-spell-search">Find a spell</label>
                <input id="lu-spell-search" type="text" placeholder="Search by name" autocomplete="off">
            </div>
            <div class="chip-row" id="lu-spell-filters">
                ${levels.length > 1 ? levels.map(n => `
                    <button class="chip${st.spellFilter.level === n ? ' is-on' : ''}" data-spelllevel="${n}"
                            aria-pressed="${st.spellFilter.level === n}">${n === 0 ? 'Cantrips' : 'Level ' + n}</button>`).join('') : ''}
                <button class="chip${st.spellFilter.classOnly ? ' is-on' : ''}" id="lu-spell-classonly"
                        aria-pressed="${st.spellFilter.classOnly}">${escapeHtml(st.c.class)} list only</button>
            </div>
            <div id="lu-spell-results" class="pick-list"><p class="hint">Loading spells&hellip;</p></div>`;
    }

    // The class's own list (which carries each spell's level) and the whole
    // SRD index beside it, for a spell from off the list -- a bard's Magical
    // Secrets, or whatever the DM has allowed.
    async function loadSpellList() {
        const run = st;
        if (run.spellList) return run.spellList;
        let own = [];
        try {
            const res = await fetch(`${API}/classes/${run.c.class.toLowerCase()}/spells`);
            if (res.ok) own = (await res.json()).results || [];
        } catch (e) { /* fall through to the full index */ }
        let all = [];
        try { all = await srdIndex('spells'); } catch (e) { /* offline */ }
        run.spellList = { own, all };
        return run.spellList;
    }

    async function wireSpells(carried) {
        const box = $('#lu-spell-search');
        const out = $('#lu-spell-results');
        if (!box || !out) return;

        if (carried) box.value = carried.value;

        $$('[data-unspell]').forEach(b => b.addEventListener('click', () => {
            st.spells.splice(Number(b.dataset.unspell), 1);
            render();
        }));
        $$('[data-spelllevel]').forEach(b => b.addEventListener('click', () => {
            const n = Number(b.dataset.spelllevel);
            st.spellFilter.level = st.spellFilter.level === n ? null : n;
            render();
        }));
        $('#lu-spell-classonly').addEventListener('click', () => {
            st.spellFilter.classOnly = !st.spellFilter.classOnly;
            render();
        });

        const run = st;
        const lists = await loadSpellList();
        // The dialog may have been rebuilt, closed or finished while that loaded.
        if (st !== run || !document.body.contains(out)) return;

        const budget = spellBudget();
        const onSheet = new Set((st.c.spells || []).map(s => (s.api_index || s.name || '').toLowerCase()));
        const classOnly = st.spellFilter.classOnly && lists.own.length > 0;
        const pool = classOnly ? lists.own : lists.all;
        const CAP = 12;

        const draw = () => {
            const have = chosenCount();
            const q = box.value.trim().toLowerCase();
            const taken = new Set(st.spells.map(s => s.index));
            const wantLevel = st.spellFilter.level;

            const hits = pool.filter(s => {
                if (taken.has(s.index)) return false;
                if (onSheet.has(s.index) || onSheet.has(s.name.toLowerCase())) return false;
                if (q && !s.name.toLowerCase().includes(q)) return false;
                // An index without levels (an older cached one) cannot be
                // filtered by level; the level is checked when it is picked.
                if (typeof s.level !== 'number') return true;
                if (wantLevel !== null && s.level !== wantLevel) return false;
                return s.level === 0 ? budget.cantrips > 0 : budget.spells > 0 && s.level <= budget.maxLevel;
            }).sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.name.localeCompare(b.name));

            const full = s => s.level === 0 ? have.cantrips >= budget.cantrips : have.spells >= budget.spells;

            out.innerHTML = hits.length
                ? hits.slice(0, CAP).map(s => `
                    <button class="pick-row" data-spell="${escapeHtml(s.index)}" data-name="${escapeHtml(s.name)}"
                            data-level="${typeof s.level === 'number' ? s.level : ''}"
                            ${typeof s.level === 'number' && full(s) ? 'disabled' : ''}>
                        <span class="name">${escapeHtml(s.name)}</span>
                        ${typeof s.level === 'number'
                            ? `<span class="meta">${s.level === 0 ? 'Cantrip' : 'Level ' + s.level}</span>` : ''}
                    </button>`).join('')
                  + (hits.length > CAP ? `<p class="hint">${hits.length - CAP} more &mdash; search or pick a level to narrow it down.</p>` : '')
                : `<p class="hint">${q ? 'Nothing matches.' : 'Nothing left to choose from here.'}</p>`;

            $$('[data-spell]', out).forEach(b => b.addEventListener('click', async () => {
                let level = b.dataset.level === '' ? null : Number(b.dataset.level);
                if (level === null) {
                    let detail = null;
                    try { detail = await srdDetail('spells', b.dataset.spell); } catch (e) { /* offline */ }
                    level = detail && typeof detail.level === 'number' ? detail.level : 0;
                }
                const now = chosenCount();
                if (level === 0 ? now.cantrips >= budget.cantrips : now.spells >= budget.spells) {
                    toast(level === 0
                        ? (budget.cantrips ? `You have chosen all ${plural(budget.cantrips, 'cantrip')}.` : 'No new cantrips at this level.')
                        : (budget.spells ? `You have chosen all ${plural(budget.spells, 'spell')}.` : 'No new spells at this level.'), 'error');
                    return;
                }
                if (level > budget.maxLevel) {
                    toast(`That is a level ${level} spell; the highest you can cast is level ${budget.maxLevel}.`, 'error');
                    return;
                }
                if (st.spells.some(s => s.index === b.dataset.spell)) return;
                st.spells.push({ index: b.dataset.spell, name: b.dataset.name, level });
                render();
            }));
        };

        box.addEventListener('input', draw);
        draw();
        if (carried && carried.focused) box.focus();
    }

    // ---- Review -----------------------------------------------------------

    function classFeatureRows() {
        const rows = [];
        st.levels.forEach(lvl => {
            const data = st.classByLevel[lvl];
            (data && data.features ? data.features : []).forEach(f => rows.push({ lvl, feature: f }));
        });
        return rows;
    }

    function scoreChanges() {
        const before = baseScores();
        const after = finalScores();
        return ABILITIES
            .filter(a => after[ABILITY_LONG[a]] !== before[ABILITY_LONG[a]])
            .map(a => ({ a, from: before[ABILITY_LONG[a]], to: after[ABILITY_LONG[a]] }));
    }

    // Things the wizard cannot do for the player, said plainly so they are
    // not discovered three sessions later.
    function reviewNotes() {
        const notes = [];
        const c = st.c;
        const subclass = subclassNow();
        const plan = hpPlan();

        const extras = [];
        if (plan.conRetro) extras.push(`+${plan.conRetro} for your Constitution modifier going up, which counts for the ${plural(st.start - 1, 'level')} you already had`);
        if (plan.tough) extras.push(`+${plan.tough} from Tough, 2 for every level`);
        if (plan.draconic) extras.push(`+${plan.draconic} from Draconic Resilience, 1 for every level`);
        if (extras.length) notes.push(`Hit points include ${extras.join('; ')}.`);

        if (st.srd === 'failed') {
            notes.push('The rules reference could not be reached, so class features and spell slots for these levels cannot be filled in. Try again, or finish and add them by hand.');
        } else if (st.srd === 'missing') {
            notes.push(`${c.class} is not in the free rules, so its features and spell slots are not filled in. Add what these levels give you from your book: Features tab, then +.`);
        }

        if (subclass && st.subData[subclass] === null) {
            notes.push(`${subclass} is not in the free rules, so its features are not filled in. Add what it gives you at ${st.subclass ? 'each level so far' : st.levels.length > 1 ? 'these levels' : 'this level'} from your book: Features tab, then +.`);
        }

        const dexBefore = getModifier(baseScores().dexterity);
        const dexAfter = getModifier(finalScores().dexterity);
        if (dexAfter !== dexBefore) {
            notes.push('Your Dexterity modifier went up. Initiative is updated for you; Armor Class is set by hand, so check it.');
        }

        const budget = spellBudget();
        const have = chosenCount();
        const owed = [];
        if (budget.cantrips > have.cantrips) owed.push(plural(budget.cantrips - have.cantrips, 'cantrip'));
        if (budget.spells > have.spells) owed.push(plural(budget.spells - have.spells, 'spell'));
        if (owed.length) notes.push(`You still have ${owed.join(' and ')} to choose. Go back, or add them later from the Spells tab.`);

        return notes;
    }

    function stepReview() {
        const subclass = subclassNow();
        const classRows = classFeatureRows();
        const subRows = subclassFeatureRows();
        // Not asked for yet counts as loading too: the lookup starts as this
        // step mounts, a moment after this first draw.
        const subLoading = subclass
            && (st.subData[subclass] === undefined || st.subData[subclass] === 'loading');
        const rows = classRows.map(r => ({ lvl: r.lvl, name: r.feature.name, from: st.c.class }))
            .concat(subRows.map(r => ({ lvl: r.lvl, name: r.feature.name, from: subclass })))
            .sort((a, b) => a.lvl - b.lvl);

        const changes = scoreChanges();
        const feats = st.asi.filter(e => e.mode === 'feat' && e.feat);
        const notes = reviewNotes();

        return `
            <div class="review-head">
                <h3>Level ${Math.max(1, st.start - 1)} &rarr; ${st.target}</h3>
                <p class="meta">${escapeHtml(st.c.name)} &middot; ${escapeHtml(st.c.class)}${subclass ? ` (${escapeHtml(subclass)})` : ''}</p>
            </div>
            <div class="review-grid">
                <div><span class="k">Hit points</span><span class="mono v">+${hpPlan().total}</span></div>
                <div><span class="k">Proficiency</span><span class="mono v">${formatMod(getProfBonus(st.target))}</span></div>
                <div><span class="k">Hit dice</span><span class="mono v">${st.target}d${hitDie()}</span></div>
            </div>
            ${changes.length ? `
                <div class="section-head"><span class="eyebrow">Ability scores</span><span class="rule"></span></div>
                <div class="chip-row">${changes.map(ch =>
                    `<span class="chip is-on">${ch.a.toUpperCase()} ${ch.from} &rarr; ${ch.to}</span>`).join('')}</div>` : ''}
            ${feats.length ? `
                <div class="section-head"><span class="eyebrow">Feats</span><span class="rule"></span></div>
                <div class="chip-row">${feats.map(e =>
                    `<span class="chip is-on">${escapeHtml(e.feat)}</span>`).join('')}</div>` : ''}
            ${st.spells.length ? `
                <div class="section-head"><span class="eyebrow">Spells</span><span class="rule"></span></div>
                <div class="chip-row">${st.spells.map(sp =>
                    `<span class="chip is-on">${escapeHtml(sp.name)}</span>`).join('')}</div>` : ''}
            <div class="section-head"><span class="eyebrow">New features</span><span class="rule"></span></div>
            ${rows.length ? `
                <div class="pick-list">
                    ${rows.map(r => `<div class="pick-row" aria-disabled="true">
                        <span class="name">${escapeHtml(r.name)}</span>
                        <span class="meta">${escapeHtml(r.from)} &middot; level ${r.lvl}</span>
                    </div>`).join('')}
                </div>`
            : `<p class="hint">${st.srd === 'ok'
                ? 'No new class features at these levels. Everything else still applies.'
                : 'None could be filled in &mdash; see below.'}</p>`}
            ${subLoading ? '<p class="hint">Looking up subclass features&hellip;</p>' : ''}
            ${notes.length ? `
                <div class="section-head"><span class="eyebrow">Worth knowing</span><span class="rule"></span></div>
                <ul class="review-notes">${notes.map(n => `<li>${escapeHtml(n)}</li>`).join('')}</ul>` : ''}
            ${st.srd === 'failed' ? '<button class="btn" id="lu-retry-srd">Try the rules reference again</button>' : ''}`;
    }

    function wireReview() {
        const retry = $('#lu-retry-srd');
        if (retry) retry.addEventListener('click', async () => {
            const run = st;
            retry.disabled = true;
            retry.textContent = 'Trying…';
            await loadClassLevels();
            if (st === run) render();
        });

        // Subclass features are looked up when the review first needs them,
        // then the step redraws with them in the list.
        const subclass = subclassNow();
        if (subclass && st.subData[subclass] === undefined) {
            const run = st;
            run.subData[subclass] = 'loading';
            subclassData(subclass).then(() => {
                if (st === run && STEPS[run.step].id === 'review' && !run.busy) render();
            });
        }
    }

    // ========================================
    // Gating
    // ========================================

    function blocker() {
        const id = STEPS[st.step].id;
        if (id === 'hp' && st.hp.some(e => e.die === null)) {
            return st.hp.length > 1 ? 'Choose hit points for every level.' : 'Choose your hit points.';
        }
        if (id === 'asi') {
            for (let i = 0; i < st.asi.length; i++) {
                const entry = st.asi[i];
                const before = scoresBefore(i);
                if (entry.mode === 'asi') {
                    const over = Object.keys(entry.abilities)
                        .find(a => before[ABILITY_LONG[a]] + entry.abilities[a] > 20);
                    if (over) return `Level ${entry.level}: ${ABILITY_FULL[over]} cannot go above 20. Move those points elsewhere.`;
                    const budget = asiBudget(i);
                    const spent = asiSpent(entry);
                    if (spent > budget) return `Level ${entry.level}: only ${plural(budget, 'point')} will fit. Take some back.`;
                    if (spent < budget) {
                        return budget === 2 && spent === 0
                            ? `Spend both points for level ${entry.level}, or take a feat instead.`
                            : `Spend the last point for level ${entry.level}.`;
                    }
                } else {
                    if (!entry.feat) return `Choose a feat for level ${entry.level}.`;
                    if (entry.featAbility && before[entry.featAbility] >= 20) {
                        return `${ABILITY_FULL[shortOf(entry.featAbility)]} is already 20. Pick another ability for ${entry.feat}.`;
                    }
                    if (!entry.featAbility && featNeedsAbility(entry, i)) {
                        return `Choose which ability ${entry.feat} raises.`;
                    }
                }
            }
        }
        if (id === 'subclass' && !st.subclass) return 'Choose a subclass.';
        return null;
    }

    function shortOf(long) {
        return ABILITIES.find(a => ABILITY_LONG[a] === long) || long;
    }

    // ========================================
    // Saving
    // ========================================

    // Supabase reports a refused write in its return value; it does not
    // throw. Unchecked, a level-up the database turned down still closed the
    // dialog as though it had worked.
    async function must(query) {
        const { error } = await query;
        if (error) throw error;
    }

    // Each phase runs once per wizard run. If a later write fails and the
    // player presses Finish again, the phases that already landed are not
    // repeated -- no second copy of a feat, no spells added twice.
    async function once(phase, work) {
        if (st.done.has(phase)) return;
        await work();
        st.done.add(phase);
    }

    // The order matters. Everything that can be repeated safely goes first;
    // the character row is written last, in a single update, because that is
    // the write that clears the pending flag. A failure before it leaves the
    // level still owed and nothing counted twice.
    async function save() {
        const c = st.c;

        if (st.onlySubclass) {
            await once('subclass', () => must(
                db.from('characters').update({ subclass: st.subclass }).eq('id', c.id)));
            await once('subclass-features', () => saveSubclassFeatures());
            return;
        }

        const before = baseScores();
        const after = finalScores();

        await once('scores', async () => {
            const changed = {};
            Object.keys(after).forEach(long => {
                if (after[long] !== before[long]) changed[long] = after[long];
            });
            if (Object.keys(changed).length) {
                await must(db.from('ability_scores').update(changed).eq('character_id', c.id));
            }
        });

        await once('feats', async () => {
            for (const entry of st.asi) {
                if (entry.mode !== 'feat' || !entry.feat) continue;
                const feat = FEATS.find(f => f.name === entry.feat);
                const description = feat ? feat.description : '';
                const effect = featEffect(entry.feat);
                const row = {
                    character_id: c.id,
                    name: entry.feat,
                    description,
                    source: `Feat (Level ${entry.level})`,
                    is_bonus_action: description.toLowerCase().includes('bonus action')
                };
                // Lucky's three points and the like: a counter on the sheet
                // that rests know how to refill.
                if (effect && effect.type === 'usable_feature' && effect.uses > 0) {
                    row.uses_total = effect.uses;
                    row.uses_remaining = effect.uses;
                    if (effect.recharge === 'short' || effect.recharge === 'long') row.uses_per_rest = effect.recharge;
                }
                await must(db.from('features_traits').insert(row));

                // Resilient: proficiency in the save of the ability it raised.
                if (effect && effect.extra && effect.extra.type === 'save_proficiency' && entry.featAbility) {
                    await grantSaveProficiency(shortOf(entry.featAbility));
                }
            }
        });

        await once('features', async () => {
            for (const row of classFeatureRows()) {
                await saveFeature(row.feature, `Class Feature (${c.class} Level ${row.lvl})`);
            }
        });

        await once('subclass-features', () => saveSubclassFeatures());

        await once('spells', async () => {
            for (const spell of st.spells) {
                let detail = null;
                try { detail = await srdDetail('spells', spell.index); } catch (e) { /* name and level still go in */ }
                detail = detail || {};
                await must(db.from('spells').insert({
                    character_id: c.id,
                    name: spell.name,
                    level: spell.level,
                    school: (detail.school || {}).name || null,
                    casting_time: detail.casting_time || null,
                    range: detail.range || null,
                    components: Array.isArray(detail.components) ? detail.components.join(', ') : null,
                    duration: detail.duration || null,
                    description: srdText(detail.desc) || null,
                    api_index: spell.index,
                    // A wizard's new spells go in the book and are prepared
                    // from there. For everyone else a spell known is a spell
                    // ready to cast, and cantrips always are.
                    prepared: spell.level === 0 || c.class !== 'Wizard'
                }));
            }
        });

        await once('slots', async () => {
            const now = casting(st.target);
            if (now) await updateSpellSlots(c, now);
        });

        // Built once and kept. These are totals worked out from the character
        // as the wizard found it, so if this write has to be sent again it
        // must carry the same numbers -- not be recomputed from a sheet that
        // may have moved on in the meantime and add the hit points twice.
        if (!st.finalUpdate) st.finalUpdate = characterUpdate(before, after);
        await once('character', () => must(
            db.from('characters').update(st.finalUpdate).eq('id', c.id)));

        // The wizard owns these keys; leaving them behind would make the next
        // single level look like a multi-level jump.
        try {
            localStorage.removeItem(`targetLevel_${c.id}`);
            localStorage.removeItem(`preGrantLevel_${c.id}`);
        } catch (e) { /* private mode */ }
    }

    function characterUpdate(before, after) {
        const c = st.c;
        const plan = hpPlan();
        const update = {
            level: st.target,
            proficiency_bonus: getProfBonus(st.target),
            hit_dice_total: `${st.target}d${hitDie()}`,
            // One new hit die per level gained. Spent ones stay spent:
            // levelling up is not a rest.
            hit_dice_remaining: Math.min(st.target,
                (c.hit_dice_remaining ?? st.start - 1) + st.levels.length),
            pending_level_up: false
        };
        if (plan.total) {
            update.hit_point_maximum = (c.hit_point_maximum || 0) + plan.total;
            update.current_hit_points = (c.current_hit_points || 0) + plan.total;
        }
        if (st.subclass) update.subclass = st.subclass;

        let speed = 0;
        let initiative = getModifier(after.dexterity) - getModifier(before.dexterity);
        st.asi.forEach(entry => {
            const effect = entry.mode === 'feat' ? featEffect(entry.feat) : null;
            if (!effect || effect.type !== 'passive_bonus') return;
            if (effect.target === 'speed') speed += effect.value || 0;
            if (effect.target === 'initiative_bonus') initiative += effect.value || 0;
        });
        if (speed) update.speed = (c.speed || 30) + speed;
        // The sheet shows the stored initiative bonus, so it has to move
        // with Dexterity or it goes stale the moment the score changes.
        if (initiative) {
            update.initiative_bonus = (c.initiative_bonus ?? getModifier(before.dexterity)) + initiative;
        }
        return update;
    }

    async function grantSaveProficiency(short) {
        const c = st.c;
        const rows = Array.isArray(c.saving_throws) ? c.saving_throws : null;
        if (rows && !rows.some(r => r.ability === short)) {
            await must(db.from('saving_throws').insert({ character_id: c.id, ability: short, proficient: true }));
        } else {
            await must(db.from('saving_throws').update({ proficient: true })
                .eq('character_id', c.id).eq('ability', short));
        }
    }

    // A feature already on the sheet under the same name is left alone, so a
    // repeated level-up cannot duplicate it. The sheet's own copy of the list
    // is what is checked, plus whatever this run has written so far.
    function featureKnown(name) {
        return st.wrote.has((name || '').toLowerCase()) || hasFeature(name || '');
    }

    // Features come from the SRD, which stores the text on a separate record.
    async function saveFeature(feature, source) {
        if (featureKnown(feature.name)) return;

        let description = '';
        try {
            const res = await fetch(`${API}/features/${feature.index}`);
            if (res.ok) description = srdText((await res.json()).desc);
        } catch (e) { /* keep the name even without the text */ }

        const row = {
            character_id: st.c.id,
            name: feature.name,
            description,
            source,
            is_bonus_action: description.toLowerCase().includes('bonus action')
        };

        // A feature with charges gets a counter that starts full, and says
        // which rest refills it where the registry knows. Without the last
        // two it showed as already spent and no rest ever brought it back.
        const named = feature.name.match(/\((\d+)\s+uses?\)/i);
        const effects = window.FeatureRegistry ? window.FeatureRegistry.FEATURE_EFFECTS : {};
        const effect = effects[feature.index];
        const fixed = effect && effect.type === 'usable_feature' && effect.uses > 0 ? effect.uses : null;
        const uses = fixed || (named ? parseInt(named[1], 10) : null);
        if (uses) {
            row.uses_total = uses;
            row.uses_remaining = uses;
            if (effect && (effect.recharge === 'short' || effect.recharge === 'long')) {
                row.uses_per_rest = effect.recharge;
            }
        }

        await must(db.from('features_traits').insert(row));
        st.wrote.add(feature.name.toLowerCase());
    }

    async function saveSubclassFeatures() {
        const subclass = subclassNow();
        if (!subclass) return;
        const data = await subclassData(subclass);
        if (!data) return;   // homebrew or non-SRD subclass: nothing to fetch
        for (const row of subclassFeatureRows()) {
            await saveFeature(row.feature, `Subclass Feature (${subclass} Level ${row.lvl})`);
        }
    }

    // The SRD gives one figure per slot level: spell_slots_level_1 to _9.
    // (This read `spell_slots_level` as a single object, which the API has
    // never sent, so no level-up ever wrote a slot.)
    async function updateSpellSlots(c, spellcasting) {
        let rows = c.spell_slots;
        if (!Array.isArray(rows)) {
            const { data, error } = await db.from('spell_slots')
                .select('id, slot_level, total, used').eq('character_id', c.id);
            if (error) throw error;
            rows = data || [];
        }

        for (let level = 1; level <= 9; level++) {
            const total = spellcasting[`spell_slots_level_${level}`] || 0;
            const existing = rows.find(r => r.slot_level === level);
            if (total > 0) {
                if (!existing) {
                    await must(db.from('spell_slots').insert({
                        character_id: c.id, slot_level: level, total, used: 0
                    }));
                } else if (existing.total !== total) {
                    await must(db.from('spell_slots')
                        .update({ total, used: Math.min(existing.used || 0, total) })
                        .eq('id', existing.id));
                }
            } else if (existing && c.class === 'Warlock') {
                // Pact Magic trades its slots up: a level 3 warlock has two
                // 2nd-level slots and no 1st-level ones. Every other class
                // only ever gains, so their rows are left alone.
                await must(db.from('spell_slots').delete().eq('id', existing.id));
            }
        }
    }

    // ========================================
    // Navigation and rendering
    // ========================================

    async function next() {
        if (st.busy || blocker()) return;
        const steps = activeSteps();
        const at = steps.indexOf(st.step);

        if (at < steps.length - 1) {
            st.step = steps[at + 1];
            render(true);
            return;
        }

        const run = st;
        run.busy = true;
        render();
        try {
            await save();
        } catch (err) {
            console.error('Level-up failed:', err);
            run.busy = false;
            if (st === run) render();
            toast('Could not save the level-up. Nothing is lost: check your connection and press Finish again.', 'error');
            return;
        }
        run.saved = true;
        const done = onFinish;
        st = null;
        onFinish = null;
        closeModal();
        if (done) done();
    }

    function back() {
        if (st.busy) return;
        const steps = activeSteps();
        const at = steps.indexOf(st.step);
        if (at <= 0) return;
        st.step = steps[at - 1];
        render(true);
    }

    // The footer, updated in place where a step changes state without a
    // rebuild (typing a hit point roll).
    function syncNav() {
        const blocked = blocker();
        const note = $('#lu-blocker');
        if (note) { note.textContent = blocked || ''; note.hidden = !blocked; }
        const nextBtn = $('#lu-next');
        if (nextBtn) nextBtn.disabled = !!blocked;
    }

    function render(newStep) {
        if (!st) return;

        // openPanel rebuilds the dialog, so a redraw while someone is typing
        // in the spell search would drop both the caret and the query.
        const searchBox = $('#lu-spell-search');
        const carried = searchBox
            ? { value: searchBox.value, focused: document.activeElement === searchBox }
            : null;

        // ...and it drops the scroll position with them. Pressing + on the
        // level 6 improvement, which is below the fold when two levels owe
        // one, threw the dialog back to the top on every click. A new step
        // starts at its top, though.
        const scroller = $('#modal-host .modal');
        const scrollTop = scroller && !newStep ? scroller.scrollTop : 0;

        const steps = activeSteps();
        const at = steps.indexOf(st.step);
        const last = at === steps.length - 1;
        const blocked = st.busy || st.loading ? null : blocker();

        const body = st.loading ? '<div class="skeleton"></div>' : `
            <ol class="wizard-steps" aria-label="Progress">
                ${steps.map((i, n) => `
                    <li class="${i === st.step ? 'is-current' : n < at ? 'is-done' : ''}">
                        <span class="dot">${n < at ? '&check;' : n + 1}</span>
                        <span class="label">${escapeHtml(STEPS[i].label)}</span>
                    </li>`).join('')}
            </ol>
            <div class="wizard-body" id="lu-body">${stepBody()}</div>
            <p class="wizard-blocker" id="lu-blocker" role="status" ${blocked ? '' : 'hidden'}>${escapeHtml(blocked || '')}</p>
            <div class="wizard-nav">
                <button class="btn" id="lu-back" ${at <= 0 || st.busy ? 'disabled' : ''}>Back</button>
                <button class="btn btn-accent" id="lu-next" ${blocked || st.busy ? 'disabled' : ''}>
                    ${st.busy ? 'Saving…' : last ? 'Finish' : 'Next'}
                </button>
            </div>`;

        openPanel({
            title: st.onlySubclass ? 'Choose a subclass'
                 : st.levels.length > 1 ? `Level up — ${st.start - 1} to ${st.target}`
                 : `Level up to ${st.target}`,
            body,
            wide: true,
            onMount: () => {
                // Before anything else, so the dialog never flashes at the top.
                const rebuilt = $('#modal-host .modal');
                if (rebuilt && scrollTop) rebuilt.scrollTop = scrollTop;

                if (st.loading) return;
                const id = STEPS[st.step].id;
                if (id === 'hp') wireHP();
                if (id === 'asi') wireASI();
                if (id === 'subclass') wireSubclass();
                if (id === 'spells') wireSpells(newStep ? null : carried);
                if (id === 'review') wireReview();
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
            default:         return stepReview();
        }
    }
})();
