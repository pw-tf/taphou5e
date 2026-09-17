// ========================================
// TAPHOU5E v2 — campaigns list
//
// Campaigns sit inside a world. Every world has at least one: the backfill
// created a default campaign for each of the 191 that existed, and a trigger
// gives every new world one too, so this screen is never empty.
// ========================================

(function () {
    if (!requireSession()) return;

    const STATUSES = ['planning', 'active', 'paused', 'completed', 'archived'];

    async function load() {
        const worldId = session.gameWorldId;

        const [campaigns, members, npcs, areas, chapters, encounters] = await Promise.all([
            db.from('campaigns').select('*').eq('game_world_id', worldId).order('sort_order').order('name'),
            db.from('campaign_characters').select('campaign_id, status').eq('game_world_id', worldId),
            db.from('npcs').select('campaign_id').eq('game_world_id', worldId),
            db.from('areas').select('campaign_id').eq('game_world_id', worldId),
            db.from('chapters').select('campaign_id').eq('game_world_id', worldId),
            db.from('encounters').select('campaign_id, status').eq('game_world_id', worldId)
        ]);

        // Players only see revealed rows, so these counts are legitimately
        // smaller for them -- they are not a partial load.
        const tally = (rows, predicate) => {
            const out = {};
            (rows || []).forEach(r => {
                if (predicate && !predicate(r)) return;
                out[r.campaign_id] = (out[r.campaign_id] || 0) + 1;
            });
            return out;
        };

        return {
            campaigns: campaigns.data || [],
            error: campaigns.error,
            party: tally(members.data, m => m.status === 'active'),
            npcs: tally(npcs.data),
            areas: tally(areas.data),
            chapters: tally(chapters.data),
            live: tally(encounters.data, e => e.status === 'active')
        };
    }

    function card(campaign, data) {
        const status = campaign.status || 'active';
        const counts = [
            ['party', data.party[campaign.id] || 0, 'PARTY'],
            ['chapters', data.chapters[campaign.id] || 0, 'STORY'],
            ['areas', data.areas[campaign.id] || 0, 'AREAS'],
            ['npcs', data.npcs[campaign.id] || 0, 'NPCS']
        ];

        return `
            <a class="campaign-card" href="campaign.html?id=${encodeURIComponent(campaign.id)}"
               data-holdable data-id="${escapeHtml(campaign.id)}">
                <div class="head">
                    <h3>${escapeHtml(campaign.name)}</h3>
                    ${data.live[campaign.id] ? '<span class="mono nav-count is-live">LIVE</span>' : ''}
                    <span class="status-pill is-${escapeHtml(status)}">${escapeHtml(status)}</span>
                </div>
                ${campaign.summary ? `<p class="summary">${escapeHtml(campaign.summary)}</p>` : ''}
                <div class="stats">
                    ${counts.map(([, value, label]) => `<div><b>${value}</b><span>${label}</span></div>`).join('')}
                </div>
            </a>`;
    }

    window.newCampaign = () => {
        openModal({
            title: 'New campaign',
            submitLabel: 'Create campaign',
            fields: [
                { name: 'name', label: 'Name', required: true, placeholder: 'The Drowned Road' },
                { name: 'summary', label: 'Summary', type: 'textarea', rows: 3,
                  placeholder: 'What the party knows about it.',
                  hint: 'Players can see this. DM-only notes live inside the campaign.' },
                { name: 'status', label: 'Status', type: 'select', value: 'planning',
                  options: STATUSES.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) }
            ],
            onSubmit: async values => {
                const { data, error } = await db.from('campaigns').insert({
                    game_world_id: session.gameWorldId,
                    name: values.name,
                    summary: values.summary || null,
                    status: values.status || 'planning'
                }).select('id').single();

                if (error) {
                    // unique (game_world_id, name)
                    if (error.code === '23505') throw new Error('A campaign in this world already has that name.');
                    throw new Error(error.message || 'Could not create the campaign.');
                }
                window.location.href = `campaign.html?id=${encodeURIComponent(data.id)}`;
            }
        });
    };

    // Editing and deleting a campaign lived only inside it. Holding a card is
    // how you reach them from the list.
    function cardMenu(card, data) {
        const campaign = data.campaigns.find(c => c.id === card.dataset.id);
        if (!campaign || !isDM) return null;

        const href = `campaign.html?id=${encodeURIComponent(campaign.id)}`;
        return {
            title: campaign.name,
            actions: [
                { label: 'Open', hint: 'Chapters, areas, NPCs and encounters',
                  run: () => { window.location.href = href; } },
                { label: 'Edit', hint: 'Name, summary and status',
                  run: () => editCampaign(campaign) },
                { label: 'Delete', danger: true,
                  hint: 'Its chapters, areas, NPCs and encounters go too',
                  run: () => deleteCampaign(campaign) }
            ]
        };
    }

    function editCampaign(campaign) {
        openModal({
            title: `Edit ${campaign.name}`,
            submitLabel: 'Save',
            fields: [
                { name: 'name', label: 'Name', required: true, value: campaign.name },
                { name: 'summary', label: 'Summary', type: 'textarea', rows: 3,
                  value: campaign.summary || '' },
                { name: 'status', label: 'Status', type: 'select', value: campaign.status || 'active',
                  options: STATUSES.map(s => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })) }
            ],
            onSubmit: async values => {
                const { error } = await db.from('campaigns').update({
                    name: values.name, summary: values.summary || null, status: values.status
                }).eq('id', campaign.id);
                if (error) {
                    if (error.code === '23505') throw new Error('A campaign in this world already has that name.');
                    throw new Error(error.message || 'Could not save.');
                }
                await refresh();
            }
        });
    }

    // The list does not hold the campaign's contents, so unlike the detail
    // page this cannot count what cascades. It names the kinds instead of
    // guessing at numbers.
    function deleteCampaign(campaign) {
        confirmModal({
            title: `Delete ${campaign.name}`,
            message: 'This also deletes its chapters, areas, NPCs, monsters, encounters '
                   + 'and session recaps. Characters leave the campaign but stay in the world. '
                   + 'This cannot be undone.',
            confirmLabel: 'Delete campaign',
            onConfirm: async () => {
                const { error } = await db.from('campaigns').delete().eq('id', campaign.id);
                if (error) throw new Error(error.message || 'Could not delete the campaign.');
                await refresh();
            }
        });
    }

    async function refresh() {
        render(await load());
    }

    function render(data) {
        renderShell({
            active: 'campaigns',
            title: 'Campaigns',
            sub: `${session.gameWorldName} · ${data.campaigns.length} campaign${data.campaigns.length === 1 ? '' : 's'}`,
            counts: { campaigns: data.campaigns.length },
            actions: isDM ? [{ label: 'New campaign', onclick: 'newCampaign()', primary: true }] : []
        });

        const main = $('#main-content');

        if (data.error) {
            main.innerHTML = `<div class="error-banner">Could not load campaigns. ${escapeHtml(data.error.message || '')}</div>`;
            return;
        }

        if (!data.campaigns.length) {
            main.innerHTML = `
                <div class="empty-state">
                    <h3>No campaigns yet</h3>
                    <p>${isDM
                        ? 'Create a campaign to gather its chapters, areas, NPCs, monsters and encounters in one place.'
                        : 'Your DM has not opened a campaign in this world yet.'}</p>
                    ${isDM ? '<button class="btn btn-accent" onclick="newCampaign()">New campaign</button>' : ''}
                </div>`;
            return;
        }

        main.innerHTML = `
            <div class="campaign-grid holdable">${data.campaigns.map(cm => card(cm, data)).join('')}</div>
            ${isDM
                ? '<p class="hint">Hold a campaign (or right-click) to edit or delete it.</p>'
                : '<p class="hint">Some campaign material stays hidden until your DM reveals it.</p>'}`;

        wireCardMenus('.campaign-grid', '.campaign-card', card => cardMenu(card, data));
    }

    (async function init() {
        renderShell({ active: 'campaigns', title: 'Campaigns', sub: session.gameWorldName || '' });
        $('#main-content').innerHTML =
            '<div class="campaign-grid">' + '<div class="skeleton"></div>'.repeat(3) + '</div>';

        try {
            render(await load());
        } catch (err) {
            console.error('Failed to load campaigns:', err);
            $('#main-content').innerHTML =
                '<div class="error-banner">Could not load campaigns. Check your connection and refresh.</div>';
        }
    })();
})();
