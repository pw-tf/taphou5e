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

    window.addMonsters = () => {
        if (!monsters.length) {
            toast('This campaign has no monsters yet. Add some from the Compendium.', 'error');
            return;
        }
        openModal({
            title: 'Add monsters',
            submitLabel: 'Add',
            fields: [
                { name: 'monster_id', label: 'Monster', type: 'select', value: monsters[0].id,
                  options: monsters.map(m => ({ value: m.id, label: m.name })) },
                { name: 'count', label: 'How many', type: 'number', value: 1 }
            ],
            onSubmit: async values => {
                const monster = monsters.find(m => m.id === values.monster_id);
                const count = Math.max(1, Math.min(20, values.count || 1));
                const existing = combatants.filter(r => r.campaign_monster_id === monster.id).length;

                const rows = [];
                for (let i = 0; i < count; i++) {
                    rows.push({
                        encounter_id: enc.id,
                        game_world_id: session.gameWorldId,
                        combatant_type: 'monster',
                        campaign_monster_id: monster.id,
                        display_name: count > 1 || existing
                            ? `${monster.name} ${existing + i + 1}` : monster.name,
                        armor_class: monster.armor_class,
                        max_hit_points: monster.max_hit_points,
                        current_hit_points: monster.max_hit_points,
                        sort_order: combatants.length + i
                    });
                }
                const { error } = await db.from('encounter_combatants').insert(rows);
                if (error) throw new Error(error.message || 'Could not add those monsters.');
                await reload();
            }
        });
    };

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

        const conditions = Array.isArray(row.conditions) ? row.conditions : [];

        return `
            <div class="${classes.join(' ')}">
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
                        ${row.armor_class ? `<span class="mono">AC ${row.armor_class}</span>` : ''}
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
                    </div>` : ''}
            </div>`;
    }

    function trackerView() {
        const list = ordered();
        const running = enc.status === 'active';

        const controls = isDM ? `
            <div class="tracker-controls">
                ${running
                    ? `<button class="btn btn-accent" onclick="nextTurn()">Next turn</button>
                       <button class="btn" onclick="endEncounter()">End encounter</button>`
                    : `<button class="btn btn-accent" onclick="startEncounter()"
                               ${list.length ? '' : 'disabled'}>Start encounter</button>`}
                <button class="btn" onclick="rollInitiative()">Roll initiative</button>
                <button class="btn" onclick="addParty()">Add party</button>
                <button class="btn" onclick="addMonsters()">Add monsters</button>
                <button class="btn" onclick="addNPC()">Add NPC</button>
                <button class="btn btn-quiet" onclick="toggleHideHP()">
                    ${enc.hide_monster_hp ? 'Monster HP hidden' : 'Monster HP visible'}
                </button>
            </div>` : '';

        return `
            <div class="campaign-head">
                <div class="title-row">
                    <a class="btn btn-quiet btn-tiny" href="monster-tracker.html">← All encounters</a>
                    <span class="status-pill is-${escapeHtml(enc.status)}">${escapeHtml(enc.status)}</span>
                    ${running ? `<span class="mono round-pill">ROUND ${enc.round || 1}</span>` : ''}
                </div>
            </div>
            ${controls}
            ${enc.read_aloud ? `<p class="prose read-aloud">${escapeHtml(enc.read_aloud)}</p>` : ''}
            ${list.length
                ? `<div class="enc-group">${list.map(initRow).join('')}</div>`
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
                        ${isDM ? '<button class="btn btn-accent" onclick="newEncounter()">New encounter</button>' : ''}
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
            <div class="stack">
                ${groups[campaignId].map(e => `
                    <a class="list-row" href="monster-tracker.html?id=${encodeURIComponent(e.id)}">
                        <div class="who">
                            <div class="name">${escapeHtml(e.name)}</div>
                            <div class="meta">${escapeHtml(e.status)}${
                                e.status === 'active' ? ` · round ${e.round || 1}` : ''}</div>
                        </div>
                        ${e.status === 'active' ? '<span class="mono nav-count is-live">LIVE</span>' : ''}
                    </a>`).join('')}
            </div>`).join('');
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

    function draw() {
        renderShell({
            active: 'encounters',
            title: enc ? enc.name : 'Encounters',
            sub: session.gameWorldName || '',
            counts: enc ? undefined : { encounters: encounters.length },
            topbarExtra: !enc && isDM
                ? '<button class="btn btn-accent" onclick="newEncounter()">New encounter</button>'
                : ''
        });
        $('#main-content').innerHTML = enc ? trackerView() : listView();
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

            const [combatantRows, monsterRows, npcRows] = await Promise.all([
                db.from('encounter_combatants').select('*').eq('encounter_id', enc.id).order('sort_order'),
                db.from('campaign_monsters').select('*').eq('campaign_id', enc.campaign_id).order('name'),
                db.from('npcs').select('id, name').eq('campaign_id', enc.campaign_id).order('name')
            ]);
            combatants = combatantRows.data || [];
            monsters = monsterRows.data || [];
            npcs = npcRows.data || [];
            draw();
        } catch (err) {
            console.error('Tracker failed to load:', err);
            $('#main-content').innerHTML = `
                <div class="error-banner">Could not load that encounter.</div>
                <a class="btn" href="monster-tracker.html">All encounters</a>`;
        }
    })();
})();
