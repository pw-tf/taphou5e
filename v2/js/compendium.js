// ========================================
// TAPHOU5E v2 — Compendium
//
// Browse and search the SRD, and get things out of it into your campaign.
// This is the write path for campaign_monsters: without it, adding an SRD
// monster means typing an api_index by hand and source='homebrew' is
// unreachable entirely.
//
// SRD data stays at dnd5eapi.co. A campaign monster stores either a reference
// to it (with optional overrides) or a full homebrew stat block -- the SRD is
// never copied wholesale into the database.
// ========================================

(function () {
    if (!requireSession()) return;

    let kind = 'monsters';       // 'monsters' | 'spells'
    let index = { monsters: null, spells: null };
    let query = '';
    let selected = null;         // { kind, index, name }
    let detail = null;           // fetched payload for `selected`
    let detailError = false;
    let campaigns = [];
    let roster = [];             // campaign_monsters already added, for "in roster" marks
    let loadError = null;

    // SRD access, hit point rolling and armor-class normalisation live in
    // core.js: the tracker searches the same index, and two copies of the cache
    // would mean two sets of requests to a free public API.
    const fetchIndex = which => srdIndex(which);
    const fetchDetail = (which, apiIndex) => srdDetail(which, apiIndex);
    const normaliseAC = srdArmorClass;

    function crLabel(cr) {
        if (cr === null || cr === undefined) return '—';
        if (cr === 0.125) return '1/8';
        if (cr === 0.25) return '1/4';
        if (cr === 0.5) return '1/2';
        return String(cr);
    }

    // ========================================
    // Rendering
    // ========================================

    function resultRows() {
        const list = index[kind] || [];
        const q = query.trim().toLowerCase();
        const matches = q ? list.filter(r => r.name.toLowerCase().includes(q)) : list;
        const inRoster = new Set(roster.map(m => m.api_index).filter(Boolean));

        if (!matches.length) {
            return `<div class="empty-state"><p>${q
                ? `Nothing in the SRD ${escapeHtml(kind)} matches “${escapeHtml(query)}”.`
                : 'Nothing to show.'}</p></div>`;
        }

        // The SRD list runs to a few hundred entries; render a slice until the
        // search narrows it, so the page stays responsive on a phone.
        const shown = matches.slice(0, 150);
        return `
            <div class="stack">
                ${shown.map(r => `
                    <div class="list-row${selected && selected.index === r.index ? ' is-selected' : ''}"
                         onclick="pick('${escapeHtml(r.index)}')" role="button" tabindex="0">
                        <div class="who">
                            <div class="name">${escapeHtml(r.name)}</div>
                        </div>
                        ${inRoster.has(r.index) && kind === 'monsters'
                            ? '<span class="hidden-pill">in roster</span>' : ''}
                    </div>`).join('')}
            </div>
            ${matches.length > shown.length
                ? `<p class="hint">Showing ${shown.length} of ${matches.length}. Type to narrow it down.</p>`
                : `<p class="hint">${matches.length} result${matches.length === 1 ? '' : 's'}.</p>`}`;
    }

    function monsterDetail(m) {
        const ac = normaliseAC(m.armor_class);
        const abilities = [
            ['STR', m.strength], ['DEX', m.dexterity], ['CON', m.constitution],
            ['INT', m.intelligence], ['WIS', m.wisdom], ['CHA', m.charisma]
        ];
        const traits = (m.special_abilities || []).concat(m.actions || []);

        return `
            <span class="eyebrow">Stat block</span>
            <h2>${escapeHtml(m.name)}</h2>
            <p class="flavour">${escapeHtml([m.size, m.type, m.alignment].filter(Boolean).join(' '))}</p>
            <div class="stat-trio">
                <div><b>${ac ?? '—'}</b><span>AC</span></div>
                <div><b>${m.hit_points ?? '—'}</b><span>HP</span></div>
                <div><b>${crLabel(m.challenge_rating)}</b><span>CR</span></div>
            </div>
            <div class="abilities">
                ${abilities.map(([label, score]) => `
                    <div>
                        <div class="label mono" style="font-size:var(--fs-9);color:var(--text-tertiary)">${label}</div>
                        <div class="mono" style="font-weight:600">${score ?? '—'}</div>
                        <div class="mono" style="font-size:var(--fs-10);color:var(--accent-primary)">${
                            score ? formatMod(abilityMod(score)) : ''}</div>
                    </div>`).join('')}
            </div>
            ${m.speed ? `<p class="mono" style="font-size:var(--fs-12)">Speed: ${
                escapeHtml(Object.entries(m.speed).map(([k, v]) => `${k} ${v}`).join(', '))}</p>` : ''}
            ${traits.map(t => `
                <div>
                    <div class="trait-name">${escapeHtml(t.name)}</div>
                    <p>${escapeHtml(t.desc || '')}</p>
                </div>`).join('')}
            ${isDM ? `
                <div class="pane-actions">
                    <button class="btn btn-accent btn-block" onclick="addToRoster()">Add to a campaign</button>
                </div>` : ''}`;
    }

    function spellDetail(s) {
        const desc = [].concat(s.desc || [], s.higher_level || []);
        return `
            <span class="eyebrow">Spell</span>
            <h2>${escapeHtml(s.name)}</h2>
            <p class="flavour">${s.level ? `Level ${s.level}` : 'Cantrip'}${
                s.school && s.school.name ? ' · ' + escapeHtml(s.school.name) : ''}</p>
            <div class="stat-trio">
                <div><b>${escapeHtml(s.casting_time || '—')}</b><span>CAST</span></div>
                <div><b>${escapeHtml(s.range || '—')}</b><span>RANGE</span></div>
                <div><b>${escapeHtml(s.duration || '—')}</b><span>DURATION</span></div>
            </div>
            ${s.components ? `<p class="mono" style="font-size:var(--fs-12)">${
                escapeHtml([].concat(s.components).join(', '))}${
                s.material ? ` — ${escapeHtml(s.material)}` : ''}</p>` : ''}
            ${desc.map(p => `<p>${escapeHtml(p)}</p>`).join('')}
            <p class="hint">Spells are added to a character from their sheet. This is reference only.</p>`;
    }

    function detailPane() {
        if (!selected) {
            return `<div class="empty-state"><p>Pick something on the left to see its details.</p></div>`;
        }
        if (detailError) {
            return `<div class="error-banner">Could not load ${escapeHtml(selected.name)} from the SRD.</div>`;
        }
        if (!detail) return '<div class="skeleton"></div>';
        return `<div class="statblock">${
            kind === 'monsters' ? monsterDetail(detail) : spellDetail(detail)}</div>`;
    }

    // ========================================
    // Actions
    // ========================================

    window.setKind = next => {
        if (kind === next) return;
        kind = next;
        selected = null;
        detail = null;
        detailError = false;
        query = '';
        draw();
        ensureIndex();
    };

    window.setQuery = value => {
        query = value;
        // Re-render only the list so the search field keeps focus and caret.
        const list = $('#srd-list');
        if (list) list.innerHTML = resultRows();
    };

    window.clearPick = () => { selected = null; detail = null; detailError = false; draw(); };

    window.pick = async apiIndex => {
        const row = (index[kind] || []).find(r => r.index === apiIndex);
        if (!row) return;
        selected = { kind, index: apiIndex, name: row.name };
        detail = null;
        detailError = false;
        draw();
        try {
            detail = await fetchDetail(kind, apiIndex);
        } catch (err) {
            console.error('SRD detail failed:', err);
            detailError = true;
        }
        draw();
    };

    window.addToRoster = () => {
        if (!detail) return;
        if (!campaigns.length) {
            toast('Create a campaign first.', 'error');
            return;
        }

        openModal({
            title: `Add ${detail.name} to a campaign`,
            submitLabel: 'Add to roster',
            fields: [
                { name: 'campaign_id', label: 'Campaign', type: 'select', value: campaigns[0].id,
                  options: campaigns.map(cm => ({ value: cm.id, label: cm.name })) },
                { name: 'name', label: 'Name in your campaign', value: detail.name,
                  hint: 'Rename it for an elite variant; the SRD entry stays untouched.' },
                { name: 'max_hit_points', label: 'Hit points', type: 'number',
                  value: detail.hit_points ?? null },
                { name: 'armor_class', label: 'Armor class', type: 'number',
                  value: normaliseAC(detail.armor_class) }
            ],
            onSubmit: async values => {
                // Only the deltas are stored. The SRD stays at the API; the row
                // holds a reference plus whatever the DM changed.
                const overrides = {};
                if (values.name && values.name !== detail.name) overrides.name = values.name;
                if (values.max_hit_points !== (detail.hit_points ?? null)) {
                    overrides.hit_points = values.max_hit_points;
                }
                if (values.armor_class !== normaliseAC(detail.armor_class)) {
                    overrides.armor_class = values.armor_class;
                }

                const { error } = await db.from('campaign_monsters').insert({
                    campaign_id: values.campaign_id,
                    game_world_id: session.gameWorldId,
                    name: values.name || detail.name,
                    source: 'srd_api',
                    api_index: selected.index,
                    statblock: Object.keys(overrides).length ? overrides : null,
                    challenge_rating: detail.challenge_rating ?? null,
                    creature_type: detail.type || null,
                    size: detail.size || null,
                    armor_class: values.armor_class,
                    max_hit_points: values.max_hit_points
                });
                if (error) throw new Error(error.message || 'Could not add that monster.');

                await loadRoster();
                toast(`${values.name || detail.name} added.`);
                draw();
            }
        });
    };

    window.newHomebrew = () => {
        if (!campaigns.length) {
            toast('Create a campaign first.', 'error');
            return;
        }
        openModal({
            title: 'New homebrew monster',
            submitLabel: 'Create',
            fields: [
                { name: 'campaign_id', label: 'Campaign', type: 'select', value: campaigns[0].id,
                  options: campaigns.map(cm => ({ value: cm.id, label: cm.name })) },
                { name: 'name', label: 'Name', required: true },
                { name: 'creature_type', label: 'Type', placeholder: 'aberration' },
                { name: 'size', label: 'Size', type: 'select', value: 'Medium',
                  options: ['Tiny', 'Small', 'Medium', 'Large', 'Huge', 'Gargantuan']
                      .map(v => ({ value: v, label: v })) },
                { name: 'challenge_rating', label: 'Challenge rating', type: 'number' },
                { name: 'armor_class', label: 'Armor class', type: 'number' },
                { name: 'max_hit_points', label: 'Hit points', type: 'number' },
                { name: 'description', label: 'Traits and actions', type: 'textarea', rows: 6,
                  hint: 'Free text for now; a structured stat block editor can come later.' }
            ],
            onSubmit: async values => {
                const { error } = await db.from('campaign_monsters').insert({
                    campaign_id: values.campaign_id,
                    game_world_id: session.gameWorldId,
                    name: values.name,
                    source: 'homebrew',
                    // The source check constraint requires a stat block for
                    // homebrew, so this is never null.
                    statblock: {
                        description: values.description || '',
                        armor_class: values.armor_class,
                        hit_points: values.max_hit_points
                    },
                    challenge_rating: values.challenge_rating,
                    creature_type: values.creature_type || null,
                    size: values.size || null,
                    armor_class: values.armor_class,
                    max_hit_points: values.max_hit_points
                });
                if (error) throw new Error(error.message || 'Could not create that monster.');
                await loadRoster();
                toast(`${values.name} created.`);
                draw();
            }
        });
    };

    // ========================================
    // Load
    // ========================================

    async function loadRoster() {
        const { data } = await db.from('campaign_monsters')
            .select('id, campaign_id, name, api_index, source')
            .eq('game_world_id', session.gameWorldId);
        roster = data || [];
    }

    async function ensureIndex() {
        if (index[kind]) { draw(); return; }
        try {
            index[kind] = await fetchIndex(kind);
            loadError = null;
        } catch (err) {
            console.error('SRD index failed:', err);
            loadError = err.message || 'Could not reach the SRD.';
        }
        draw();
    }

    function draw() {
        renderShell({
            active: 'compendium',
            title: 'Compendium',
            sub: session.gameWorldName || '',
            actions: isDM
                ? [{ label: 'New homebrew monster', onclick: 'newHomebrew()', primary: true }]
                : []
        });

        $('#main-content').innerHTML = `
            <div class="compendium-controls">
                <div class="segmented">
                    <button class="${kind === 'monsters' ? 'is-active' : ''}" onclick="setKind('monsters')">Monsters</button>
                    <button class="${kind === 'spells' ? 'is-active' : ''}" onclick="setKind('spells')">Spells</button>
                </div>
                <input id="srd-search" type="search" class="srd-search"
                       placeholder="Search ${escapeHtml(kind)}…" value="${escapeHtml(query)}"
                       oninput="setQuery(this.value)" aria-label="Search the SRD">
            </div>
            ${loadError
                ? `<div class="error-banner">
                       Could not reach the SRD (${escapeHtml(loadError)}). The compendium needs
                       dnd5eapi.co; campaign data is unaffected.
                   </div>`
                : ''}
            <div class="compendium-split">
                <div id="srd-list" class="srd-list">${
                    index[kind] ? resultRows() : '<div class="skeleton"></div>'}</div>
                <aside class="srd-detail${selected ? ' has-detail' : ''}">
                    ${selected ? '<button class="icon-btn srd-close" onclick="clearPick()" aria-label="Close">&times;</button>' : ''}
                    ${detailPane()}
                </aside>
            </div>`;

        const search = $('#srd-search');
        if (search && query) {
            search.focus();
            search.setSelectionRange(query.length, query.length);
        }
    }

    (async function init() {
        renderShell({ active: 'compendium', title: 'Compendium', sub: session.gameWorldName || '' });
        $('#main-content').innerHTML = '<div class="skeleton"></div>';

        const { data } = await db.from('campaigns')
            .select('id, name').eq('game_world_id', session.gameWorldId).order('name');
        campaigns = data || [];
        await loadRoster();
        await ensureIndex();
    })();
})();
