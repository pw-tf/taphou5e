// ========================================
// TAPHOU5E v2 — encounter tracker
//
// Combat state lives in the database, not localStorage: round, initiative,
// whose turn it is, conditions and hit points all survive a refresh or a move
// to another device. The classic tracker keeps all of this in the browser.
//
// Decision 1 is load-bearing here. A player character's hit points live on
// their character record and nowhere else -- encounter_combatants stores none
// for them, enforced by a check constraint. So damage dealt to a PC in combat
// writes through to characters.current_hit_points, which is the same column the
// classic app and the v2 sheet write. The two versions cannot disagree about
// whether someone is alive.
// ========================================

(function () {
    if (!requireSession()) return;

    const CONDITIONS = ['Blinded', 'Charmed', 'Frightened', 'Grappled', 'Incapacitated',
        'Paralyzed', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious'];

    const encounterId = new URLSearchParams(window.location.search).get('id');

    let encounters = [];
    let campaigns = [];
    let enc = null;
    let combatants = [];
    let characters = {};      // id -> character row, for the HP read-through
    let monsters = [];        // campaign roster
    let npcs = [];
    let beats = [];           // this campaign's storyline beats, for linking
    let detail = null;

    // ========================================
    // HP read-through
    // ========================================

    // For a character combatant the truth is on the character record. For a
    // monster or NPC it is on the combatant row, because there is nowhere else.
    function hpOf(row) {
        if (row.combatant_type === 'character') {
            const ch = characters[row.character_id];
            return {
                current: ch ? ch.current_hit_points : 0,
                max: ch ? ch.hit_point_maximum : 0,
                temp: ch ? ch.temporary_hit_points : 0
            };
        }
        return {
            current: row.current_hit_points ?? 0,
            max: row.max_hit_points ?? 0,
            temp: row.temporary_hit_points ?? 0
        };
    }

    async function applyHP(rowId, delta) {
        const row = combatants.find(r => r.id === rowId);
        if (!row) return;
        const hp = hpOf(row);
        const next = Math.max(0, Math.min(hp.max || 0, hp.current + delta));

        if (row.combatant_type === 'character') {
            const ch = characters[row.character_id];
            if (ch) ch.current_hit_points = next;      // optimistic
            draw();
            const { error } = await db.from('characters')
                .update({ current_hit_points: next }).eq('id', row.character_id);
            if (error) toast('Could not save that hit point change.', 'error');
            return;
        }

        row.current_hit_points = next;
        // A monster at zero is done; the row dims rather than disappearing so a
        // DM can still see what was in the fight.
        if (next === 0) row.is_defeated = true;
        else if (row.is_defeated) row.is_defeated = false;
        draw();
        const { error } = await db.from('encounter_combatants')
            .update({ current_hit_points: next, is_defeated: row.is_defeated }).eq('id', rowId);
        if (error) toast('Could not save that hit point change.', 'error');
    }

    function amountFor(rowId) {
        const input = $(`#amt-${rowId}`);
        const value = parseInt(input && input.value, 10);
        return Number.isFinite(value) ? Math.abs(value) : 1;
    }

    window.trackDamage = id => applyHP(id, -amountFor(id));
    window.trackHeal   = id => applyHP(id,  amountFor(id));

    // ========================================
    // Turn order
    // ========================================

    function ordered() {
        return combatants.slice().sort((a, b) => {
            const ia = a.initiative ?? -99;
            const ib = b.initiative ?? -99;
            if (ia !== ib) return ib - ia;
            return (a.sort_order || 0) - (b.sort_order || 0);
        });
    }

    window.nextTurn = async () => {
        const list = ordered().filter(r => !r.is_defeated);
        if (!list.length) return;

        const at = list.findIndex(r => r.id === enc.active_combatant_id);
        const wrapped = at === -1 || at === list.length - 1;
        const next = list[wrapped ? 0 : at + 1];
        const round = wrapped ? (enc.round || 0) + 1 : enc.round;

        enc.active_combatant_id = next.id;
        enc.round = round;
        draw();

        const { error } = await db.from('encounters')
            .update({ active_combatant_id: next.id, round }).eq('id', enc.id);
        if (error) toast('Could not advance the turn.', 'error');
    };

    window.startEncounter = async () => {
        const updates = { status: 'active', round: 1, started_at: new Date().toISOString() };
        const first = ordered().filter(r => !r.is_defeated)[0];
        if (first) updates.active_combatant_id = first.id;
        Object.assign(enc, updates);
        draw();
        if ((await db.from('encounters').update(updates).eq('id', enc.id)).error) {
            toast('Could not start the encounter.', 'error');
        }
    };

    window.endEncounter = async () => {
        const updates = {
            status: 'completed', completed_at: new Date().toISOString(), active_combatant_id: null
        };
        Object.assign(enc, updates);
        draw();
        if ((await db.from('encounters').update(updates).eq('id', enc.id)).error) {
            toast('Could not end the encounter.', 'error');
        }
    };

    window.setInitiative = async (id, value) => {
        const row = combatants.find(r => r.id === id);
        if (!row) return;
        const parsed = parseInt(value, 10);
        row.initiative = Number.isFinite(parsed) ? parsed : null;
        draw();
        if ((await db.from('encounter_combatants')
            .update({ initiative: row.initiative }).eq('id', id)).error) {
            toast('Could not save that initiative.', 'error');
        }
    };

    // Rolls for everything without an initiative yet, so a DM is not typing a
    // number per monster before the first round.
    window.rollInitiative = async () => {
        const pending = combatants.filter(r => r.initiative === null || r.initiative === undefined);
        for (const row of pending) {
            row.initiative = Math.floor(Math.random() * 20) + 1;
        }
        draw();
        for (const row of pending) {
            await db.from('encounter_combatants')
                .update({ initiative: row.initiative }).eq('id', row.id);
        }
    };

    window.toggleDefeated = async id => {
        const row = combatants.find(r => r.id === id);
        if (!row) return;
        row.is_defeated = !row.is_defeated;
        draw();
        if ((await db.from('encounter_combatants')
            .update({ is_defeated: row.is_defeated }).eq('id', id)).error) {
            toast('Could not save that.', 'error');
        }
    };

    window.toggleCombatantCondition = async (id, condition) => {
        const row = combatants.find(r => r.id === id);
        if (!row) return;
        const active = Array.isArray(row.conditions) ? row.conditions.slice() : [];
        const at = active.indexOf(condition);
        if (at === -1) active.push(condition); else active.splice(at, 1);
        row.conditions = active;
        draw();
        if ((await db.from('encounter_combatants')
            .update({ conditions: active }).eq('id', id)).error) {
            toast('Could not save that condition.', 'error');
        }
    };

    window.removeCombatant = async id => {
        combatants = combatants.filter(r => r.id !== id);
        draw();
        if ((await db.from('encounter_combatants').delete().eq('id', id)).error) {
            toast('Could not remove that combatant.', 'error');
        }
    };

    // ========================================
    // Adding combatants
    // ========================================

    // The classic tracker lets a DM type a name, pick from suggestions, choose
    // how many, and add. Requiring a trip to the Compendium first was the main
    // thing that made v2 slower to run a fight with.
    //
    // The schema still wants every combatant to reference something, so picking
    // an SRD creature that is not on this campaign's roster creates the roster
    // row silently. The roster therefore fills itself from actual use, and the
    // Compendium becomes curation rather than a required first step.
    const PALETTE = ['#c4452f', '#d9a94a', '#7fa65c', '#3d5a72', '#8a5fa8', '#b9743a', '#6b7280'];

    let addState = { query: '', suggestions: [], picked: null, detail: null, rolls: [] };

    async function ensureMonsterIndex() {
        try { return await srdIndex('monsters'); }
        catch (err) { console.error('SRD index failed:', err); return []; }
    }

    function addPanelBody() {
        const a = addState;
        const roster = monsters.filter(m =>
            !a.query || m.name.toLowerCase().includes(a.query.toLowerCase()));

        return `
            <div class="form-group">
                <label for="add-search">Monster</label>
                <input id="add-search" type="search" autocomplete="off"
                       placeholder="Start typing — goblin, wolf, bandit…"
                       value="${escapeHtml(a.query)}">
                <p class="hint" id="add-hint">${a.picked
                    ? `Adding <b>${escapeHtml(a.picked.name)}</b>${a.picked.source === 'roster'
                        ? ' from this campaign' : ' from the SRD'}. Typing again changes it.`
                    : 'Anything not in the SRD can be added by name with your own hit points.'}</p>
            </div>

            <div id="add-suggestions" class="add-suggestions">
                ${a.picked ? '' : suggestionRows(roster, a.suggestions)}
            </div>

            <div id="add-config" class="${a.picked ? '' : 'hidden'}">
                <div class="add-row">
                    <div class="form-group" style="flex:0 0 96px">
                        <label for="add-count">How many</label>
                        <input id="add-count" type="number" min="1" max="20" value="1">
                    </div>
                    <div class="form-group" style="flex:1;min-width:0">
                        <label for="add-group">Group (optional)</label>
                        <input id="add-group" type="text" placeholder="Wave 1" value="${escapeHtml(lastGroup)}">
                    </div>
                </div>

                <div class="form-group">
                    <label>Colour</label>
                    <div class="swatches" id="add-swatches">
                        <button type="button" class="swatch is-none is-active" data-color=""
                                title="No colour" aria-label="No colour"></button>
                        ${PALETTE.map(c => `
                            <button type="button" class="swatch" data-color="${c}"
                                    style="background:${c}" aria-label="Colour ${c}"></button>`).join('')}
                    </div>
                </div>

                <label class="remember-row">
                    <input type="checkbox" id="add-auto-init" checked>
                    Roll initiative automatically (d20 + DEX)
                </label>

                <div class="form-group">
                    <label>Hit points</label>
                    <div id="add-hp-rows" class="add-hp-rows"></div>
                    <p class="hint">Rolled from hit dice, so each one differs. Edit any of them.</p>
                </div>

                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModal()">Cancel</button>
                    <button type="button" class="btn btn-accent" id="add-confirm">Add to encounter</button>
                </div>
            </div>`;
    }

    function suggestionRows(roster, srd) {
        if (!addState.query) {
            return roster.length
                ? `<div class="eyebrow">In this campaign</div>` +
                  roster.slice(0, 8).map(m =>
                    `<button type="button" class="add-suggestion" data-kind="roster" data-id="${m.id}">
                        ${escapeHtml(m.name)}<span class="hidden-pill">roster</span>
                     </button>`).join('')
                : '<p class="hint">Type to search the SRD.</p>';
        }

        const rosterRows = roster.slice(0, 5).map(m =>
            `<button type="button" class="add-suggestion" data-kind="roster" data-id="${m.id}">
                ${escapeHtml(m.name)}<span class="hidden-pill">roster</span>
             </button>`).join('');

        const rosterIndexes = new Set(monsters.map(m => m.api_index).filter(Boolean));
        const srdRows = srd.filter(r => !rosterIndexes.has(r.index)).slice(0, 8).map(r =>
            `<button type="button" class="add-suggestion" data-kind="srd" data-id="${escapeHtml(r.index)}">
                ${escapeHtml(r.name)}
             </button>`).join('');

        return (rosterRows || srdRows)
            ? rosterRows + srdRows
            : `<button type="button" class="add-suggestion" data-kind="custom" data-id="">
                   Add “${escapeHtml(addState.query)}” as your own<span class="hidden-pill">custom</span>
               </button>`;
    }

    function renderHPRows() {
        const count = Math.max(1, Math.min(20, parseInt($('#add-count').value, 10) || 1));
        const name = addState.picked ? addState.picked.name : 'Monster';

        // One roll per creature, as the classic tracker does.
        while (addState.rolls.length < count) addState.rolls.push(rollForOne());
        addState.rolls.length = count;

        $('#add-hp-rows').innerHTML = addState.rolls.map((hp, i) => `
            <div class="add-hp-row">
                <label for="hp-${i}">${escapeHtml(name)}${count > 1 ? ' ' + (i + 1) : ''}</label>
                <input id="hp-${i}" class="add-hp" type="number" min="1" value="${hp}">
            </div>`).join('');
    }

    function rollForOne() {
        if (addState.detail) return rollHitPoints(addState.detail);
        if (addState.picked && addState.picked.max_hit_points) return addState.picked.max_hit_points;
        return 10;
    }

    let lastGroup = '';

    window.openAddMonsters = async () => {
        addState = { query: '', suggestions: [], picked: null, detail: null, rolls: [] };
        const index = await ensureMonsterIndex();

        openPanel({
            title: 'Add monsters',
            body: addPanelBody(),
            onMount: panel => {
                const search = $('#add-search', panel);

                const redraw = () => {
                    panel.innerHTML = addPanelBody();
                    wire(panel);
                    if (addState.picked) renderHPRows();
                };

                function wire(root) {
                    const box = $('#add-search', root);
                    if (box) {
                        box.addEventListener('input', () => {
                            addState.query = box.value;
                            addState.picked = null;
                            addState.detail = null;
                            addState.rolls = [];
                            const q = addState.query.trim().toLowerCase();
                            addState.suggestions = q
                                ? index.filter(r => r.name.toLowerCase().includes(q))
                                : [];
                            const host = $('#add-suggestions', root);
                            const roster = monsters.filter(m =>
                                !q || m.name.toLowerCase().includes(q));
                            host.innerHTML = suggestionRows(roster, addState.suggestions);
                            $('#add-config', root).classList.add('hidden');
                            bindSuggestions(root);
                        });
                        if (addState.query) {
                            box.focus();
                            box.setSelectionRange(box.value.length, box.value.length);
                        }
                    }

                    const count = $('#add-count', root);
                    if (count) count.addEventListener('input', renderHPRows);

                    $$('#add-swatches .swatch', root).forEach(sw => {
                        sw.addEventListener('click', () => {
                            $$('#add-swatches .swatch', root)
                                .forEach(o => o.classList.toggle('is-active', o === sw));
                        });
                    });

                    const confirm = $('#add-confirm', root);
                    if (confirm) confirm.addEventListener('click', commitAdd);

                    bindSuggestions(root);
                }

                function bindSuggestions(root) {
                    $$('.add-suggestion', root).forEach(btn => {
                        btn.addEventListener('click', async () => {
                            const kind = btn.dataset.kind;
                            if (kind === 'roster') {
                                const m = monsters.find(x => x.id === btn.dataset.id);
                                addState.picked = { source: 'roster', id: m.id, name: m.name,
                                                    max_hit_points: m.max_hit_points,
                                                    armor_class: m.armor_class, api_index: m.api_index };
                                addState.detail = m.api_index
                                    ? await srdDetail('monsters', m.api_index).catch(() => null) : null;
                            } else if (kind === 'srd') {
                                const row = index.find(r => r.index === btn.dataset.id);
                                addState.detail = await srdDetail('monsters', row.index).catch(() => null);
                                addState.picked = { source: 'srd', api_index: row.index, name: row.name,
                                                    armor_class: srdArmorClass(addState.detail && addState.detail.armor_class),
                                                    max_hit_points: addState.detail && addState.detail.hit_points };
                            } else {
                                addState.picked = { source: 'custom', name: addState.query.trim() || 'Monster',
                                                    armor_class: 10, max_hit_points: 10 };
                                addState.detail = null;
                            }
                            // The box still held the fragment that was typed
                            // ("ban"), which then read as the chosen creature's
                            // name. Show what was actually picked.
                            addState.query = addState.picked.name;
                            addState.rolls = [];
                            redraw();
                        });
                    });
                }

                wire(panel);
                if (search) search.focus();
            }
        });
    };

    // Finds this campaign's roster row for the pick, creating it if needed.
    async function resolveRosterMonster(picked) {
        if (picked.source === 'roster') return picked.id;

        const existing = monsters.find(m =>
            (picked.api_index && m.api_index === picked.api_index) ||
            (!picked.api_index && m.name.toLowerCase() === picked.name.toLowerCase()));
        if (existing) return existing.id;

        const detail = addState.detail;
        const payload = picked.api_index
            ? { source: 'srd_api', api_index: picked.api_index, statblock: null,
                challenge_rating: detail ? detail.challenge_rating : null,
                creature_type: detail ? detail.type : null, size: detail ? detail.size : null }
            : { source: 'homebrew', api_index: null,
                statblock: { description: 'Added from the tracker.' },
                challenge_rating: null, creature_type: null, size: null };

        const { data, error } = await db.from('campaign_monsters').insert({
            campaign_id: enc.campaign_id,
            game_world_id: session.gameWorldId,
            name: picked.name,
            armor_class: picked.armor_class ?? 10,
            max_hit_points: picked.max_hit_points ?? 10,
            ...payload
        }).select('id').single();

        if (error) throw new Error(error.message || 'Could not add that monster to the campaign.');
        return data.id;
    }

    async function commitAdd() {
        const picked = addState.picked;
        if (!picked) return;

        const confirm = $('#add-confirm');
        confirm.setAttribute('aria-busy', 'true');

        try {
            const monsterId = await resolveRosterMonster(picked);
            const hps = $$('.add-hp').map(i => Math.max(1, parseInt(i.value, 10) || 1));
            const auto = $('#add-auto-init').checked;
            const color = ($('#add-swatches .swatch.is-active') || {}).dataset?.color || null;
            const group = $('#add-group').value.trim();
            lastGroup = group;

            const existing = combatants.filter(r => r.campaign_monster_id === monsterId).length;
            const rows = hps.map((hp, i) => ({
                encounter_id: enc.id,
                game_world_id: session.gameWorldId,
                combatant_type: 'monster',
                campaign_monster_id: monsterId,
                display_name: hps.length > 1 || existing
                    ? `${picked.name} ${existing + i + 1}` : picked.name,
                initiative: auto ? rollInitiativeFor(addState.detail) : null,
                armor_class: picked.armor_class ?? 10,
                max_hit_points: hp,
                current_hit_points: hp,
                color: color || null,
                group_label: group || null,
                sort_order: combatants.length + i
            }));

            const { error } = await db.from('encounter_combatants').insert(rows);
            if (error) throw new Error(error.message || 'Could not add those monsters.');

            closeModal();
            await reloadAll();
            toast(`${rows.length} added.`);
        } catch (err) {
            console.error('Add failed:', err);
            toast(err.message || 'Could not add those monsters.', 'error');
            confirm.setAttribute('aria-busy', 'false');
        }
    }

    // Adding from the tracker can create a roster row, so refresh both.
    async function reloadAll() {
        const [rows, roster] = await Promise.all([
            db.from('encounter_combatants').select('*').eq('encounter_id', enc.id).order('sort_order'),
            db.from('campaign_monsters').select('*').eq('campaign_id', enc.campaign_id).order('name')
        ]);
        combatants = rows.data || [];
        monsters = roster.data || [];
        draw();
    }

    // The party is the common case, so add the whole active roster at once.
    window.addParty = async () => {
        const already = new Set(combatants.filter(r => r.character_id).map(r => r.character_id));
        const toAdd = Object.values(characters).filter(ch => !already.has(ch.id));
        if (!toAdd.length) {
            toast('Everyone is already in this encounter.');
            return;
        }
        const rows = toAdd.map((ch, i) => ({
            encounter_id: enc.id,
            game_world_id: session.gameWorldId,
            combatant_type: 'character',
            character_id: ch.id,
            display_name: ch.name,
            armor_class: ch.armor_class,
            // No hit points: they live on the character record. The
            // encounter_combatants_pc_hp_passthrough check rejects them here.
            initiative: null,
            sort_order: combatants.length + i
        }));
        const { error } = await db.from('encounter_combatants').insert(rows);
        if (error) {
            console.error(error);
            toast('Could not add the party.', 'error');
            return;
        }
        await reload();
    };

    window.addNPC = () => {
        if (!npcs.length) {
            toast('This campaign has no NPCs yet.', 'error');
            return;
        }
        openModal({
            title: 'Add an NPC',
            submitLabel: 'Add',
            fields: [
                { name: 'npc_id', label: 'NPC', type: 'select', value: npcs[0].id,
                  options: npcs.map(n => ({ value: n.id, label: n.name })) },
                { name: 'max_hit_points', label: 'Hit points', type: 'number', value: 10 },
                { name: 'armor_class', label: 'Armor class', type: 'number', value: 12 }
            ],
            onSubmit: async values => {
                const npc = npcs.find(n => n.id === values.npc_id);
                const { error } = await db.from('encounter_combatants').insert({
                    encounter_id: enc.id,
                    game_world_id: session.gameWorldId,
                    combatant_type: 'npc',
                    npc_id: npc.id,
                    display_name: npc.name,
                    armor_class: values.armor_class,
                    max_hit_points: values.max_hit_points,
                    current_hit_points: values.max_hit_points,
                    sort_order: combatants.length
                });
                if (error) throw new Error(error.message || 'Could not add that NPC.');
                await reload();
            }
        });
    };

    window.toggleHideHP = async () => {
        enc.hide_monster_hp = !enc.hide_monster_hp;
        draw();
        await db.from('encounters').update({ hide_monster_hp: enc.hide_monster_hp }).eq('id', enc.id);
    };

    window.showCombatant = id => {
        detail = detail === id ? null : id;
        draw();
    };

    window.setColor = async (id, color) => {
        const row = combatants.find(r => r.id === id);
        if (!row) return;
        row.color = color || null;
        draw();
        if ((await db.from('encounter_combatants')
            .update({ color: row.color }).eq('id', id)).error) {
            toast('Could not save that colour.', 'error');
        }
    };

    // setColor takes the colour it should apply, so reaching it from a menu
    // needs a picker of its own.
    window.pickColor = id => {
        const row = combatants.find(r => r.id === id);
        if (!row) return;
        openPanel({
            title: `Colour for ${row.display_name}`,
            body: `
                <p class="hint">A colour boxes every creature that shares it into one block.</p>
                <div class="swatches">
                    <button class="swatch is-none${row.color ? '' : ' is-active'}"
                            data-pick="" aria-label="No colour"></button>
                    ${PALETTE.map(c => `
                        <button class="swatch${row.color === c ? ' is-active' : ''}"
                                style="background:${c}" data-pick="${c}" aria-label="Colour ${c}"></button>`).join('')}
                </div>`,
            onMount: host => {
                $$('[data-pick]', host).forEach(sw => sw.addEventListener('click', () => {
                    closeModal();
                    window.setColor(id, sw.dataset.pick);
                }));
            }
        });
    };

    window.editNotes = id => {
        const row = combatants.find(r => r.id === id);
        if (!row) return;
        openModal({
            title: `Note — ${row.display_name}`,
            submitLabel: 'Save',
            fields: [{ name: 'notes', label: 'Note', type: 'textarea', rows: 4, value: row.notes || '' }],
            onSubmit: async values => {
                row.notes = values.notes || null;
                draw();
                await db.from('encounter_combatants').update({ notes: row.notes }).eq('id', id);
            }
        });
    };

    window.editAC = id => {
        const row = combatants.find(r => r.id === id);
        if (!row) return;
        openModal({
            title: `Armor class — ${row.display_name}`,
            submitLabel: 'Save',
            fields: [{ name: 'armor_class', label: 'Armor class', type: 'number', value: row.armor_class ?? 10 }],
            onSubmit: async values => {
                row.armor_class = values.armor_class;
                draw();
                await db.from('encounter_combatants').update({ armor_class: row.armor_class }).eq('id', id);
            }
        });
    };

    window.toggleGroup = label => {
        if (collapsed.has(label)) collapsed.delete(label); else collapsed.add(label);
        draw();
    };

    const collapsed = new Set();

    // A colour is a marker for a set of combatants -- "the red ones are the
    // archers" -- not a decoration on one row. So same-coloured rows gather
    // into a single bordered block rather than each carrying its own stripe.
    // Adding four goblins in one colour therefore reads as one block of four.
    //
    // This only applies while preparing. Once the encounter is running the list
    // is flat in initiative order and the colour goes back to a per-row stripe,
    // for the same reason groups do: turn order must not be reshuffled.
    function colourBlocks(rows) {
        const coloured = rows.filter(r => r.color);
        const plain = rows.filter(r => !r.color);

        const byColour = new Map();
        coloured.forEach(r => {
            if (!byColour.has(r.color)) byColour.set(r.color, []);
            byColour.get(r.color).push(r);
        });

        const blocks = Array.from(byColour.entries()).map(([color, group]) => {
            // A lone coloured combatant needs no box around it.
            if (group.length === 1) return initRow(group[0]);
            return `
                <div class="colour-block" style="--block-color:${escapeHtml(color)}">
                    ${group.map(initRow).join('')}
                </div>`;
        });

        return blocks.join('') + plain.map(initRow).join('');
    }

    // Rows carrying a group label gather under a collapsible heading, with
    // ungrouped rows last -- the same shape as the classic tracker.
    //
    // Groups are shown while an encounter is being prepared. Once it is running
    // the list goes flat in initiative order, because turn order is global: a
    // grouped list would send the active-turn highlight jumping between
    // headings. Waves are a planning tool; initiative is a combat one.
    function groupedRows(list) {
        const groups = new Map();
        list.forEach(row => {
            const key = row.group_label || '';
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(row);
        });

        const keys = Array.from(groups.keys()).sort((a, b) => {
            if (a === '') return 1;
            if (b === '') return -1;
            return a.localeCompare(b);
        });

        return keys.map(key => {
            const rows = groups.get(key);
            if (!key) return `<div class="enc-group">${colourBlocks(rows)}</div>`;
            const isCollapsed = collapsed.has(key);
            const alive = rows.filter(r => !r.is_defeated).length;
            return `
                <div class="enc-group${isCollapsed ? ' collapsed' : ''}">
                    <h2 onclick="toggleGroup('${escapeHtml(key)}')" role="button" tabindex="0">
                        <span class="group-caret">${isCollapsed ? '▸' : '▾'}</span>
                        ${escapeHtml(key)}
                        <span class="mono group-count">${alive}/${rows.length}</span>
                    </h2>
                    ${isCollapsed ? '' : colourBlocks(rows)}
                </div>`;
        }).join('');
    }

    // ========================================
    // Render: the tracker
    // ========================================

    function initRow(row) {
        const hp = hpOf(row);
        const isActive = enc.active_combatant_id === row.id;
        const isParty = row.combatant_type === 'character';
        // Players should not read monster hit points when the DM has hidden
        // them; they still see the initiative order and who is down.
        const hideHP = !isDM && !isParty && enc.hide_monster_hp;

        const classes = ['init-row'];
        if (isActive) classes.push('is-active');
        if (isParty) classes.push('is-party');
        if (row.is_defeated) classes.push('is-dead');
        if (row.color) classes.push('has-color');

        const conditions = Array.isArray(row.conditions) ? row.conditions : [];
        const styleAttr = row.color ? ` style="--row-color:${escapeHtml(row.color)}"` : '';

        return `
            <div class="${classes.join(' ')}"${styleAttr} data-holdable data-id="${escapeHtml(row.id)}">
                <div class="init-value">
                    ${isDM && enc.status !== 'completed'
                        ? `<input class="init-input mono" type="number" value="${row.initiative ?? ''}"
                                  onchange="setInitiative('${row.id}', this.value)"
                                  aria-label="Initiative for ${escapeHtml(row.display_name)}">`
                        : `<b>${row.initiative ?? '—'}</b>`}
                    <span>INIT</span>
                </div>

                <div class="init-id">
                    <div class="init-name" onclick="showCombatant('${row.id}')" role="button" tabindex="0">
                        ${escapeHtml(row.display_name)}
                    </div>
                    <div class="init-sub">
                        ${isDM && enc.status !== 'completed'
                            ? `<span class="mono ac-edit" role="button" tabindex="0"
                                     onclick="editAC('${row.id}')" title="Edit armor class">AC ${row.armor_class ?? '—'}</span>`
                            : (row.armor_class ? `<span class="mono">AC ${row.armor_class}</span>` : '')}
                        ${hideHP ? '' : `<span class="state-${hpClass(hp.current, hp.max)}">${hpStateLabel(hp.current, hp.max)}</span>`}
                        ${isParty ? '<span class="hidden-pill">party</span>' : ''}
                    </div>
                </div>

                <div class="init-hp">
                    ${hideHP
                        ? '<span class="hint">Hit points hidden</span>'
                        : renderHP(hp.current, hp.max, hp.temp, 'row')}
                </div>

                ${isDM && !row.is_defeated ? `
                    <div class="init-actions">
                        <button class="hp-btn damage" onclick="trackDamage('${row.id}')" aria-label="Damage">−</button>
                        <input id="amt-${row.id}" type="number" inputmode="numeric" placeholder="1"
                               aria-label="Amount for ${escapeHtml(row.display_name)}">
                        <button class="hp-btn heal" onclick="trackHeal('${row.id}')" aria-label="Heal">+</button>
                    </div>` : ''}

                ${isDM ? `
                    <div class="row-actions">
                        <button class="btn btn-quiet btn-tiny" onclick="toggleDefeated('${row.id}')">
                            ${row.is_defeated ? 'Revive' : 'Down'}
                        </button>
                        <button class="btn btn-quiet btn-tiny" onclick="removeCombatant('${row.id}')">Remove</button>
                    </div>` : ''}

                ${conditions.length ? `
                    <div class="init-conditions">
                        ${conditions.map(c => `<span class="condition-tag active">${escapeHtml(c)}</span>`).join('')}
                    </div>` : ''}

                ${row.notes ? `<div class="init-note">${escapeHtml(row.notes)}</div>` : ''}

                ${detail === row.id ? `
                    <div class="init-detail">
                        <span class="eyebrow">Conditions</span>
                        <div class="conditions-grid">
                            ${CONDITIONS.map(c => `
                                <button class="condition-tag${conditions.includes(c) ? ' active' : ''}"
                                        ${isDM ? `onclick="toggleCombatantCondition('${row.id}','${c}')"` : 'disabled'}>
                                    ${c}
                                </button>`).join('')}
                        </div>
                        ${isDM ? `
                            <span class="eyebrow" style="margin-top:var(--space-sm)">Colour</span>
                            <div class="swatches">
                                <button class="swatch is-none${row.color ? '' : ' is-active'}"
                                        onclick="setColor('${row.id}','')" aria-label="No colour"></button>
                                ${PALETTE.map(c => `
                                    <button class="swatch${row.color === c ? ' is-active' : ''}"
                                            style="background:${c}" onclick="setColor('${row.id}','${c}')"
                                            aria-label="Colour ${c}"></button>`).join('')}
                            </div>
                            <button class="btn btn-quiet btn-tiny" style="align-self:flex-start;margin-top:var(--space-sm)"
                                    onclick="editNotes('${row.id}')">${row.notes ? 'Edit note' : 'Add note'}</button>` : ''}
                    </div>` : ''}
            </div>`;
    }

    function trackerView() {
        const list = ordered();
        const running = enc.status === 'active';

        return `
            <div class="campaign-head">
                <div class="title-row">
                    <a class="btn btn-quiet btn-tiny" href="monster-tracker.html">← All encounters</a>
                    <span class="status-pill is-${escapeHtml(enc.status)}">${escapeHtml(enc.status)}</span>
                    ${running ? `<span class="mono round-pill">ROUND ${enc.round || 1}</span>` : ''}
                    ${(() => {
                        const beat = beats.find(b => b.id === enc.storyline_beat_id);
                        return beat
                            ? `<span class="story-link">${escapeHtml(beat.storyline_title)} — ${escapeHtml(beat.title)}</span>`
                            : '';
                    })()}
                </div>
            </div>
            ${enc.read_aloud ? `<p class="prose read-aloud">${escapeHtml(enc.read_aloud)}</p>` : ''}
            ${list.length
                ? (running ? `<div class="enc-group">${list.map(initRow).join('')}</div>` : groupedRows(list))
                : `<div class="empty-state">
                       <h3>Nobody in this encounter yet</h3>
                       <p>${isDM ? "Add the party, then monsters from this campaign's roster."
                                 : 'Your DM has not set this one up yet.'}</p>
                   </div>`}`;
    }

    // ========================================
    // Render: the list
    // ========================================

    window.newEncounter = () => {
        if (!campaigns.length) {
            toast('Create a campaign first.', 'error');
            return;
        }
        openModal({
            title: 'New encounter',
            submitLabel: 'Create',
            fields: [
                { name: 'campaign_id', label: 'Campaign', type: 'select', value: campaigns[0].id,
                  options: campaigns.map(cm => ({ value: cm.id, label: cm.name })) },
                { name: 'name', label: 'Name', required: true, placeholder: 'Ambush at the Ford' },
                { name: 'read_aloud', label: 'Read-aloud text', type: 'textarea', rows: 3 }
            ],
            onSubmit: async values => {
                const { data, error } = await db.from('encounters').insert({
                    campaign_id: values.campaign_id,
                    game_world_id: session.gameWorldId,
                    name: values.name,
                    read_aloud: values.read_aloud || null
                }).select('id').single();
                if (error) throw new Error(error.message || 'Could not create the encounter.');
                window.location.href = `monster-tracker.html?id=${encodeURIComponent(data.id)}`;
            }
        });
    };

    function listView() {
        if (!encounters.length) {
            return `<div class="empty-state">
                        <h3>No encounters yet</h3>
                        <p>${isDM ? "Build one from a campaign's monster roster, then run it here."
                                  : 'Nothing is running right now.'}</p>
                        ${isDM ? `<button class="btn btn-accent" onclick="newEncounter()">New encounter</button>
                                  <button class="btn" onclick="importEncounter()">Add a shared one</button>` : ''}
                    </div>`;
        }

        const name = id => (campaigns.find(cm => cm.id === id) || {}).name || 'Unknown campaign';
        const groups = {};
        encounters.forEach(e => { (groups[e.campaign_id] = groups[e.campaign_id] || []).push(e); });

        return Object.keys(groups).map(campaignId => `
            <div class="section-head">
                <span class="eyebrow">${escapeHtml(name(campaignId))}</span>
                <span class="rule"></span>
            </div>
            <div class="stack holdable">
                ${groups[campaignId].map(e => `
                    <a class="list-row" href="monster-tracker.html?id=${encodeURIComponent(e.id)}"
                       data-holdable data-id="${escapeHtml(e.id)}">
                        <div class="who">
                            <div class="name">${escapeHtml(e.name)}</div>
                            <div class="meta">${escapeHtml(e.status)}${
                                e.status === 'active' ? ` · round ${e.round || 1}` : ''}</div>
                        </div>
                        ${e.status === 'active' ? '<span class="mono nav-count is-live">LIVE</span>' : ''}
                    </a>`).join('')}
            </div>`).join('')
            + (isDM ? '<p class="hint">Hold an encounter (or right-click) to share or delete it.</p>' : '');
    }

    function encounterMenu(row) {
        const encounter = encounters.find(e => e.id === row.dataset.id);
        if (!encounter || !isDM) return null;
        const href = `monster-tracker.html?id=${encodeURIComponent(encounter.id)}`;
        return {
            title: encounter.name,
            actions: [
                { label: encounter.status === 'active' ? 'Resume' : 'Open',
                  hint: encounter.status === 'active' ? `Round ${encounter.round || 1}` : encounter.status,
                  run: () => { window.location.href = href; } },
                { label: 'Share', hint: 'Get a code someone else can import',
                  run: () => window.shareEncounter(encounter) },
                { label: 'Delete', danger: true, hint: 'The roster and characters are left alone',
                  run: () => window.deleteEncounter(encounter) }
            ]
        };
    }

    // ========================================
    // Load
    // ========================================

    async function reload() {
        const { data } = await db.from('encounter_combatants')
            .select('*').eq('encounter_id', enc.id).order('sort_order');
        combatants = data || [];
        draw();
    }

    // ========================================
    // Sharing
    //
    // The classic tracker shares by base64-encoding the whole monster array
    // into a URL -- around two kilobytes for a six-creature fight, carrying
    // live hit points and internal ids. It did that because it had no server.
    // Here the recipe goes in a row and the shared thing is a ten-character
    // code, so it survives being read down a phone or pasted anywhere.
    // ========================================

    window.shareEncounter = async (target) => {
        const subject = target || enc;
        const { data, error } = await db.rpc('encounter_share_create', { p_encounter_id: subject.id });
        if (error || !data || !data.ok) {
            console.error('Share failed:', error || data);
            toast((data && data.error === 'not_dm')
                ? 'Log in again as DM to share this encounter.'
                : 'Could not share that encounter.', 'error');
            return;
        }

        openPanel({
            title: 'Share this encounter',
            body: `
                <p class="hint">Anyone with this code can add a copy to their own campaign.
                   It carries the creatures at full health, with their colours and groups —
                   not your party, and not the current state of the fight.</p>
                <div class="share-code" id="share-code">${escapeHtml(data.code)}</div>
                <p class="hint">${data.count} creature${data.count === 1 ? '' : 's'}.</p>
                <div class="modal-actions">
                    <button type="button" class="btn" onclick="closeModal()">Done</button>
                    <button type="button" class="btn btn-accent" id="copy-code">Copy code</button>
                </div>`,
            onMount: panel => {
                $('#copy-code', panel).addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(data.code);
                        toast('Code copied.');
                    } catch (err) {
                        // Clipboard access is refused in some browsers and over
                        // plain http; selecting the text is the fallback.
                        const node = $('#share-code', panel);
                        const range = document.createRange();
                        range.selectNodeContents(node);
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(range);
                        toast('Select and copy the code.');
                    }
                });
            }
        });
    };

    window.importEncounter = () => {
        if (!campaigns.length) {
            toast('Create a campaign first.', 'error');
            return;
        }
        openModal({
            title: 'Add a shared encounter',
            submitLabel: 'Add it',
            fields: [
                { name: 'code', label: 'Share code', required: true, placeholder: 'e.g. K7PQR2MWXJ',
                  hint: 'Case does not matter.' },
                { name: 'campaign_id', label: 'Add to', type: 'select', value: campaigns[0].id,
                  options: campaigns.map(cm => ({ value: cm.id, label: cm.name })) }
            ],
            onSubmit: async values => {
                const { data, error } = await db.rpc('encounter_share_get', { p_code: values.code });
                if (error) throw new Error('Could not look that code up.');
                if (!data || !data.ok) throw new Error('No encounter with that code. Check it and try again.');

                const id = await buildFromRecipe(values.campaign_id, data.payload);
                window.location.href = `monster-tracker.html?id=${encodeURIComponent(id)}`;
            }
        });
    };

    // Rebuilds a shared recipe in the chosen campaign, creating any roster
    // monsters it needs -- the same rule the tracker's own add uses, so an
    // import never asks the recipient to go and set the roster up first.
    async function buildFromRecipe(campaignId, payload) {
        const { data: created, error } = await db.from('encounters').insert({
            campaign_id: campaignId,
            game_world_id: session.gameWorldId,
            name: payload.name || 'Shared encounter',
            read_aloud: payload.read_aloud || null
        }).select('id').single();
        if (error) throw new Error(error.message || 'Could not create the encounter.');

        const { data: rosterRows } = await db.from('campaign_monsters')
            .select('id, name, api_index').eq('campaign_id', campaignId);
        const roster = rosterRows || [];

        const findOrCreate = async entry => {
            // A shared creature is matched to the roster by its SRD reference
            // where it has one, and by name otherwise.
            const base = (entry.name || 'Monster').replace(/\s+\d+$/, '');
            const hit = roster.find(m =>
                (entry.api && m.api_index === entry.api) ||
                (!entry.api && m.name.toLowerCase() === base.toLowerCase()));
            if (hit) return hit.id;

            const { data: made, error: makeError } = await db.from('campaign_monsters').insert({
                campaign_id: campaignId,
                game_world_id: session.gameWorldId,
                name: base,
                source: entry.api ? 'srd_api' : 'homebrew',
                api_index: entry.api || null,
                statblock: entry.api ? null : { description: 'Imported from a shared encounter.' },
                armor_class: entry.ac ?? 10,
                max_hit_points: entry.hp ?? 10
            }).select('id, name, api_index').single();
            if (makeError) throw new Error(makeError.message || 'Could not add a monster.');
            roster.push(made);
            return made.id;
        };

        const rows = [];
        const entries = payload.combatants || [];
        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            rows.push({
                encounter_id: created.id,
                game_world_id: session.gameWorldId,
                combatant_type: 'monster',
                campaign_monster_id: await findOrCreate(entry),
                display_name: entry.name || 'Monster',
                armor_class: entry.ac ?? 10,
                max_hit_points: entry.hp ?? 10,
                current_hit_points: entry.hp ?? 10,   // arrives at full health
                color: entry.color || null,
                group_label: entry.group || null,
                sort_order: i
            });
        }

        if (rows.length) {
            const { error: rowError } = await db.from('encounter_combatants').insert(rows);
            if (rowError) throw new Error(rowError.message || 'Could not add the creatures.');
        }
        return created.id;
    }

    // An encounter can hang off the moment in the story it belongs to, which is
    // what encounters.storyline_beat_id is for. The picker only offers beats
    // from this campaign, since nothing in the schema stops a cross-campaign
    // link and one would be nonsense.
    window.linkToBeat = () => {
        if (!beats.length) {
            toast('This campaign has no storyline beats yet.', 'error');
            return;
        }
        openModal({
            title: 'Link to a storyline beat',
            submitLabel: 'Save link',
            fields: [{
                name: 'storyline_beat_id', label: 'Beat', type: 'select',
                value: enc.storyline_beat_id || '',
                options: [{ value: '', label: '— not linked —' }].concat(
                    beats.map(b => ({ value: b.id, label: `${b.storyline_title} — ${b.title}` })))
            }],
            onSubmit: async values => {
                const next = values.storyline_beat_id || null;
                const { error } = await db.from('encounters')
                    .update({ storyline_beat_id: next }).eq('id', enc.id);
                if (error) throw new Error(error.message || 'Could not save that link.');
                enc.storyline_beat_id = next;
                draw();
            }
        });
    };

    // Deleting an encounter takes its combatants with it by cascade. The
    // campaign's monster roster is untouched -- those rows are the campaign's,
    // not this fight's.
    window.deleteEncounter = (target) => {
        const subject = target || enc;
        // From the list the combatants are not loaded, so the message names
        // what goes rather than counting it.
        const count = target ? null : combatants.length;
        const scope = count === null
            ? 'This removes the encounter and every combatant in it.'
            : count
                ? `This removes the encounter and its ${count} combatant${count === 1 ? '' : 's'}.`
                : 'This removes the encounter. It has no combatants yet.';

        confirmModal({
            title: `Delete ${subject.name}`,
            message: `${scope} The campaign's monster roster and every character are left alone. `
                   + 'This cannot be undone.',
            confirmLabel: 'Delete encounter',
            onConfirm: async () => {
                const { error } = await db.from('encounters').delete().eq('id', subject.id);
                if (error) throw new Error(error.message || 'Could not delete the encounter.');
                if (target) {
                    encounters = encounters.filter(e => e.id !== subject.id);
                    draw();
                } else {
                    window.location.href = 'monster-tracker.html';
                }
            }
        });
    };

    // Seven buttons in a row was unusable on a phone. They are declared once
    // and the shell decides: topbar above the breakpoint, flip-up menu below.
    function trackerActions() {
        if (!isDM) return [];
        if (!enc) {
            return [{ label: 'New encounter', onclick: 'newEncounter()', primary: true },
                    { label: 'Add a shared encounter', onclick: 'importEncounter()' }];
        }

        const running = enc.status === 'active';
        const anyone = combatants.length > 0;
        const actions = running
            ? [{ label: 'Next turn', onclick: 'nextTurn()', primary: true },
               { label: 'End encounter', onclick: 'endEncounter()' }]
            : anyone
                ? [{ label: 'Start encounter', onclick: 'startEncounter()', primary: true }]
                : [];

        return actions.concat([
            { label: 'Roll initiative', onclick: 'rollInitiative()' },
            { label: 'Add party', onclick: 'addParty()' },
            { label: 'Add monsters', onclick: 'openAddMonsters()' },
            { label: 'Add NPC', onclick: 'addNPC()' },
            { label: enc.hide_monster_hp ? 'Monster HP hidden' : 'Monster HP visible',
              onclick: 'toggleHideHP()' },
            { label: enc.storyline_beat_id ? 'Change story link' : 'Link to a beat',
              onclick: 'linkToBeat()' },
            { label: 'Share encounter', onclick: 'shareEncounter()' },
            { label: 'Delete encounter', onclick: 'deleteEncounter()' }
        ]);
    }

    function draw() {
        renderShell({
            active: 'encounters',
            title: enc ? enc.name : 'Encounters',
            sub: session.gameWorldName || '',
            counts: enc ? undefined : { encounters: encounters.length },
            actions: trackerActions()
        });
        $('#main-content').innerHTML = enc ? trackerView() : listView();

        if (enc) wireCardMenus('#main-content', '.init-row', combatantMenu);
        else wireCardMenus('#main-content', '.list-row', encounterMenu);
    }

    // Everything the inline buttons do, plus the things that had no room on
    // the row at all: colour, notes and removal.
    function combatantMenu(row) {
        const combatant = combatants.find(c => c.id === row.dataset.id);
        if (!combatant || !isDM) return null;

        const isParty = combatant.combatant_type === 'character';
        return {
            title: combatant.display_name,
            actions: [
                { label: 'Show details', hint: 'Stat block and conditions',
                  run: () => window.showCombatant(combatant.id) },
                { label: combatant.is_defeated ? 'Mark as up' : 'Mark as down',
                  run: () => window.toggleDefeated(combatant.id) },
                { label: 'Set colour', hint: 'Groups creatures into one block',
                  run: () => window.pickColor(combatant.id) },
                { label: 'Edit note', run: () => window.editNotes(combatant.id) },
                { label: 'Edit armor class', run: () => window.editAC(combatant.id) },
                // A character is in the encounter, not owned by it, so this
                // only takes them off the initiative order.
                { label: isParty ? 'Remove from encounter' : 'Remove', danger: true,
                  hint: isParty ? 'They stay in the world and the campaign' : 'Stays on the campaign roster',
                  run: () => window.removeCombatant(combatant.id) }
            ]
        };
    }

    (async function init() {
        renderShell({ active: 'encounters', title: 'Encounters', sub: session.gameWorldName || '' });
        $('#main-content').innerHTML = '<div class="skeleton"></div>';

        try {
            const worldId = session.gameWorldId;
            const [campaignRows, characterRows] = await Promise.all([
                db.from('campaigns').select('id, name').eq('game_world_id', worldId).order('name'),
                db.from('characters')
                  .select('id, name, armor_class, current_hit_points, hit_point_maximum, temporary_hit_points')
                  .eq('game_world_id', worldId)
            ]);
            campaigns = campaignRows.data || [];
            characters = Object.fromEntries((characterRows.data || []).map(ch => [ch.id, ch]));

            if (!encounterId) {
                const { data } = await db.from('encounters')
                    .select('*').eq('game_world_id', worldId).order('created_at');
                encounters = data || [];
                draw();
                return;
            }

            const { data: encRow, error } = await db.from('encounters')
                .select('*').eq('id', encounterId).single();
            if (error || !encRow || encRow.game_world_id !== worldId) {
                throw new Error('Encounter not found');
            }
            enc = encRow;

            const [combatantRows, monsterRows, npcRows, storylineRows] = await Promise.all([
                db.from('encounter_combatants').select('*').eq('encounter_id', enc.id).order('sort_order'),
                db.from('campaign_monsters').select('*').eq('campaign_id', enc.campaign_id).order('name'),
                db.from('npcs').select('id, name').eq('campaign_id', enc.campaign_id).order('name'),
                db.from('storylines').select('id, title').eq('campaign_id', enc.campaign_id).order('sort_order')
            ]);
            combatants = combatantRows.data || [];
            monsters = monsterRows.data || [];
            npcs = npcRows.data || [];

            // Beats carry no campaign_id, so fetch by world and keep the ones
            // belonging to this campaign's storylines.
            const storylines = storylineRows.data || [];
            if (storylines.length) {
                const byId = Object.fromEntries(storylines.map(st => [st.id, st.title]));
                const { data: beatRows } = await db.from('storyline_beats')
                    .select('id, title, storyline_id').eq('game_world_id', worldId).order('sort_order');
                beats = (beatRows || [])
                    .filter(b => byId[b.storyline_id])
                    .map(b => ({ ...b, storyline_title: byId[b.storyline_id] }));
            }
            draw();
        } catch (err) {
            console.error('Tracker failed to load:', err);
            $('#main-content').innerHTML = `
                <div class="error-banner">Could not load that encounter.</div>
                <a class="btn" href="monster-tracker.html">All encounters</a>`;
        }
    })();
})();
