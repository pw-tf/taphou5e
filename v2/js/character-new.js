// ========================================
// TAPHOU5E v2 — Character creation wizard
//
// v1 creates a character from one long form. That form is fine on a desktop
// and miserable on a phone, so v2 walks the same fields in four steps, each
// of which fits a 390px screen without scrolling past its own controls.
//
// The rules are not reimplemented here. Everything that derives a number from
// a choice -- racial bonuses, saving throw proficiencies, speed, starting hit
// points -- is handed to `LevelUpEngine.enhanceCharacterCreation`, the same
// shared file v1 calls. This file collects choices and writes the rows the
// sheet expects; the engine decides what they mean.
// ========================================

(function () {
    if (!requireSession()) return;

    // Ids rather than positions: inserting a step used to mean renumbering
    // every branch that mentioned one, which is how a step gets missed.
    const STEPS = [
        { id: 'identity',  label: 'Identity' },
        { id: 'abilities', label: 'Abilities' },
        { id: 'gear',      label: 'Gear' },
        { id: 'review',    label: 'Review' },
        { id: 'campaign',  label: 'Campaign' }
    ];
    const stepId = () => STEPS[state.step].id;
    const stepIndex = id => STEPS.findIndex(x => x.id === id);

    const state = {
        step: 0,
        saving: false,
        // Identity
        name: '', playerName: '', race: 'Human', cls: 'Fighter',
        subclass: '', background: 'Acolyte', alignment: 'True Neutral', level: 1,
        // Abilities
        method: 'standard',                       // standard | pointbuy | roll | manual
        scores: { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 },
        arraySlots: {},                           // ability -> index into STANDARD_ARRAY
        rolled: null,                             // the six rolls, once rolled
        halfElf: [],                              // two long ability names
        // Gear
        takeKit: true,                            // start with the class kit
        // Campaign
        campaigns: [],
        campaignId: '',
        createdId: null,
        levelled: false                           // the level-up wizard finished
    };

    // ---- Step gating ---------------------------------------------------

    // Each step says what is missing rather than silently disabling Next, so
    // a blocked wizard always explains itself.
    function blockers() {
        if (stepId() === 'identity') {
            if (!state.name.trim()) return 'Give the character a name.';
            if (!state.playerName.trim()) return 'Say who is playing them.';
            if (state.level === null) return 'Give them a level between 1 and 20.';
            if (state.level < 1 || state.level > 20) return 'Level must be between 1 and 20.';
            return null;
        }
        if (stepId() === 'abilities') {
            if (state.method === 'standard') {
                const used = Object.values(state.arraySlots).filter(v => v !== undefined && v !== '');
                if (used.length < 6) return 'Assign all six numbers from the array.';
            }
            if (state.method === 'pointbuy' && pointBuyRemaining(state.scores) < 0) {
                return 'You are over the 27 point budget.';
            }
            if (state.race === 'Half-Elf' && state.halfElf.length !== 2) {
                return 'Choose the two abilities your Half-Elf raises.';
            }
            return null;
        }
        return null;
    }

    // ---- Derived values --------------------------------------------------

    // The scores as the sheet will store them: what was chosen plus race.
    function finalScores() {
        return withRacialBonuses(state.scores, state.race, state.halfElf);
    }

    // The engine and the ability_scores table both key by the long names.
    function withLongKeys(scores) {
        const out = {};
        ABILITIES.forEach(a => out[ABILITY_LONG[a]] = scores[a]);
        return out;
    }

    function derived() {
        const level = clampLevel(state.level);
        const final = finalScores();
        const conMod = getModifier(final.con);
        return {
            final,
            level,
            // What the row starts at. Levels above the first are the wizard's
            // to add, so writing the target level's total here would have them
            // counted twice -- once now and once per level in the wizard.
            hpAtOne: calcHP(state.cls, 1, conMod),
            hp: calcHP(state.cls, level, conMod),
            ac: 10 + getModifier(final.dex),
            initiative: getModifier(final.dex),
            speed: (window.LevelUpEngine && window.LevelUpEngine.RACIAL_SPEED[state.race]) || 30,
            profBonus: getProfBonus(level),
            saves: (window.LevelUpEngine && window.LevelUpEngine.CLASS_SAVING_THROWS[state.cls]) || []
        };
    }

    // ---- Rendering: chrome ----------------------------------------------

    function progress() {
        return `
            <ol class="wizard-steps" aria-label="Progress">
                ${STEPS.map((step, i) => `
                    <li class="${i === state.step ? 'is-current' : i < state.step ? 'is-done' : ''}">
                        <span class="dot">${i < state.step ? '&check;' : i + 1}</span>
                        <span class="label">${escapeHtml(step.label)}</span>
                    </li>`).join('')}
            </ol>`;
    }

    function footer() {
        const last = state.step === STEPS.length - 1;
        const blocked = blockers();
        return `
            <p class="wizard-blocker" role="status"${blocked ? '' : ' hidden'}>${escapeHtml(blocked || '')}</p>
            <div class="wizard-nav">
                <button class="btn" id="wz-back" ${state.step === 0 ? 'disabled' : ''}>Back</button>
                <button class="btn btn-accent" id="wz-next" ${blocked || state.saving ? 'disabled' : ''}>
                    ${state.saving ? 'Creating&hellip;'
                        : last ? 'Finish'
                        : stepId() === 'review' ? 'Create character' : 'Next'}
                </button>
            </div>`;
    }

    function selectField(id, label, options, value, hint) {
        return `
            <div class="form-group">
                <label for="${id}">${escapeHtml(label)}</label>
                <select id="${id}">
                    ${options.map(o => `<option value="${escapeHtml(o)}"${o === value ? ' selected' : ''}>${escapeHtml(o)}</option>`).join('')}
                </select>
                ${hint ? `<p class="hint" id="${id}-hint">${hint}</p>` : ''}
            </div>`;
    }

    // ---- Step 1: identity ------------------------------------------------

    function stepIdentity() {
        return `
            <div class="form-group">
                <label for="wz-name">Character name</label>
                <input id="wz-name" type="text" value="${escapeHtml(state.name)}" placeholder="Elowen Thorne" autocomplete="off">
            </div>
            <div class="form-group">
                <label for="wz-player">Player</label>
                <input id="wz-player" type="text" value="${escapeHtml(state.playerName)}" placeholder="Who is running them" autocomplete="off">
            </div>
            <div class="form-row">
                ${selectField('wz-race', 'Race', RACES, state.race, escapeHtml(racialBonusSummary(state.race)))}
                ${selectField('wz-class', 'Class', CLASSES, state.cls,
                    `Hit die d${HIT_DICE[state.cls] || 8}`)}
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label for="wz-level">Level</label>
                    <input id="wz-level" type="number" min="1" max="20" inputmode="numeric"
                           value="${state.level === null ? '' : state.level}">
                </div>
                <div class="form-group">
                    <label for="wz-subclass">Subclass</label>
                    <input id="wz-subclass" type="text" value="${escapeHtml(state.subclass)}" placeholder="Optional" autocomplete="off">
                    <p class="hint">Chosen at level ${SUBCLASS_LEVEL}; leave blank and the sheet will ask.</p>
                </div>
            </div>
            <div class="form-row">
                ${selectField('wz-background', 'Background', BACKGROUNDS, state.background)}
                ${selectField('wz-alignment', 'Alignment', ALIGNMENTS, state.alignment)}
            </div>`;
    }

    // Redrawing on a keystroke is the one thing this must never do: render()
    // replaces document.body, which destroys the focused field and closes the
    // keyboard mid-word. Only the two selects redraw, because changing a
    // select has already taken focus off it and their hints have to update.
    function wireIdentity() {
        const bind = (id, key) => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('input', () => {
                state[key] = el.value;
                refreshGate();
            });
        };
        bind('#wz-name', 'name');
        bind('#wz-player', 'playerName');
        bind('#wz-subclass', 'subclass');

        [['#wz-race', 'race'], ['#wz-class', 'cls'],
         ['#wz-background', 'background'], ['#wz-alignment', 'alignment']].forEach(([id, key]) => {
            const el = $(id);
            if (!el) return;
            el.addEventListener('change', () => {
                state[key] = el.value;
                // Race and class drive the hints under them and the scores on
                // the next step, so these do need the redraw.
                if (id === '#wz-race' || id === '#wz-class') render();
                else refreshGate();
            });
        });

        // Level is a number field, so it gets neither the redraw nor a clamp
        // on every keystroke: clamping as you type makes a two-digit level
        // impossible to enter, because clearing the field to retype it snaps
        // straight back to 1. It is held as typed and tidied on the way out.
        const level = $('#wz-level');
        if (level) {
            level.addEventListener('input', () => {
                const parsed = parseInt(level.value, 10);
                state.level = Number.isFinite(parsed) ? parsed : null;
                refreshGate();
            });
            level.addEventListener('blur', () => {
                state.level = clampLevel(state.level);
                level.value = state.level;
                refreshGate();
            });
        }
    }

    function clampLevel(value) {
        const parsed = parseInt(value, 10);
        return Number.isFinite(parsed) ? Math.max(1, Math.min(20, parsed)) : 1;
    }

    // Update the one thing a keystroke can change without a redraw.
    function refreshGate() {
        const blocked = blockers();
        const button = $('#wz-next');
        if (button) button.disabled = !!blocked || state.saving;

        const note = $('.wizard-blocker');
        if (note) {
            note.textContent = blocked || '';
            note.hidden = !blocked;
        }
    }

    // ---- Step 2: abilities -----------------------------------------------

    const METHODS = [
        { id: 'standard', label: 'Standard array', blurb: '15 14 13 12 10 8, assigned as you like' },
        { id: 'pointbuy', label: 'Point buy',      blurb: '27 points, nothing below 8 or above 15' },
        { id: 'roll',     label: 'Roll 4d6',       blurb: 'Drop the lowest die, six times' },
        { id: 'manual',   label: 'Type them in',   blurb: 'Whatever your table already agreed' }
    ];

    function abilityRow(a) {
        const base = state.scores[a];
        const bonus = finalScores()[a] - base;
        const mod = getModifier(base + bonus);
        return { base, bonus, mod };
    }

    function stepAbilities() {
        const methodPicker = `
            <div class="method-grid" role="radiogroup" aria-label="Ability score method">
                ${METHODS.map(m => `
                    <button class="method-tile${state.method === m.id ? ' is-on' : ''}"
                            role="radio" aria-checked="${state.method === m.id}" data-method="${m.id}">
                        <span class="title">${escapeHtml(m.label)}</span>
                        <span class="blurb">${escapeHtml(m.blurb)}</span>
                    </button>`).join('')}
            </div>`;

        let body = '';

        if (state.method === 'standard') {
            const taken = new Set(Object.entries(state.arraySlots)
                .filter(([, v]) => v !== undefined && v !== '')
                .map(([, v]) => String(v)));
            body = `
                <p class="hint">Each number is used once. Picking one frees whatever it replaces.</p>
                <div class="ability-assign">
                    ${ABILITIES.map(a => {
                        const chosen = state.arraySlots[a];
                        return `
                        <div class="ability-assign-row">
                            <span class="mono ab">${a.toUpperCase()}</span>
                            <select data-array="${a}" aria-label="${escapeHtml(ABILITY_FULL[a])}">
                                <option value="">&mdash;</option>
                                ${STANDARD_ARRAY.map((n, i) => `
                                    <option value="${i}"${String(i) === String(chosen) ? ' selected' : ''}
                                        ${taken.has(String(i)) && String(i) !== String(chosen) ? ' disabled' : ''}>${n}</option>`).join('')}
                            </select>
                            ${scoreReadout(a)}
                        </div>`;
                    }).join('')}
                </div>`;
        } else if (state.method === 'pointbuy') {
            const left = pointBuyRemaining(state.scores);
            body = `
                <div class="budget ${left < 0 ? 'is-over' : ''}">
                    <span class="mono">${left}</span> point${left === 1 ? '' : 's'} left of ${POINT_BUY_BUDGET}
                </div>
                <div class="ability-assign">
                    ${ABILITIES.map(a => `
                        <div class="ability-assign-row">
                            <span class="mono ab">${a.toUpperCase()}</span>
                            <div class="stepper">
                                <button data-buy="${a}" data-delta="-1" aria-label="Lower ${escapeHtml(ABILITY_FULL[a])}"
                                    ${pointBuyCanChange(state.scores, a, -1) ? '' : 'disabled'}>&minus;</button>
                                <span class="mono val">${state.scores[a]}</span>
                                <button data-buy="${a}" data-delta="1" aria-label="Raise ${escapeHtml(ABILITY_FULL[a])}"
                                    ${pointBuyCanChange(state.scores, a, 1) ? '' : 'disabled'}>+</button>
                            </div>
                            ${scoreReadout(a)}
                        </div>`).join('')}
                </div>`;
        } else {
            body = `
                ${state.method === 'roll'
                    ? `<button class="btn" id="wz-roll">Roll 4d6, drop the lowest</button>
                       ${state.rolled ? `<p class="hint">Rolled ${state.rolled.join(', ')}. Roll again or edit below.</p>` : ''}`
                    : ''}
                <div class="ability-assign">
                    ${ABILITIES.map(a => `
                        <div class="ability-assign-row">
                            <span class="mono ab">${a.toUpperCase()}</span>
                            <input type="number" min="1" max="30" data-manual="${a}" value="${state.scores[a]}">
                            ${scoreReadout(a)}
                        </div>`).join('')}
                </div>`;
        }

        const halfElf = state.race !== 'Half-Elf' ? '' : `
            <div class="section-head"><span class="eyebrow">Half-Elf</span><span class="rule"></span></div>
            <p class="hint">A Half-Elf raises two abilities other than Charisma by +1. v1 never asked; this does.</p>
            <div class="chip-row">
                ${ABILITIES.filter(a => a !== 'cha').map(a => `
                    <button class="chip${state.halfElf.includes(ABILITY_LONG[a]) ? ' is-on' : ''}"
                            data-halfelf="${ABILITY_LONG[a]}" aria-pressed="${state.halfElf.includes(ABILITY_LONG[a])}">
                        ${escapeHtml(ABILITY_FULL[a])}
                    </button>`).join('')}
            </div>`;

        return methodPicker + body + halfElf;
    }

    // Base, then what the race adds, then the modifier the sheet will show.
    function scoreReadout(a) {
        const { base, bonus, mod } = abilityRow(a);
        return `
            <span class="score-readout">
                ${bonus ? `<span class="racial">+${bonus}</span>` : ''}
                <span class="mono total">${base + bonus}</span>
                <span class="mod">${formatMod(mod)}</span>
            </span>`;
    }

    function wireAbilities() {
        $$('[data-method]').forEach(b => b.addEventListener('click', () => {
            state.method = b.dataset.method;
            // Each method starts from its own baseline rather than inheriting
            // the last one's numbers, which would quietly break point buy.
            if (state.method === 'pointbuy') {
                ABILITIES.forEach(a => state.scores[a] = 8);
            } else if (state.method === 'standard') {
                state.arraySlots = {};
                ABILITIES.forEach(a => state.scores[a] = 10);
            }
            render();
        }));

        $$('[data-array]').forEach(sel => sel.addEventListener('change', () => {
            const a = sel.dataset.array;
            if (sel.value === '') delete state.arraySlots[a];
            else state.arraySlots[a] = sel.value;
            ABILITIES.forEach(ab => {
                const idx = state.arraySlots[ab];
                state.scores[ab] = idx === undefined || idx === '' ? 10 : STANDARD_ARRAY[Number(idx)];
            });
            render();
        }));

        $$('[data-buy]').forEach(b => b.addEventListener('click', () => {
            const a = b.dataset.buy;
            const delta = Number(b.dataset.delta);
            if (!pointBuyCanChange(state.scores, a, delta)) return;
            state.scores[a] += delta;
            render();
        }));

        const rollBtn = $('#wz-roll');
        if (rollBtn) rollBtn.addEventListener('click', () => {
            state.rolled = ABILITIES.map(() => roll4d6Drop());
            ABILITIES.forEach((a, i) => state.scores[a] = state.rolled[i]);
            render();
        });

        $$('[data-manual]').forEach(input => input.addEventListener('input', () => {
            const value = Math.max(1, Math.min(30, parseInt(input.value, 10) || 1));
            state.scores[input.dataset.manual] = value;
            const row = input.closest('.ability-assign-row');
            // Redraw just this row's readout so the caret stays put.
            if (row) row.querySelector('.score-readout').outerHTML = scoreReadout(input.dataset.manual);
        }));

        $$('[data-halfelf]').forEach(chip => chip.addEventListener('click', () => {
            const ability = chip.dataset.halfelf;
            const at = state.halfElf.indexOf(ability);
            if (at >= 0) state.halfElf.splice(at, 1);
            else if (state.halfElf.length < 2) state.halfElf.push(ability);
            render();
        }));
    }

    // ---- Step 3: starting gear -------------------------------------------

    function stepGear() {
        const kit = startingKitSummary(state.cls, state.background);
        const level = clampLevel(state.level);

        if (kit.empty) {
            return `
                <div class="empty-state">
                    <h3>No starting kit</h3>
                    <p>A ${escapeHtml(state.cls)} with the ${escapeHtml(state.background)} background
                       has nothing recorded to start with. Add gear from the sheet once they exist.</p>
                </div>`;
        }

        const group = (label, rows, render) => rows.length ? `
            <div class="section-head"><span class="eyebrow">${label}</span><span class="rule"></span></div>
            <div class="stack">${rows.map(render).join('')}</div>` : '';

        return `
            <p class="hint">
                ${escapeHtml(state.cls)} and ${escapeHtml(state.background)} start with the following.
                ${level > 1
                    ? `This is the level 1 kit &mdash; at level ${level} it is a baseline to edit rather than what they would really carry.`
                    : ''}
            </p>
            <div class="method-grid" role="radiogroup" aria-label="Starting gear">
                <button class="method-tile${state.takeKit ? ' is-on' : ''}" role="radio"
                        aria-checked="${state.takeKit}" data-kit="yes">
                    <span class="title">Start equipped</span>
                    <span class="blurb">Add everything below</span>
                </button>
                <button class="method-tile${state.takeKit ? '' : ' is-on'}" role="radio"
                        aria-checked="${!state.takeKit}" data-kit="no">
                    <span class="title">Start with nothing</span>
                    <span class="blurb">An empty pack and no coin</span>
                </button>
            </div>
            ${group('Weapons', kit.weapons, w => `
                <div class="list-row">
                    <div class="who">
                        <div class="name">${escapeHtml(w.name)}</div>
                        <div class="meta">${escapeHtml(w.damage || '')} ${escapeHtml(w.damage_type || '')}</div>
                    </div>
                </div>`)}
            ${group('Armour', kit.armour, a => `
                <div class="list-row">
                    <div class="who">
                        <div class="name">${escapeHtml(a.name)}</div>
                        <div class="meta">${escapeHtml(a.description || '')}</div>
                    </div>
                </div>`)}
            ${group('Gear', kit.gear, g => `
                <div class="list-row">
                    <div class="who">
                        <div class="name">${escapeHtml(g.name)}</div>
                        <div class="meta">${escapeHtml(g.description || '')}</div>
                    </div>
                    ${(g.quantity || 1) > 1 ? `<div class="mono lvl">&times;${g.quantity}</div>` : ''}
                </div>`)}
            ${kit.gold ? `
                <div class="section-head"><span class="eyebrow">Coin</span><span class="rule"></span></div>
                <div class="chipline"><div class="chip">${kit.gold}<span>GP</span></div></div>` : ''}`;
    }

    function wireGear() {
        $$('[data-kit]').forEach(b => b.addEventListener('click', () => {
            state.takeKit = b.dataset.kit === 'yes';
            render();
        }));
    }

    // ---- Step 3: review --------------------------------------------------

    function stepReview() {
        const d = derived();
        const saves = d.saves.map(s => (ABILITY_FULL[s] || s)).join(' and ');
        return `
            <div class="review-head">
                <h3>${escapeHtml(state.name)}</h3>
                <p class="meta">Level ${clampLevel(state.level)} ${escapeHtml(state.race)} ${escapeHtml(state.cls)}${
                    state.subclass ? ` (${escapeHtml(state.subclass)})` : ''} &middot; ${escapeHtml(state.playerName)}</p>
            </div>
            <div class="review-scores">
                ${ABILITIES.map(a => {
                    const { base, bonus } = abilityRow(a);
                    return `
                    <div class="review-score">
                        <span class="mono ab">${a.toUpperCase()}</span>
                        <span class="mono total">${base + bonus}</span>
                        <span class="mod">${formatMod(getModifier(base + bonus))}</span>
                        ${bonus ? `<span class="hint">${base} +${bonus} race</span>` : ''}
                    </div>`;
                }).join('')}
            </div>
            <div class="review-grid">
                <div><span class="k">Hit points</span><span class="mono v">${
                    d.level > 1 ? d.hpAtOne : d.hp}</span></div>
                <div><span class="k">Armor class</span><span class="mono v">${d.ac}</span></div>
                <div><span class="k">Initiative</span><span class="mono v">${formatMod(d.initiative)}</span></div>
                <div><span class="k">Speed</span><span class="mono v">${d.speed} ft</span></div>
                <div><span class="k">Proficiency</span><span class="mono v">${formatMod(d.profBonus)}</span></div>
                <div><span class="k">Hit dice</span><span class="mono v">${clampLevel(state.level)}d${HIT_DICE[state.cls] || 8}</span></div>
            </div>
            <p class="hint">
                ${saves ? `Saving throw proficiency in ${escapeHtml(saves)}. ` : ''}
                ${d.level > 1
                    ? `Creating them starts at level 1; the wizard then walks levels 2 to ${d.level}, `
                      + 'asking for hit points, improvements, a subclass and features as they come.'
                    : 'Skills and spells are set on the sheet once they exist.'}
            </p>`;
    }

    // ---- Step 4: campaign ------------------------------------------------

    function stepCampaign() {
        if (!state.createdId) {
            return `<div class="error-banner">The character was not created. Go back and try again.</div>`;
        }

        const owed = clampLevel(state.level) > 1 && !state.levelled
            ? `<button class="levelup-banner" onclick="resumeLevelling()">
                   <span class="body">
                       <span class="title">Levels 2 to ${clampLevel(state.level)} are still owed</span>
                       <span class="meta">Hit points, improvements and a subclass. Their sheet will ask too.</span>
                   </span>
                   <span class="go">&rarr;</span>
               </button>`
            : '';
        // campaign_characters is dm_all / player_read: a player's insert would
        // be refused by the policy, so don't offer a choice that cannot work.
        if (!isDM) {
            return owed + `
                <div class="empty-state">
                    <h3>${escapeHtml(state.name)} is in the world</h3>
                    <p>Your DM adds characters to a campaign from the campaign page. ${escapeHtml(state.name)} is ready either way.</p>
                </div>`;
        }
        if (!state.campaigns.length) {
            return owed + `
                <div class="empty-state">
                    <h3>${escapeHtml(state.name)} is in the world</h3>
                    <p>This world has no campaigns yet. Characters belong to the world, so they can be pulled into a campaign whenever you make one.</p>
                </div>`;
        }
        return owed + `
            <div class="review-head">
                <h3>${escapeHtml(state.name)} is in the world</h3>
                <p class="meta">Add them to a campaign now, or leave it &mdash; they can be pulled in from any campaign later.</p>
            </div>
            <div class="pick-list" role="radiogroup" aria-label="Campaign">
                <button class="pick-row${state.campaignId === '' ? ' is-on' : ''}" data-campaign=""
                        role="radio" aria-checked="${state.campaignId === ''}">
                    <span class="name">Not yet</span>
                    <span class="meta">Leave them at world level</span>
                </button>
                ${state.campaigns.map(c => `
                    <button class="pick-row${state.campaignId === c.id ? ' is-on' : ''}" data-campaign="${escapeHtml(c.id)}"
                            role="radio" aria-checked="${state.campaignId === c.id}">
                        <span class="name">${escapeHtml(c.name)}</span>
                        <span class="meta">${escapeHtml(c.status || 'active')}${c.is_default ? ' &middot; default' : ''}</span>
                    </button>`).join('')}
            </div>`;
    }

    window.resumeLevelling = () => { runLevelling(); };

    function wireCampaign() {
        $$('[data-campaign]').forEach(b => b.addEventListener('click', () => {
            state.campaignId = b.dataset.campaign;
            render();
        }));
    }

    // ---- Persistence -----------------------------------------------------

    // v1 writes the character then five scaffolding rows. The engine then
    // overwrites speed, HP and the ability scores with the racially adjusted
    // values, so what is inserted here is a starting point, not the truth.
    async function create() {
        const d = derived();
        const hd = HIT_DICE[state.cls] || 8;
        const level = clampLevel(state.level);

        const { data: character, error } = await db.from('characters').insert({
            game_world_id: session.gameWorldId,
            name: state.name.trim(),
            player_name: state.playerName.trim(),
            race: state.race,
            class: state.cls,
            subclass: state.subclass.trim() || null,
            level,
            experience_points: 0,
            background: state.background,
            alignment: state.alignment,
            armor_class: d.ac,
            initiative_bonus: d.initiative,
            speed: d.speed,
            hit_point_maximum: d.hpAtOne,
            current_hit_points: d.hpAtOne,
            pending_level_up: level > 1,
            temporary_hit_points: 0,
            hit_dice_total: `${level}d${hd}`,
            hit_dice_remaining: level,
            death_save_successes: 0,
            death_save_failures: 0,
            proficiency_bonus: d.profBonus,
            inspiration: false
        }).select().single();

        if (error || !character) throw error || new Error('No character returned');
        const id = character.id;

        // The sheet reads these as rows, not as nulls, so every character gets
        // a full set from the start -- the same five tables v1 seeds.
        await db.from('ability_scores').insert({
            character_id: id,
            strength: state.scores.str, dexterity: state.scores.dex,
            constitution: state.scores.con, intelligence: state.scores.int,
            wisdom: state.scores.wis, charisma: state.scores.cha
        });
        await db.from('skills').insert(Object.keys(SKILLS).map(skill => ({
            character_id: id, skill_name: skill, proficient: false, expertise: false
        })));
        await db.from('saving_throws').insert(ABILITIES.map(a => ({
            character_id: id, ability: a, proficient: false
        })));
        await db.from('currency').insert({
            character_id: id, copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0
        });
        await db.from('character_details').insert({ character_id: id });

        // Racial bonuses, class saves, racial speed and starting HP, all from
        // the shared engine so v1 and v2 can never disagree about them.
        //
        // The engine keys scores by their LONG names, because that is how
        // RACIAL_ABILITY_BONUSES is written -- hand it the short keys the rest
        // of this file uses and every bonus silently misses, then the ability
        // score update writes undefined over all six.
        if (window.LevelUpEngine) {
            const base = {};
            ABILITIES.forEach(a => base[ABILITY_LONG[a]] = state.scores[a]);
            // Level 1, always: the hit points for every level above it come
            // from the level-up wizard, one choice at a time. Handing the
            // engine the target level would have it write the average for all
            // of them and the wizard would then add them a second time.
            await window.LevelUpEngine.enhanceCharacterCreation(
                id, { race: state.race, class: state.cls, level: 1 },
                base, state.halfElf
            );
        }

        if (state.takeKit) await insertStartingKit(id);

        return id;
    }

    // The class and background kit, in the same shape v1 writes it: weapons to
    // the weapons table, armour and gear to inventory, coin onto the purse.
    async function insertStartingKit(id) {
        const kit = startingKitSummary(state.cls, state.background);
        if (kit.empty) return;

        try {
            if (kit.weapons.length) {
                await db.from('weapons').insert(kit.weapons.map(w => ({
                    character_id: id,
                    name: w.name, damage: w.damage, damage_type: w.damage_type,
                    properties: w.properties, attack_bonus: w.attack_bonus || 0,
                    equipped: !!w.equipped
                })));
            }

            const carried = kit.armour.concat(kit.gear);
            if (carried.length) {
                await db.from('inventory_items').insert(carried.map(item => ({
                    character_id: id,
                    name: item.name, description: item.description || null,
                    quantity: item.quantity ?? 1, weight: item.weight ?? null,
                    item_type: item.item_type || 'Gear',
                    equipped: false, attuned: false
                })));
            }

            if (kit.gold) {
                await db.from('currency').update({ gold: kit.gold }).eq('character_id', id);
            }
        } catch (err) {
            // The character exists and is usable; gear can be added by hand.
            console.error('Could not add the starting kit:', err);
            toast('The character was created, but the starting kit was not added.', 'error');
        }
    }

    // Levels 2 and up are handed to the level-up wizard rather than being
    // written here. It already walks a range, asking for hit points per level
    // and every improvement, subclass, spell and feature the range owes -- and
    // it is the same path a DM grant takes, so a level 10 character built here
    // is indistinguishable from one levelled up to 10.
    async function runLevelling() {
        const target = clampLevel(state.level);
        const id = state.createdId;

        try {
            // preGrantLevel is what tells the wizard where the range starts;
            // the row already says `target`, so this makes the span 2..target.
            localStorage.setItem(`preGrantLevel_${id}`, '1');
            localStorage.setItem(`targetLevel_${id}`, String(target));
        } catch (e) { /* private mode: the wizard falls back to the row */ }

        if (typeof window.openLevelUp !== 'function') {
            toast('Finish levelling them up from their sheet.', 'error');
            return;
        }

        // Everything the wizard needs is already known here, except the
        // ability scores -- the engine adjusted those for race on the way in,
        // so they are read back rather than assumed.
        const { data: stored } = await db
            .from('ability_scores').select('*').eq('character_id', id).single();

        const character = {
            id,
            name: state.name.trim(),
            class: state.cls,
            subclass: state.subclass.trim() || null,
            level: target,
            experience_points: 0,
            pending_level_up: true,
            hit_point_maximum: derived().hpAtOne,
            current_hit_points: derived().hpAtOne,
            ability_scores: stored || withLongKeys(finalScores()),
            // A character this new owns none of these yet, and saying so
            // saves the wizard three queries that can only come back empty.
            features_traits: [],
            spells: [],
            spell_slots: []
        };

        window.openLevelUp(character, () => {
            state.levelled = true;
            // Back to the campaign step, which is where the wizard left off.
            render();
        });
    }

    async function joinCampaign() {
        if (!state.campaignId || !state.createdId) return;
        // Matches the campaign page's own pull-from-world write. The
        // character was created seconds ago, so there is no prior membership
        // row to reactivate -- a plain insert is right here.
        await db.from('campaign_characters').insert({
            campaign_id: state.campaignId,
            character_id: state.createdId,
            game_world_id: session.gameWorldId,
            status: 'active'
        });
    }

    async function loadCampaigns() {
        if (!isDM) return;
        const { data } = await db
            .from('campaigns')
            .select('id, name, status, is_default')
            .eq('game_world_id', session.gameWorldId)
            .order('sort_order');
        state.campaigns = data || [];
    }

    // ---- Navigation ------------------------------------------------------

    async function next() {
        if (blockers()) return;

        // Leaving review is where the write happens; the campaign step needs
        // a character to attach to.
        if (stepId() === 'review') {
            state.saving = true;
            render();
            try {
                state.createdId = await create();
                await loadCampaigns();
            } catch (err) {
                console.error('Failed to create character:', err);
                state.saving = false;
                render();
                toast('Could not create the character. Check your connection and try again.', 'error');
                return;
            }
            state.saving = false;
            state.step = stepIndex('campaign');
            render();

            // Everything a level brings -- hit points, improvements, a
            // subclass, features -- is owed before the character is finished,
            // so the level-up wizard runs here rather than waiting on the
            // sheet. It is the same one the DM panel's grants use.
            if (clampLevel(state.level) > 1) await runLevelling();
            return;
        }

        if (stepId() === 'campaign') {
            state.saving = true;
            render();
            try {
                await joinCampaign();
            } catch (err) {
                // The character exists either way; a failed join is worth
                // saying out loud but not worth blocking on.
                console.error('Failed to add to campaign:', err);
                toast('The character was created, but adding them to the campaign failed.', 'error');
            }
            window.location.href = `character-sheet.html?id=${encodeURIComponent(state.createdId)}`;
            return;
        }

        state.step += 1;
        render();
    }

    function back() {
        if (state.step === 0) return;
        // The character already exists by the campaign step; stepping back
        // into review would offer to create a second one.
        if (stepId() === 'campaign') return;
        state.step -= 1;
        render();
    }

    // ---- Render ----------------------------------------------------------

    function render() {
        // renderShell replaces document.body, which resets the page scroll.
        // Stepping an ability score near the bottom of the list would throw
        // the page back to the top on every press.
        const scrollY = window.scrollY;

        const main = renderShell({
            active: 'characters',
            title: 'New character',
            sub: session.gameWorldName || ''
        });

        const body =
            stepId() === 'identity'  ? stepIdentity() :
            stepId() === 'abilities' ? stepAbilities() :
            stepId() === 'gear'      ? stepGear() :
            stepId() === 'review'    ? stepReview() : stepCampaign();

        main.innerHTML = `
            <section class="wizard">
                ${progress()}
                <div class="wizard-body">${body}</div>
                ${footer()}
            </section>`;

        if (stepId() === 'identity')  wireIdentity();
        if (stepId() === 'abilities') wireAbilities();
        if (stepId() === 'gear')      wireGear();
        if (stepId() === 'campaign')  wireCampaign();

        $('#wz-next').addEventListener('click', next);
        $('#wz-back').addEventListener('click', back);

        if (scrollY) window.scrollTo(0, scrollY);
    }

    render();
})();
