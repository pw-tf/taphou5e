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
    // These two mirror the check constraints on chapters.status and
    // chapter_beats.status; anything else is rejected by the database.
    const CHAPTER_STATUSES = ['planned', 'active', 'completed', 'abandoned'];
    const BEAT_STATUSES = ['pending', 'in_progress', 'completed', 'skipped'];
    const AREA_TYPES = ['region', 'settlement', 'dungeon', 'landmark', 'building', 'plane', 'location', 'other'];

    const TABS = [
        { id: 'overview',   label: 'Overview' },
        { id: 'party',      label: 'Party' },
        { id: 'chapters', label: 'Chapters' },
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
        const [campaign, members, worldChars, chapters, beats, checks,
               areas, npcs, monsters, encounters, sessions, notes] = await Promise.all([
            db.from('campaigns').select('*').eq('id', campaignId).single(),
            db.from('campaign_characters').select('*').eq('campaign_id', campaignId),
            db.from('characters').select('id, name, player_name, class, level, current_hit_points, hit_point_maximum, temporary_hit_points')
              .eq('game_world_id', session.gameWorldId).order('name'),
            db.from('chapters').select('*').eq('campaign_id', campaignId).order('sort_order'),
            db.from('chapter_beats').select('*').eq('game_world_id', session.gameWorldId).order('sort_order'),
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

        const chapterIds = new Set((chapters.data || []).map(s => s.id));

        return {
            campaign: campaign.data,
            members: members.data || [],
            worldChars: worldChars.data || [],
            chapters: chapters.data || [],
            // Beats are fetched per world (they carry no campaign_id) then
            // filtered to this campaign's chapters.
            beats: (beats.data || []).filter(b => chapterIds.has(b.chapter_id)),
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
                <div class="chip">${d.chapters.length}<span>STORYLINES</span></div>
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
                <div class="list-row party-row" data-holdable data-kind="party" data-id="${escapeHtml(m.id)}">
                    <div class="avatar">${escapeHtml((ch.name || '?').charAt(0).toUpperCase())}</div>
                    <div class="who">
                        <div class="name">${escapeHtml(ch.name)}</div>
                        <div class="meta">Lv ${ch.level || 1} ${escapeHtml(ch.class || '')} · ${escapeHtml(ch.player_name || '')}</div>
                    </div>
                    <div class="party-hp">
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
    // Chapters
    // ========================================

    const SKILL_NAMES = ['Acrobatics', 'Animal Handling', 'Arcana', 'Athletics', 'Deception',
        'History', 'Insight', 'Intimidation', 'Investigation', 'Medicine', 'Nature', 'Perception',
        'Performance', 'Persuasion', 'Religion', 'Sleight of Hand', 'Stealth', 'Survival'];
    const ABILITY_CODES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];

    // campaign_checks can hang off a beat, an area, an NPC or an encounter --
    // exactly one, enforced by check constraint. The caller says which.
    // One form for creating and editing a check, so the two can never drift
    // apart on which fields exist or how a type maps onto them.
    function checkForm({ title, submitLabel, check, onSave }) {
        const current = check || {};
        openModal({
            title,
            submitLabel,
            fields: [
                { name: 'label', label: 'What is being attempted', required: true,
                  placeholder: 'Spot the tripwire', value: current.label || '' },
                { name: 'check_type', label: 'Type', type: 'select',
                  value: current.check_type || 'skill_check',
                  options: [
                      { value: 'skill_check', label: 'Skill check' },
                      { value: 'ability_check', label: 'Ability check' },
                      { value: 'saving_throw', label: 'Saving throw' },
                      { value: 'contested', label: 'Contested' }
                  ] },
                { name: 'skill_name', label: 'Skill (for a skill check)', type: 'select',
                  value: current.skill_name || 'Perception',
                  options: SKILL_NAMES.map(n => ({ value: n, label: n })) },
                { name: 'ability', label: 'Ability (for an ability check or save)', type: 'select',
                  value: current.ability || 'dex',
                  options: ABILITY_CODES.map(a => ({ value: a, label: a.toUpperCase() })) },
                { name: 'dc', label: 'DC', type: 'number', value: current.dc ?? 12,
                  hint: 'Between 1 and 40.' },
                { name: 'success_text', label: 'On a success', type: 'textarea', rows: 2,
                  value: current.success_text || '',
                  placeholder: 'They spot the wire and the trap never triggers.' },
                { name: 'failure_text', label: 'On a failure', type: 'textarea', rows: 2,
                  value: current.failure_text || '',
                  placeholder: 'The wire snaps and the darts fire.' },
                { name: 'is_secret', type: 'checkbox', label: '',
                  checkboxLabel: 'Secret — you roll it, the party does not know',
                  value: !!current.is_secret },
                { name: 'is_group_check', type: 'checkbox', label: '',
                  checkboxLabel: 'Group check', value: !!current.is_group_check }
            ],
            onSubmit: async values => {
                const dc = Number(values.dc);
                if (!Number.isFinite(dc) || dc < 1 || dc > 40) {
                    throw new Error('DC must be between 1 and 40.');
                }
                // The shape constraint wants the field its type actually uses,
                // and nothing else, so a stale select never lands in the row.
                await onSave({
                    label: values.label,
                    check_type: values.check_type,
                    dc,
                    skill_name: values.check_type === 'skill_check' ? values.skill_name : null,
                    ability: (values.check_type === 'ability_check' || values.check_type === 'saving_throw')
                        ? values.ability : null,
                    success_text: values.success_text || null,
                    failure_text: values.failure_text || null,
                    is_secret: values.is_secret,
                    is_group_check: values.is_group_check
                });
                await refresh();
            }
        });
    }

    window.newCheck = (parentColumn, parentId, contextLabel) => {
        checkForm({
            title: `New check — ${contextLabel}`,
            submitLabel: 'Add check',
            onSave: async payload => {
                const { error } = await db.from('campaign_checks').insert({
                    campaign_id: campaignId,
                    game_world_id: session.gameWorldId,
                    [parentColumn]: parentId,
                    sort_order: d.checks.length,
                    ...payload
                });
                if (error) throw new Error(error.message || 'Could not add that check.');
            }
        });
    };

    window.editCheck = id => {
        const check = d.checks.find(k => k.id === id);
        if (!check) return;
        checkForm({
            title: `Edit — ${check.label}`,
            submitLabel: 'Save check',
            check,
            onSave: async payload => {
                const { error } = await db.from('campaign_checks').update(payload).eq('id', id);
                if (error) throw new Error(error.message || 'Could not save that check.');
            }
        });
    };

    window.deleteCheck = async id => {
        if (await run(db.from('campaign_checks').delete().eq('id', id), 'Could not remove that check.')) {
            await refresh();
        }
    };

    // success_text and failure_text were collected by the form, stored, and
    // never shown -- which is the whole reason you write one down.
    function checkRow(check) {
        const what = check.check_type === 'skill_check'
            ? check.skill_name
            : (check.ability || '').toUpperCase();
        const kind = check.check_type === 'saving_throw' ? 'save' : 'check';
        const outcomes = [
            ['pass', 'On a success', check.success_text],
            ['fail', 'On a failure', check.failure_text]
        ].filter(([, , text]) => text && String(text).trim());

        return `
            <div class="check-block">
                <div class="check-row">
                    <span class="dc">DC ${check.dc}</span>
                    <span>${escapeHtml(what || '')} ${kind}</span>
                    <span style="flex:1;min-width:0;color:var(--text-tertiary)">${escapeHtml(check.label)}</span>
                    ${check.is_group_check ? '<span class="hidden-pill">group</span>' : ''}
                    ${check.is_secret ? '<span class="hidden-pill">secret</span>' : ''}
                    ${isDM ? `<button class="btn btn-quiet btn-tiny"
                                      onclick="editCheck('${check.id}')">Edit</button>` : ''}
                </div>
                ${outcomes.map(([tone, label, text]) => `
                    <div class="outcome is-${tone}">
                        <span class="eyebrow">${label}</span>
                        <span>${escapeHtml(text)}</span>
                    </div>`).join('')}
            </div>`;
    }

    function chaptersTab() {
        if (!d.chapters.length) {
            return `<div class="empty-state">
                        <h3>No chapters yet</h3>
                        <p>${isDM ? 'A chapter holds ordered beats, each with its own read-aloud text, DM notes and check requirements.'
                                  : 'Nothing has been revealed yet.'}</p>
                        ${isDM ? '<button class="btn btn-accent" onclick="newChapter()">New chapter</button>' : ''}
                    </div>`;
        }

        return `
            <div class="section-head">
                <span class="eyebrow">Chapters</span><span class="rule"></span>
                ${isDM ? '<button class="btn btn-quiet btn-tiny" onclick="newChapter()">New</button>' : ''}
            </div>
            ${d.chapters.map(s => {
                const beats = d.beats.filter(b => b.chapter_id === s.id);
                return `
                    <div class="campaign-card" data-holdable data-kind="chapter"
                         data-id="${escapeHtml(s.id)}" style="cursor:default">
                        <div class="head">
                            <h3>${escapeHtml(s.title)}</h3>
                            <span class="status-pill is-${escapeHtml(s.status)}">${escapeHtml(s.status)}</span>
                            ${revealToggle('chapters', s, 'is_revealed', 'Visible', 'Hidden')}
                        </div>
                        ${s.player_summary ? `<p class="prose">${escapeHtml(s.player_summary)}</p>` : ''}
                        ${dmNoteBlock('chapter_id', s.id, s.title)}
                        <div class="beat-list">
                            ${beats.map(b => {
                                const bChecks = d.checks.filter(k => k.chapter_beat_id === b.id);
                                return `
                                    <div class="list-row" data-holdable data-kind="beat" data-id="${escapeHtml(b.id)}"
                                         style="flex-direction:column;align-items:stretch;gap:var(--space-6);cursor:default">
                                        <div style="display:flex;align-items:center;gap:var(--space-sm)">
                                            <div class="who">
                                                <div class="name">${escapeHtml(b.title)}</div>
                                                <div class="meta">${escapeHtml(b.status)}</div>
                                            </div>
                                            ${revealToggle('chapter_beats', b, 'is_revealed', 'Visible', 'Hidden')}
                                        </div>
                                        ${b.read_aloud ? `<p class="prose">${escapeHtml(b.read_aloud)}</p>` : ''}
                                        ${d.encounters.filter(e => e.chapter_beat_id === b.id).map(e => `
                                            <a class="check-row" href="monster-tracker.html?id=${encodeURIComponent(e.id)}">
                                                <span class="dc">ENCOUNTER</span>
                                                <span style="flex:1;min-width:0">${escapeHtml(e.name)}</span>
                                                ${e.status === 'active'
                                                    ? '<span class="mono nav-count is-live">LIVE</span>'
                                                    : `<span class="hidden-pill">${escapeHtml(e.status)}</span>`}
                                            </a>`).join('')}
                                        ${bChecks.map(checkRow).join('')}
                                        ${isDM ? `<button class="btn btn-quiet btn-tiny" style="align-self:flex-start"
                                                    onclick="newCheck('chapter_beat_id','${b.id}',${
                                                        JSON.stringify(b.title).replace(/"/g, '&quot;')})">Add check</button>` : ''}
                                        ${dmNoteBlock('chapter_beat_id', b.id, b.title)}
                                    </div>`;
                            }).join('')}
                            ${isDM ? `<button class="btn btn-quiet btn-tiny" style="align-self:flex-start"
                                        onclick="newBeat('${s.id}')">Add beat</button>` : ''}
                        </div>
                    </div>`;
            }).join('')}`;
    }

    window.newChapter = () => {
        openModal({
            title: 'New chapter',
            submitLabel: 'Create',
            fields: [
                { name: 'title', label: 'Title', required: true },
                { name: 'player_summary', label: 'What the party knows', type: 'textarea', rows: 3,
                  hint: 'Players can read this once the chapter is revealed. Your own notes go in the DM note below it.' },
                { name: 'is_revealed', type: 'checkbox', label: '', checkboxLabel: 'Visible to players', value: false }
            ],
            onSubmit: async values => {
                await run(db.from('chapters').insert({
                    campaign_id: campaignId, game_world_id: session.gameWorldId,
                    title: values.title, player_summary: values.player_summary || null,
                    is_revealed: values.is_revealed,
                    sort_order: d.chapters.length
                }), 'Could not create the chapter.');
                await refresh();
            }
        });
    };

    window.editChapter = id => {
        const chapter = d.chapters.find(c => c.id === id);
        if (!chapter) return;
        openModal({
            title: `Edit ${chapter.title}`,
            submitLabel: 'Save chapter',
            fields: [
                { name: 'title', label: 'Title', required: true, value: chapter.title },
                { name: 'player_summary', label: 'What the party knows', type: 'textarea', rows: 4,
                  value: chapter.player_summary || '',
                  hint: 'Players can read this once the chapter is revealed.' },
                { name: 'status', label: 'Status', type: 'select', value: chapter.status,
                  options: CHAPTER_STATUSES.map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) }
            ],
            onSubmit: async values => {
                const { error } = await db.from('chapters').update({
                    title: values.title,
                    player_summary: values.player_summary || null,
                    status: values.status
                }).eq('id', id);
                if (error) throw new Error(error.message || 'Could not save the chapter.');
                await refresh();
            }
        });
    };

    window.editBeat = id => {
        const beat = d.beats.find(b => b.id === id);
        if (!beat) return;
        openModal({
            title: `Edit ${beat.title}`,
            submitLabel: 'Save beat',
            fields: [
                { name: 'title', label: 'Title', required: true, value: beat.title },
                { name: 'read_aloud', label: 'Read-aloud text', type: 'textarea', rows: 4,
                  value: beat.read_aloud || '',
                  hint: 'Players see this once the beat is revealed.' },
                { name: 'status', label: 'Status', type: 'select', value: beat.status,
                  options: BEAT_STATUSES.map(v => ({
                      value: v, label: v[0].toUpperCase() + v.slice(1).replace(/_/g, ' ') })) }
            ],
            onSubmit: async values => {
                const { error } = await db.from('chapter_beats').update({
                    title: values.title,
                    read_aloud: values.read_aloud || null,
                    status: values.status
                }).eq('id', id);
                if (error) throw new Error(error.message || 'Could not save the beat.');
                await refresh();
            }
        });
    };

    window.newBeat = chapterId => {
        openModal({
            title: 'New beat',
            submitLabel: 'Add beat',
            fields: [
                { name: 'title', label: 'Title', required: true },
                { name: 'read_aloud', label: 'Read-aloud text', type: 'textarea', rows: 4,
                  hint: 'Players see this once the beat is revealed.' },
                { name: 'note', label: 'Your notes', type: 'textarea', rows: 4,
                  hint: 'Kept in the DM notes table, which players cannot read at all.' },
                { name: 'is_revealed', type: 'checkbox', label: '', checkboxLabel: 'Visible to players', value: false }
            ],
            onSubmit: async values => {
                const siblings = d.beats.filter(b => b.chapter_id === chapterId);
                // The note goes to dm_notes rather than a column on the beat:
                // player_read on chapter_beats is USING (is_revealed), a row
                // filter, so a revealed beat would hand its columns over.
                const { data: beat, error } = await db.from('chapter_beats').insert({
                    chapter_id: chapterId, game_world_id: session.gameWorldId,
                    title: values.title, read_aloud: values.read_aloud || null,
                    is_revealed: values.is_revealed,
                    sort_order: siblings.length
                }).select('id').single();

                if (error || !beat) {
                    console.error('Could not add the beat.', error);
                    toast('Could not add the beat.', 'error');
                    return;
                }
                if (values.note) {
                    await run(db.from('dm_notes').insert({
                        game_world_id: session.gameWorldId,
                        chapter_beat_id: beat.id, body: values.note
                    }), 'The beat was added, but its note was not saved.');
                }
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
                <div class="list-row" data-holdable data-kind="area" data-id="${escapeHtml(area.id)}"
                     style="flex-direction:column;align-items:stretch;gap:var(--space-6);cursor:default">
                    <div style="display:flex;align-items:center;gap:var(--space-sm)">
                        <div class="who">
                            <div class="name">${escapeHtml(area.name)}</div>
                            <div class="meta">${escapeHtml(area.area_type)}</div>
                        </div>
                        ${revealToggle('areas', area, 'is_discovered', 'Discovered', 'Undiscovered')}
                        ${isDM ? `<button class="btn btn-quiet btn-tiny" onclick="newArea('${area.id}')">Add inside</button>` : ''}
                    </div>
                    ${area.description ? `<p class="prose">${escapeHtml(area.description)}</p>` : ''}
                    ${d.checks.filter(k => k.area_id === area.id).map(checkRow).join('')}
                    ${isDM ? `<button class="btn btn-quiet btn-tiny" style="align-self:flex-start"
                                onclick="newCheck('area_id','${area.id}',${
                                    JSON.stringify(area.name).replace(/"/g, '&quot;')})">Add check</button>` : ''}
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
                <div class="list-row" data-holdable data-kind="npc" data-id="${escapeHtml(n.id)}"
                     style="flex-direction:column;align-items:stretch;gap:var(--space-6);cursor:default">
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
                        <p>${isDM
                            ? 'Add creatures here to build the roster an encounter draws from. The tracker can also pull straight from the SRD mid-fight.'
                            : 'Your DM has not put anything on the roster yet.'}</p>
                        ${isDM ? '<button class="btn btn-accent" onclick="addMonster()">Add a monster</button>' : ''}
                    </div>`;
        }
        return `
            ${sectionHead('Roster', isDM ? 'addMonster()' : null)}
            <div class="stack">${d.monsters.map(m => `
            <div class="list-row" data-holdable data-kind="monster" data-id="${escapeHtml(m.id)}" style="cursor:default">
                <div class="who">
                    <div class="name">${escapeHtml(m.name)}</div>
                    <div class="meta">${escapeHtml(m.source === 'homebrew' ? 'Homebrew' : 'SRD')}${
                        m.challenge_rating !== null && m.challenge_rating !== undefined ? ` · CR ${m.challenge_rating}` : ''}</div>
                </div>
                <div class="mono lvl">${m.max_hit_points ?? '—'} HP</div>
            </div>`).join('')}</div>
            ${isDM ? '<p class="hint">Hold a monster (or right-click) to take it off the roster.</p>' : ''}`;
    }

    // The campaign screens had no section header helper; the sheet's shape is
    // the one people already know from the other tabs.
    function sectionHead(label, addCall) {
        return `
            <div class="section-head">
                <span class="eyebrow">${escapeHtml(label)}</span>
                <span class="rule"></span>
                ${addCall ? `<button class="btn btn-quiet btn-tiny" onclick="${addCall}">Add</button>` : ''}
            </div>`;
    }

    // Search the SRD and put the result on this campaign's roster. The same
    // shape the tracker uses, so a monster reaches the roster from either end.
    window.addMonster = () => {
        openSrdForm({
            title: 'Add a monster to the roster',
            which: 'monsters',
            submitLabel: 'Add to roster',
            toValues: monster => ({
                name: monster.name,
                max_hit_points: monster.hit_points ?? null,
                armor_class: srdArmorClass(monster.armor_class),
                challenge_rating: monster.challenge_rating ?? null,
                creature_type: monster.type || '',
                api_index: monster.index || ''
            }),
            fields: [
                { name: 'name', label: 'Name', required: true,
                  hint: 'Rename it for an elite variant; the SRD entry stays untouched.' },
                { name: 'max_hit_points', label: 'Hit points', type: 'number' },
                { name: 'armor_class', label: 'Armor class', type: 'number' },
                { name: 'challenge_rating', label: 'Challenge rating', type: 'number' },
                { name: 'creature_type', label: 'Type', placeholder: 'humanoid, beast, undead…' },
                { name: 'api_index', label: '', type: 'hidden' }
            ],
            onSubmit: async values => {
                const { error } = await db.from('campaign_monsters').insert({
                    campaign_id: campaignId,
                    game_world_id: session.gameWorldId,
                    name: values.name,
                    // Anything typed in without picking an SRD entry is
                    // homebrew, and the source column is constrained to say so.
                    source: values.api_index ? 'srd_api' : 'homebrew',
                    api_index: values.api_index || null,
                    statblock: values.api_index ? null : {
                        name: values.name,
                        armor_class: values.armor_class,
                        hit_points: values.max_hit_points
                    },
                    challenge_rating: values.challenge_rating,
                    creature_type: values.creature_type || null,
                    armor_class: values.armor_class,
                    max_hit_points: values.max_hit_points
                });
                if (error) throw new Error(error.message || 'Could not add that monster.');
                await refresh();
            }
        });
    };

    function encountersTab() {
        if (!d.encounters.length) {
            return `<div class="empty-state">
                        <h3>No encounters yet</h3>
                        <p>Build one from this campaign's monster roster, then run it in the tracker.</p>
                        <a class="btn btn-accent" href="monster-tracker.html">Open the tracker</a>
                    </div>`;
        }
        return `<div class="stack">${d.encounters.map(e => `
            <a class="list-row" href="monster-tracker.html?id=${encodeURIComponent(e.id)}"
               data-holdable data-kind="encounter" data-id="${escapeHtml(e.id)}">
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

    // Deleting a campaign takes its chapters, areas, NPCs, monsters,
    // encounters and sessions with it, by cascade. The confirmation says so and
    // counts them, because "delete campaign" does not look like it means all
    // of that.
    window.deleteCampaign = () => {
        const cm = d.campaign;
        const owned = [
            [d.chapters.length, 'chapter'],
            [d.areas.length, 'area'],
            [d.npcs.length, 'NPC'],
            [d.monsters.length, 'monster'],
            [d.encounters.length, 'encounter'],
            [d.sessions.length, 'session recap']
        ].filter(([n]) => n > 0)
         .map(([n, word]) => `${n} ${word}${n === 1 || word === 'NPC' && n === 1 ? '' : 's'}`);

        const consequences = owned.length
            ? `This also deletes its ${owned.join(', ')}.`
            : 'It holds nothing else yet.';

        // Characters are never deleted: they belong to the world, and only the
        // membership rows go.
        const party = d.members.filter(m => m.status === 'active').length;
        const partyLine = party
            ? ` ${party} character${party === 1 ? '' : 's'} leave the campaign but stay in the world.`
            : '';

        const lastOne = d.campaign.is_default
            ? ' This is the world\'s default campaign.'
            : '';

        confirmModal({
            title: `Delete ${cm.name}`,
            message: `${consequences}${partyLine}${lastOne} This cannot be undone.`,
            confirmLabel: 'Delete campaign',
            onConfirm: async () => {
                const { error } = await db.from('campaigns').delete().eq('id', cm.id);
                if (error) throw new Error(error.message || 'Could not delete the campaign.');
                window.location.href = 'campaigns.html';
            }
        });
    };

    function tabBody() {
        switch (activeTab) {
            case 'party':      return partyTab();
            case 'chapters': return chaptersTab();
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
            case 'chapters': return d.chapters.length;
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
            actions: isDM
                ? [{ label: 'Edit campaign', onclick: 'editCampaign()' },
                   { label: 'Delete campaign', onclick: 'deleteCampaign()' }]
                : []
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
            <div class="campaign-tab-body holdable">${tabBody()}</div>`;

        wireCardMenus('.campaign-tab-body', '[data-holdable]', rowMenu);
    }

    // ========================================
    // Press-and-hold row menus
    //
    // Every tab's rows are reachable by the same gesture, so one resolver
    // switches on the kind the row declares rather than each tab wiring its
    // own. Only a DM gets a menu: everything on it writes.
    // ========================================

    // Chapters, beats, areas, NPCs and roster monsters all delete the same
    // way -- one row, by id, then redraw.
    async function deleteRow(table, id, title, message) {
        confirmModal({
            title,
            message,
            confirmLabel: 'Delete',
            onConfirm: async () => {
                const { error } = await db.from(table).delete().eq('id', id);
                if (error) throw new Error(error.message || 'Could not delete that.');
                await refresh();
            }
        });
    }

    function rowMenu(row) {
        if (!isDM) return null;
        const id = row.dataset.id;

        switch (row.dataset.kind) {
            case 'party': {
                const member = d.members.find(m => m.id === id);
                const ch = member && d.worldChars.find(c => c.id === member.character_id);
                if (!ch) return null;
                return {
                    title: ch.name,
                    actions: [
                        { label: 'Open sheet', run: () => {
                            window.location.href = `character-sheet.html?id=${encodeURIComponent(ch.id)}`; } },
                        member.status === 'active'
                            ? { label: 'Remove from campaign', danger: true,
                                hint: 'They stay in the world and can rejoin',
                                run: () => window.leaveParty(member.id) }
                            : { label: 'Re-add to campaign', run: () => window.rejoinParty(member.id) }
                    ]
                };
            }

            case 'chapter': {
                const st = d.chapters.find(x => x.id === id);
                if (!st) return null;
                const beats = d.beats.filter(b => b.chapter_id === st.id).length;
                return {
                    title: st.title,
                    actions: [
                        { label: 'Edit', hint: 'Title, summary and status',
                          run: () => window.editChapter(st.id) },
                        { label: st.is_revealed ? 'Hide from players' : 'Reveal to players',
                          run: () => window.toggleReveal('chapters', st.id, 'is_revealed', st.is_revealed) },
                        { label: 'Add a beat', run: () => window.newBeat(st.id) },
                        { label: 'Delete', danger: true,
                          hint: beats
                              ? `Its ${beats} beat${beats === 1 ? '' : 's'} ${beats === 1 ? 'goes' : 'go'} too`
                              : 'It has no beats yet',
                          run: () => deleteRow('chapters', st.id, `Delete ${st.title}`,
                              (beats ? `This also deletes its ${beats} beat${beats === 1 ? '' : 's'} and their checks. `
                                     : 'It has no beats yet. ') + 'This cannot be undone.') }
                    ]
                };
            }

            case 'beat': {
                const beat = d.beats.find(b => b.id === id);
                if (!beat) return null;
                const checks = d.checks.filter(k => k.chapter_beat_id === beat.id).length;
                return {
                    title: beat.title,
                    actions: [
                        { label: 'Edit', hint: 'Title, read-aloud text and status',
                          run: () => window.editBeat(beat.id) },
                        { label: beat.is_revealed ? 'Hide from players' : 'Reveal to players',
                          run: () => window.toggleReveal('chapter_beats', beat.id, 'is_revealed', beat.is_revealed) },
                        { label: 'Add a check', run: () => window.newCheck('chapter_beat_id', beat.id, beat.title) },
                        { label: 'Delete', danger: true,
                          hint: checks
                              ? `Its ${checks} check${checks === 1 ? '' : 's'} ${checks === 1 ? 'goes' : 'go'} too`
                              : undefined,
                          run: () => deleteRow('chapter_beats', beat.id, `Delete ${beat.title}`,
                              (checks ? `This also deletes its ${checks} check${checks === 1 ? '' : 's'}. ` : '')
                              + 'Any encounter linked to it stays, unlinked. This cannot be undone.') }
                    ]
                };
            }

            case 'area': {
                const area = d.areas.find(a => a.id === id);
                if (!area) return null;
                const children = d.areas.filter(a => a.parent_area_id === area.id).length;
                const here = d.npcs.filter(n => n.area_id === area.id).length;
                return {
                    title: area.name,
                    actions: [
                        { label: area.is_discovered ? 'Mark undiscovered' : 'Mark discovered',
                          run: () => window.toggleReveal('areas', area.id, 'is_discovered', area.is_discovered) },
                        { label: 'Add an area inside', run: () => window.newArea(area.id) },
                        { label: 'Add a check', run: () => window.newCheck('area_id', area.id, area.name) },
                        { label: 'Delete', danger: true,
                          hint: children
                              ? `Its ${children} nested area${children === 1 ? '' : 's'} ${children === 1 ? 'goes' : 'go'} too`
                              : undefined,
                          run: () => deleteRow('areas', area.id, `Delete ${area.name}`,
                              (children ? `This also deletes the ${children} area${children === 1 ? '' : 's'} inside it. ` : '')
                              + (here ? `${here} NPC${here === 1 ? '' : 's'} placed here stay, without a location. ` : '')
                              + 'This cannot be undone.') }
                    ]
                };
            }

            case 'npc': {
                const npc = d.npcs.find(n => n.id === id);
                if (!npc) return null;
                return {
                    title: npc.name,
                    actions: [
                        { label: 'Edit', run: () => editNPC(npc) },
                        { label: npc.is_known_to_players ? 'Hide from players' : 'Reveal to players',
                          run: () => window.toggleReveal('npcs', npc.id, 'is_known_to_players', npc.is_known_to_players) },
                        { label: 'Delete', danger: true,
                          run: () => deleteRow('npcs', npc.id, `Delete ${npc.name}`,
                              'Their DM notes go with them. This cannot be undone.') }
                    ]
                };
            }

            case 'monster': {
                const monster = d.monsters.find(m => m.id === id);
                if (!monster) return null;
                return {
                    title: monster.name,
                    actions: [
                        { label: 'Remove from roster', danger: true,
                          // encounter_combatants cascades on this, which is
                          // why the warning is worth making explicit.
                          hint: 'Also removes it from any encounter using it',
                          run: () => deleteRow('campaign_monsters', monster.id, `Remove ${monster.name}`,
                              'This takes it off the campaign roster and out of every encounter that '
                              + 'uses it. This cannot be undone.') }
                    ]
                };
            }

            case 'encounter': {
                const encounter = d.encounters.find(e => e.id === id);
                if (!encounter) return null;
                return {
                    title: encounter.name,
                    actions: [
                        { label: encounter.status === 'active' ? 'Resume' : 'Open',
                          run: () => { window.location.href =
                              `monster-tracker.html?id=${encodeURIComponent(encounter.id)}`; } },
                        { label: 'Delete', danger: true,
                          hint: 'The monster roster is left alone',
                          run: () => deleteRow('encounters', encounter.id, `Delete ${encounter.name}`,
                              'This removes the encounter and every combatant in it. The campaign\'s '
                              + 'monster roster and every character are left alone. This cannot be undone.') }
                    ]
                };
            }

            default:
                return null;
        }
    }

    function editNPC(npc) {
        openModal({
            title: `Edit ${npc.name}`,
            submitLabel: 'Save',
            fields: [
                { name: 'name', label: 'Name', required: true, value: npc.name },
                { name: 'title', label: 'Title or role', value: npc.title || '' },
                { name: 'faction', label: 'Faction', value: npc.faction || '' },
                { name: 'area_id', label: 'Where they are', type: 'select', value: npc.area_id || '',
                  options: [{ value: '', label: '— nowhere in particular —' }]
                      .concat(d.areas.map(a => ({ value: a.id, label: a.name }))) },
                { name: 'disposition', label: 'Disposition', type: 'select', value: npc.disposition,
                  options: ['friendly', 'neutral', 'hostile', 'unknown']
                      .map(v => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
                { name: 'description', label: 'What players can see', type: 'textarea', rows: 3,
                  value: npc.description || '' },
                { name: 'is_known_to_players', type: 'checkbox', label: '',
                  checkboxLabel: 'Players know this NPC exists', value: npc.is_known_to_players }
            ],
            onSubmit: async values => {
                const { error } = await db.from('npcs').update({
                    name: values.name, title: values.title || null, faction: values.faction || null,
                    area_id: values.area_id || null, disposition: values.disposition,
                    description: values.description || null,
                    is_known_to_players: values.is_known_to_players
                }).eq('id', npc.id);
                if (error) throw new Error(error.message || 'Could not save the NPC.');
                await refresh();
            }
        });
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
