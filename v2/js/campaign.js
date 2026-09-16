// ========================================
// TAPHOU5E v2 — campaign detail
//
// Everything a campaign owns, under one roof. Two things shape this screen:
//
// 1. Reveal flags. Rows a DM has not revealed are invisible to players at the
//    database level, not hidden in the UI. A DM therefore needs to see, at a
//    glance, what is hidden -- otherwise the only way to know is to log in as
//    a player. Every hideable row carries an explicit visibility toggle.
//
// 2. Characters belong to the world, not the campaign. Adding one to a campaign
//    is a membership row; it never moves the character. Removing sets left_at
//    rather than deleting, so a character who rejoins keeps their history.
// ========================================

(function () {
    if (!requireSession()) return;

    const campaignId = new URLSearchParams(window.location.search).get('id');
    const STATUSES = ['planning', 'active', 'paused', 'completed', 'archived'];
    const AREA_TYPES = ['region', 'settlement', 'dungeon', 'landmark', 'building', 'plane', 'location', 'other'];

    const TABS = [
        { id: 'overview',   label: 'Overview' },
        { id: 'party',      label: 'Party' },
        { id: 'storylines', label: 'Storylines' },
        { id: 'areas',      label: 'Areas' },
        { id: 'npcs',       label: 'NPCs' },
        { id: 'monsters',   label: 'Monsters' },
        { id: 'encounters', label: 'Encounters' }
    ];

    let d = null;        // everything loaded for this campaign
    let activeTab = 'overview';

    // ========================================
    // Load
    // ========================================

    async function load() {
        const [campaign, members, worldChars, storylines, beats, checks,
               areas, npcs, monsters, encounters, sessions, notes] = await Promise.all([
            db.from('campaigns').select('*').eq('id', campaignId).single(),
            db.from('campaign_characters').select('*').eq('campaign_id', campaignId),
            db.from('characters').select('id, name, player_name, class, level, current_hit_points, hit_point_maximum, temporary_hit_points')
              .eq('game_world_id', session.gameWorldId).order('name'),
            db.from('storylines').select('*').eq('campaign_id', campaignId).order('sort_order'),
            db.from('storyline_beats').select('*').eq('game_world_id', session.gameWorldId).order('sort_order'),
            db.from('campaign_checks').select('*').eq('campaign_id', campaignId).order('sort_order'),
            db.from('areas').select('*').eq('campaign_id', campaignId).order('sort_order').order('name'),
            db.from('npcs').select('*').eq('campaign_id', campaignId).order('sort_order').order('name'),
            db.from('campaign_monsters').select('*').eq('campaign_id', campaignId).order('name'),
            db.from('encounters').select('*').eq('campaign_id', campaignId).order('created_at'),
            db.from('campaign_sessions').select('*').eq('campaign_id', campaignId).order('played_on'),
            db.from('dm_notes').select('*').eq('game_world_id', session.gameWorldId)
        ]);

        if (campaign.error || !campaign.data) throw new Error('Campaign not found');
        if (campaign.data.game_world_id !== session.gameWorldId) throw new Error('Wrong world');

        const storylineIds = new Set((storylines.data || []).map(s => s.id));

        return {
            campaign: campaign.data,
            members: members.data || [],
            worldChars: worldChars.data || [],
            storylines: storylines.data || [],
            // Beats are fetched per world (they carry no campaign_id) then
            // filtered to this campaign's storylines.
            beats: (beats.data || []).filter(b => storylineIds.has(b.storyline_id)),
            checks: checks.data || [],
            areas: areas.data || [],
            npcs: npcs.data || [],
            monsters: monsters.data || [],
            encounters: encounters.data || [],
            sessions: sessions.data || [],
            notes: notes.data || []
        };
    }

    const noteFor = (key, id) => (d.notes || []).find(n => n[key] === id) || null;

    async function refresh() {
        d = await load();
        draw();
    }

    async function run(promise, failure) {
        const { error } = await promise;
        if (error) {
            console.error(failure, error);
            toast(failure, 'error');
            return false;
        }
        return true;
    }

    // ========================================
    // Shared row furniture
    // ========================================

    // A DM must be able to tell hidden rows from visible ones without logging
    // out. Players never see a hidden row at all, so this is DM-only.
    function revealToggle(table, row, field, shownLabel, hiddenLabel) {
        if (!isDM) return '';
        const on = !!row[field];
        return `<button class="status-pill ${on ? 'is-active' : ''}"
                        onclick="event.stopPropagation(); toggleReveal('${table}','${row.id}','${field}',${on})"
                        title="${on ? 'Players can see this' : 'Hidden from players'}">
                    ${on ? escapeHtml(shownLabel) : escapeHtml(hiddenLabel)}
                </button>`;
    }

    window.toggleReveal = async (table, id, field, current) => {
        if (await run(db.from(table).update({ [field]: !current }).eq('id', id),
                      'Could not change visibility.')) {
            await refresh();
        }
    };

    function dmNoteBlock(key, id, label) {
        if (!isDM) return '';
        const note = noteFor(key, id);
        return `
            <div class="dm-note-block">
                <div class="dm-note-head">
                    <span class="eyebrow">DM note</span>
                    <button class="btn btn-quiet btn-tiny"
                            onclick="event.stopPropagation(); editNote('${key}','${id}',${JSON.stringify(label).replace(/"/g, '&quot;')})">
                        ${note ? 'Edit' : 'Add'}
                    </button>
                </div>
                ${note ? `<div class="dm-note">${escapeHtml(note.body)}</div>` : ''}
            </div>`;
    }

    window.editNote = (key, id, label) => {
        const note = noteFor(key, id);
        openModal({
            title: `DM note — ${label}`,
            submitLabel: note ? 'Save note' : 'Add note',
            fields: [{
                name: 'body', label: 'Only you can read this', type: 'textarea', rows: 6,
                value: note ? note.body : '',
                hint: 'Stored in a table players cannot reach, not hidden in the page.'
            }],
            onSubmit: async values => {
                if (!values.body) {
                    if (note) await run(db.from('dm_notes').delete().eq('id', note.id), 'Could not remove the note.');
                } else if (note) {
                    await run(db.from('dm_notes').update({ body: values.body }).eq('id', note.id),
                              'Could not save the note.');
                } else {
                    await run(db.from('dm_notes').insert({
                        game_world_id: session.gameWorldId, [key]: id, body: values.body
                    }), 'Could not save the note.');
                }
                await refresh();
            }
        });
    };

    // ========================================
    // Overview
    // ========================================

    function overviewTab() {
        const cm = d.campaign;
        const published = d.sessions.filter(s => isDM || s.is_published);

        return `
            <div class="section-head"><span class="eyebrow">Summary</span><span class="rule"></span></div>
            <p class="prose">${cm.summary ? escapeHtml(cm.summary) : 'No summary yet.'}</p>
            ${dmNoteBlock('campaign_id', cm.id, cm.name)}

            <div class="section-head">
                <span class="eyebrow">At a glance</span><span class="rule"></span>
            </div>
            <div class="chipline wrap">
                <div class="chip">${d.members.filter(m => m.status === 'active').length}<span>PARTY</span></div>
                <div class="chip">${d.storylines.length}<span>STORYLINES</span></div>
                <div class="chip">${d.areas.length}<span>AREAS</span></div>
                <div class="chip">${d.npcs.length}<span>NPCS</span></div>
                <div class="chip">${d.monsters.length}<span>MONSTERS</span></div>
                <div class="chip">${d.encounters.length}<span>ENCOUNTERS</span></div>
            </div>

            <div class="section-head">
                <span class="eyebrow">Sessions</span><span class="rule"></span>
                ${isDM ? '<button class="btn btn-quiet btn-tiny" onclick="newSession()">Add</button>' : ''}
            </div>
            ${published.length ? `<div class="stack">${published.map(s => `
                <div class="list-row" ${isDM ? `onclick="editSession('${s.id}')"` : ''}>
                    <div class="who">
                        <div class="name">${escapeHtml(s.title || `Session ${s.session_number || ''}`.trim())}</div>
                        <div class="meta">${s.played_on ? escapeHtml(s.played_on) : 'No date'}</div>
                    </div>
                    ${revealToggle('campaign_sessions', s, 'is_published', 'Published', 'Draft')}
                </div>`).join('')}</div>`
                : '<p class="hint">No session recaps yet.</p>'}`;
    }

    window.newSession = () => sessionForm(null);
    window.editSession = id => sessionForm(d.sessions.find(s => s.id === id));

    function sessionForm(existing) {
        openModal({
            title: existing ? 'Edit session' : 'Add session',
            submitLabel: existing ? 'Save' : 'Add session',
            fields: [
                { name: 'title', label: 'Title', value: existing?.title || '', placeholder: 'The bridge at dusk' },
                { name: 'session_number', label: 'Session number', type: 'number', value: existing?.session_number ?? '' },
                { name: 'played_on', label: 'Played on', type: 'date', value: existing?.played_on || '' },
                { name: 'recap', label: 'Recap', type: 'textarea', rows: 6, value: existing?.recap || '',
                  hint: 'Players see this once it is published.' },
                { name: 'is_published', type: 'checkbox', label: '', checkboxLabel: 'Visible to players',
                  value: existing ? existing.is_published : false }
            ],
            onSubmit: async values => {
                const payload = {
                    title: values.title || null,
                    session_number: values.session_number,
                    played_on: values.played_on || null,
                    recap: values.recap || null,
                    is_published: values.is_published
                };
                if (existing) {
                    await run(db.from('campaign_sessions').update(payload).eq('id', existing.id), 'Could not save.');
                } else {
                    await run(db.from('campaign_sessions').insert({
                        ...payload, campaign_id: campaignId, game_world_id: session.gameWorldId
                    }), 'Could not add the session.');
                }
                await refresh();
            }
        });
    }

    // ========================================
    // Party
    // ========================================

    function partyTab() {
        const byId = Object.fromEntries(d.worldChars.map(ch => [ch.id, ch]));
        const active = d.members.filter(m => m.status === 'active');
        const past = d.members.filter(m => m.status !== 'active');

        const row = m => {
            const ch = byId[m.character_id];
            if (!ch) return '';
            return `
                <div class="list-row">
                    <div class="avatar">${escapeHtml((ch.name || '?').charAt(0).toUpperCase())}</div>
                    <div class="who">
                        <div class="name">${escapeHtml(ch.name)}</div>
                        <div class="meta">Lv ${ch.level || 1} ${escapeHtml(ch.class || '')} · ${escapeHtml(ch.player_name || '')}</div>
                    </div>
                    <div style="width:120px;flex:none">
                        ${renderHP(ch.current_hit_points, ch.hit_point_maximum, ch.temporary_hit_points, 'inline')}
                    </div>
                    <div class="row-actions">
                        <a class="btn btn-quiet btn-tiny" href="character-sheet.html?id=${encodeURIComponent(ch.id)}">Sheet</a>
                        ${isDM && m.status === 'active'
                            ? `<button class="btn btn-quiet btn-tiny" onclick="leaveParty('${m.id}')">Remove</button>` : ''}
                        ${isDM && m.status !== 'active'
                            ? `<button class="btn btn-quiet btn-tiny" onclick="rejoinParty('${m.id}')">Re-add</button>` : ''}
                    </div>
                </div>`;
        };

        return `
            <div class="section-head">
                <span class="eyebrow">Party</span><span class="rule"></span>
                ${isDM ? '<button class="btn btn-quiet btn-tiny" onclick="pullFromWorld()">Add from world</button>' : ''}
            </div>
            ${active.length
                ? `<div class="stack">${active.map(row).join('')}</div>`
                : `<div class="empty-state">
                       <h3>No one in this campaign yet</h3>
                       <p>Characters live in the world. Pull them into a campaign to form its party — they stay available to every other campaign in this world.</p>
                       ${isDM ? '<button class="btn btn-accent" onclick="pullFromWorld()">Add from world</button>' : ''}
                   </div>`}
            ${past.length ? `
                <div class="section-head"><span class="eyebrow">Former members</span><span class="rule"></span></div>
                <div class="stack">${past.map(row).join('')}</div>` : ''}`;
    }

    window.pullFromWorld = () => {
        const inCampaign = new Set(d.members.filter(m => m.status === 'active').map(m => m.character_id));
        const available = d.worldChars.filter(ch => !inCampaign.has(ch.id));

        if (!available.length) {
            toast('Every character in this world is already in this campaign.');
            return;
        }

        openModal({
            title: 'Add from world',
            submitLabel: 'Add to campaign',
            fields: [{
                name: 'character_id', label: 'Character', type: 'select',
                options: available.map(ch => ({ value: ch.id, label: `${ch.name} — Lv ${ch.level || 1} ${ch.class || ''}` })),
                value: available[0].id,
                hint: 'The character stays in the world roster and can join other campaigns too.'
            }],
            onSubmit: async values => {
                // A character who left this campaign already has a row, and
                // (campaign_id, character_id) is unique -- so reactivate rather
                // than insert, which would fail.
                const existing = d.members.find(m => m.character_id === values.character_id);
                if (existing) {
                    await run(db.from('campaign_characters')
                        .update({ status: 'active', left_at: null }).eq('id', existing.id),
                        'Could not add that character.');
                } else {
                    await run(db.from('campaign_characters').insert({
                        campaign_id: campaignId,
                        character_id: values.character_id,
                        game_world_id: session.gameWorldId,
                        status: 'active'
                    }), 'Could not add that character.');
                }
                await refresh();
            }
        });
    };

    window.leaveParty = async id => {
        if (await run(db.from('campaign_characters')
            .update({ status: 'inactive', left_at: new Date().toISOString() }).eq('id', id),
            'Could not remove that character.')) {
            await refresh();
        }
    };

    window.rejoinParty = async id => {
        if (await run(db.from('campaign_characters')
            .update({ status: 'active', left_at: null }).eq('id', id),
            'Could not re-add that character.')) {
            await refresh();
        }
    };

    // ========================================
    // Storylines
    // ========================================

    function checkRow(check) {
        const what = check.check_type === 'skill_check'
            ? check.skill_name
            : (check.ability || '').toUpperCase();
        const kind = check.check_type === 'saving_throw' ? 'save' : 'check';
        return `
            <div class="check-row">
                <span class="dc">DC ${check.dc}</span>
                <span>${escapeHtml(what || '')} ${kind}</span>
                <span style="flex:1;min-width:0;color:var(--text-tertiary)">${escapeHtml(check.label)}</span>
                ${check.is_secret ? '<span class="hidden-pill">secret</span>' : ''}
            </div>`;
    }

    function storylinesTab() {
        if (!d.storylines.length) {
            return `<div class="empty-state">
                        <h3>No storylines yet</h3>
                        <p>${isDM ? 'A storyline holds ordered beats, each with its own read-aloud text, DM notes and check requirements.'
                                  : 'Nothing has been revealed yet.'}</p>
                        ${isDM ? '<button class="btn btn-accent" onclick="newStoryline()">New storyline</button>' : ''}
                    </div>`;
        }

        return `
            <div class="section-head">
                <span class="eyebrow">Storylines</span><span class="rule"></span>
                ${isDM ? '<button class="btn btn-quiet btn-tiny" onclick="newStoryline()">New</button>' : ''}
            </div>
            ${d.storylines.map(s => {
                const beats = d.beats.filter(b => b.storyline_id === s.id);
                return `
                    <div class="campaign-card" style="cursor:default">
                        <div class="head">
                            <h3>${escapeHtml(s.title)}</h3>
                            <span class="status-pill is-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
                            ${revealToggle('storylines', s, 'is_revealed', 'Visible', 'Hidden')}
                        </div>
                        ${s.player_summary ? `<p class="summary">${escapeHtml(s.player_summary)}</p>` : ''}
                        ${isDM && s.body ? `<p class="prose">${escapeHtml(s.body)}</p>` : ''}
                        <div class="beat-list">
                            ${beats.map(b => {
                                const bChecks = d.checks.filter(k => k.storyline_beat_id === b.id);
                                return `
                                    <div class="list-row" style="flex-direction:column;align-items:stretch;gap:var(--space-6);cursor:default">
                                        <div style="display:flex;align-items:center;gap:var(--space-sm)">
                                            <div class="who">
                                                <div class="name">${escapeHtml(b.title)}</div>
                                                <div class="meta">${escapeHtml(b.status)}</div>
                                            </div>
                                            ${revealToggle('storyline_beats', b, 'is_revealed', 'Visible', 'Hidden')}
                                        </div>
                                        ${b.read_aloud ? `<p class="prose">${escapeHtml(b.read_aloud)}</p>` : ''}
                                        ${bChecks.map(checkRow).join('')}
                                        ${dmNoteBlock('storyline_beat_id', b.id, b.title)}
                                    </div>`;
                            }).join('')}
                            ${isDM ? `<button class="btn btn-quiet btn-tiny" style="align-self:flex-start"
                                        onclick="newBeat('${s.id}')">Add beat</button>` : ''}
                        </div>
                    </div>`;
            }).join('')}`;
    }

    window.newStoryline = () => {
        openModal({
            title: 'New storyline',
            submitLabel: 'Create',
            fields: [
                { name: 'title', label: 'Title', required: true },
                { name: 'player_summary', label: 'What the party knows', type: 'textarea', rows: 3 },
                { name: 'body', label: 'Your notes on it', type: 'textarea', rows: 5,
                  hint: 'DM-facing. Hidden from players while the storyline is hidden.' },
                { name: 'is_revealed', type: 'checkbox', label: '', checkboxLabel: 'Visible to players', value: false }
            ],
            onSubmit: async values => {
                await run(db.from('storylines').insert({
                    campaign_id: campaignId, game_world_id: session.gameWorldId,
                    title: values.title, player_summary: values.player_summary || null,
                    body: values.body || null, is_revealed: values.is_revealed,
                    sort_order: d.storylines.length
                }), 'Could not create the storyline.');
                await refresh();
            }
        });
    };

    window.newBeat = storylineId => {
        openModal({
            title: 'New beat',
            submitLabel: 'Add beat',
            fields: [
                { name: 'title', label: 'Title', required: true },
                { name: 'read_aloud', label: 'Read-aloud text', type: 'textarea', rows: 4 },
                { name: 'body', label: 'Your notes', type: 'textarea', rows: 4 },
                { name: 'is_revealed', type: 'checkbox', label: '', checkboxLabel: 'Visible to players', value: false }
            ],
            onSubmit: async values => {
                const siblings = d.beats.filter(b => b.storyline_id === storylineId);
                await run(db.from('storyline_beats').insert({
                    storyline_id: storylineId, game_world_id: session.gameWorldId,
                    title: values.title, read_aloud: values.read_aloud || null,
                    body: values.body || null, is_revealed: values.is_revealed,
                    sort_order: siblings.length
                }), 'Could not add the beat.');
                await refresh();
            }
        });
    };

    // ========================================
    // Areas
    // ========================================

    function areaNode(area, depth) {
        const children = d.areas.filter(a => a.parent_area_id === area.id);
        return `
            <div class="${depth ? 'tree-child' : ''}">
                <div class="list-row" style="flex-direction:column;align-items:stretch;gap:var(--space-6);cursor:default">
                    <div style="display:flex;align-items:center;gap:var(--space-sm)">
                        <div class="who">
                            <div class="name">${escapeHtml(area.name)}</div>
                            <div class="meta">${escapeHtml(area.area_type)}</div>
                        </div>
                        ${revealToggle('areas', area, 'is_discovered', 'Discovered', 'Undiscovered')}
                        ${isDM ? `<button class="btn btn-quiet btn-tiny" onclick="newArea('${area.id}')">Add inside</button>` : ''}
                    </div>
                    ${area.description ? `<p class="prose">${escapeHtml(area.description)}</p>` : ''}
                    ${dmNoteBlock('area_id', area.id, area.name)}
                </div>
                ${children.map(child => areaNode(child, depth + 1)).join('')}
            </div>`;
    }

    function areasTab() {
        const roots = d.areas.filter(a => !a.parent_area_id || !d.areas.some(x => x.id === a.parent_area_id));
        if (!d.areas.length) {
            return `<div class="empty-state">
                        <h3>No areas yet</h3>
                        <p>${isDM ? 'Areas nest: a region holds a city, a city holds a tavern.'
                                  : 'Nowhere has been revealed yet.'}</p>
                        ${isDM ? '<button class="btn btn-accent" onclick="newArea(null)">New area</button>' : ''}
                    </div>`;
        }
        return `
            <div class="section-head">
                <span class="eyebrow">Areas</span><span class="rule"></span>
                ${isDM ? '<button class="btn btn-quiet btn-tiny" onclick="newArea(null)">New</button>' : ''}
            </div>
            <div class="stack">${roots.map(a => areaNode(a, 0)).join('')}</div>`;
    }

    window.newArea = parentId => {
        const parent = parentId ? d.areas.find(a => a.id === parentId) : null;
        openModal({
            title: parent ? `New area inside ${parent.name}` : 'New area',
            submitLabel: 'Create',
            fields: [
                { name: 'name', label: 'Name', required: true },
                { name: 'area_type', label: 'Type', type: 'select', value: 'location',
                  options: AREA_TYPES.map(t => ({ value: t, label: t[0].toUpperCase() + t.slice(1) })) },
                { name: 'description', label: 'Description', type: 'textarea', rows: 4,
                  hint: 'Players see this once the area is discovered.' },
                { name: 'is_discovered', type: 'checkbox', label: '', checkboxLabel: 'Players have discovered it', value: false }
            ],
            onSubmit: async values => {
                await run(db.from('areas').insert({
                    campaign_id: campaignId, game_world_id: session.gameWorldId,
                    parent_area_id: parentId || null,
                    name: values.name, area_type: values.area_type,
                    description: values.description || null,
                    is_discovered: values.is_discovered,
                    sort_order: d.areas.length
                }), 'Could not create the area.');
                await refresh();
            }
        });
    };

    // ========================================
    // NPCs
    // ========================================

    function npcsTab() {
        if (!d.npcs.length) {
            return `<div class="empty-state">
                        <h3>No NPCs yet</h3>
                        <p>${isDM ? 'A shopkeeper stays three fields. A villain can carry a stat block and drop into an encounter.'
                                  : 'You have not met anyone yet.'}</p>
                        ${isDM ? '<button class="btn btn-accent" onclick="newNPC()">New NPC</button>' : ''}
                    </div>`;
        }
        const areaName = id => (d.areas.find(a => a.id === id) || {}).name;
        return `
            <div class="section-head">
                <span class="eyebrow">NPCs</span><span class="rule"></span>
                ${isDM ? '<button class="btn btn-quiet btn-tiny" onclick="newNPC()">New</button>' : ''}
            </div>
            <div class="stack">${d.npcs.map(n => `
                <div class="list-row" style="flex-direction:column;align-items:stretch;gap:var(--space-6);cursor:default">
                    <div style="display:flex;align-items:center;gap:var(--space-sm)">
                        <div class="avatar">${escapeHtml((n.name || '?').charAt(0).toUpperCase())}</div>
                        <div class="who">
                            <div class="name">${escapeHtml(n.name)}</div>
                            <div class="meta">${[n.title, n.faction, areaName(n.area_id)].filter(Boolean).map(escapeHtml).join(' · ')}</div>
                        </div>
                        <span class="status-pill">${escapeHtml(n.disposition)}</span>
                        ${revealToggle('npcs', n, 'is_known_to_players', 'Known', 'Unknown')}
                    </div>
                    ${n.description ? `<p class="prose">${escapeHtml(n.description)}</p>` : ''}
                    ${dmNoteBlock('npc_id', n.id, n.name)}
                </div>`).join('')}</div>`;
    }

    window.newNPC = () => {
        openModal({
            title: 'New NPC',
            submitLabel: 'Create',
            fields: [
                { name: 'name', label: 'Name', required: true },
                { name: 'title', label: 'Title or role', placeholder: 'Harbourmaster of Sel' },
                { name: 'faction', label: 'Faction' },
                { name: 'area_id', label: 'Where they are', type: 'select', value: '',
                  options: [{ value: '', label: '— nowhere in particular —' }]
                      .concat(d.areas.map(a => ({ value: a.id, label: a.name }))) },
                { name: 'disposition', label: 'Disposition', type: 'select', value: 'neutral',
                  options: ['friendly', 'neutral', 'hostile', 'unknown']
                      .map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
                { name: 'description', label: 'What players can see', type: 'textarea', rows: 3 },
                { name: 'is_known_to_players', type: 'checkbox', label: '',
                  checkboxLabel: 'Players know this NPC exists', value: false }
            ],
            onSubmit: async values => {
                await run(db.from('npcs').insert({
                    campaign_id: campaignId, game_world_id: session.gameWorldId,
                    name: values.name, title: values.title || null, faction: values.faction || null,
                    area_id: values.area_id || null, disposition: values.disposition,
                    description: values.description || null,
                    is_known_to_players: values.is_known_to_players,
                    sort_order: d.npcs.length
                }), 'Could not create the NPC.');
                await refresh();
            }
        });
    };

    // ========================================
    // Monsters and encounters (read-only until their screens exist)
    // ========================================

    function monstersTab() {
        if (!d.monsters.length) {
            return `<div class="empty-state">
                        <h3>No monsters in this campaign</h3>
                        <p>The roster is filled from the Compendium, which is not built yet. It will add SRD monsters by reference and let you author homebrew stat blocks.</p>
                    </div>`;
        }
        return `<div class="stack">${d.monsters.map(m => `
            <div class="list-row" style="cursor:default">
                <div class="who">
                    <div class="name">${escapeHtml(m.name)}</div>
                    <div class="meta">${escapeHtml(m.source === 'homebrew' ? 'Homebrew' : 'SRD')}${
                        m.challenge_rating !== null && m.challenge_rating !== undefined ? ` · CR ${m.challenge_rating}` : ''}</div>
                </div>
                <div class="mono lvl">${m.max_hit_points ?? '—'} HP</div>
            </div>`).join('')}</div>`;
    }

    function encountersTab() {
        if (!d.encounters.length) {
            return `<div class="empty-state">
                        <h3>No encounters yet</h3>
                        <p>Build one from this campaign's monster roster, then run it in the tracker.</p>
                        <a class="btn btn-accent" href="monster-tracker.html">Open the tracker</a>
                    </div>`;
        }
        return `<div class="stack">${d.encounters.map(e => `
            <a class="list-row" href="monster-tracker.html?id=${encodeURIComponent(e.id)}">
                <div class="who">
                    <div class="name">${escapeHtml(e.name)}</div>
                    <div class="meta">${escapeHtml(e.status)}${e.status === 'active' ? ` · round ${e.round || 0}` : ''}</div>
                </div>
                ${e.status === 'active' ? '<span class="mono nav-count is-live">LIVE</span>' : ''}
            </a>`).join('')}</div>`;
    }

    // ========================================
    // Render
    // ========================================

    window.campaignTab = id => { activeTab = id; draw(); };

    window.editCampaign = () => {
        const cm = d.campaign;
        openModal({
            title: 'Edit campaign',
            submitLabel: 'Save',
            fields: [
                { name: 'name', label: 'Name', required: true, value: cm.name },
                { name: 'summary', label: 'Summary', type: 'textarea', rows: 3, value: cm.summary || '' },
                { name: 'status', label: 'Status', type: 'select', value: cm.status,
                  options: STATUSES.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) }
            ],
            onSubmit: async values => {
                const { error } = await db.from('campaigns').update({
                    name: values.name, summary: values.summary || null, status: values.status
                }).eq('id', cm.id);
                if (error) {
                    if (error.code === '23505') throw new Error('A campaign in this world already has that name.');
                    throw new Error(error.message || 'Could not save.');
                }
                await refresh();
            }
        });
    };

    function tabBody() {
        switch (activeTab) {
            case 'party':      return partyTab();
            case 'storylines': return storylinesTab();
            case 'areas':      return areasTab();
            case 'npcs':       return npcsTab();
            case 'monsters':   return monstersTab();
            case 'encounters': return encountersTab();
            default:           return overviewTab();
        }
    }

    function tabCount(id) {
        switch (id) {
            case 'party':      return d.members.filter(m => m.status === 'active').length;
            case 'storylines': return d.storylines.length;
            case 'areas':      return d.areas.length;
            case 'npcs':       return d.npcs.length;
            case 'monsters':   return d.monsters.length;
            case 'encounters': return d.encounters.length;
            default:           return null;
        }
    }

    function draw() {
        const cm = d.campaign;
        renderShell({
            active: 'campaigns',
            title: cm.name,
            sub: `${session.gameWorldName} · ${cm.status}`,
            topbarExtra: isDM ? '<button class="btn" onclick="editCampaign()">Edit campaign</button>' : ''
        });

        $('#main-content').innerHTML = `
            <div class="campaign-head">
                <div class="title-row">
                    <a class="btn btn-quiet btn-tiny" href="campaigns.html">← All campaigns</a>
                    <span class="status-pill is-${escapeHtml(cm.status)}">${escapeHtml(cm.status)}</span>
                </div>
            </div>
            <div class="campaign-tabs">
                ${TABS.map(t => {
                    const n = tabCount(t.id);
                    return `<button class="${t.id === activeTab ? 'is-active' : ''}" onclick="campaignTab('${t.id}')">
                                ${escapeHtml(t.label)}${n !== null ? `<span class="count">${n}</span>` : ''}
                            </button>`;
                }).join('')}
            </div>
            <div class="campaign-tab-body">${tabBody()}</div>`;
    }

    (async function init() {
        if (!campaignId) {
            window.location.replace('campaigns.html');
            return;
        }
        renderShell({ active: 'campaigns', title: 'Campaign', sub: session.gameWorldName || '' });
        $('#main-content').innerHTML = '<div class="skeleton"></div>';

        try {
            d = await load();
            draw();
        } catch (err) {
            console.error('Failed to load campaign:', err);
            $('#main-content').innerHTML = `
                <div class="error-banner">Could not load that campaign.</div>
                <a class="btn" href="campaigns.html">Back to campaigns</a>`;
        }
    })();
})();
