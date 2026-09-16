// ========================================
// TAPHOU5E v2 — Overview hub
//
// The post-login landing page. Links out to the trackers plus party state at
// a glance. Everything here is state the app already holds.
// ========================================

(function () {
    if (!requireSession()) return;

    // Dice and tools is cut. `pending` tiles render disabled until their page
    // exists, so the hub shows the finished shape without linking to a 404.
    const TILES = [
        { label: 'Character sheets',  blurb: 'Open the party roster and play from a sheet.', href: 'characters.html',      icon: 'user',    pending: true },
        { label: 'Encounter tracker', blurb: 'Run initiative, HP and conditions.',           href: 'monster-tracker.html', icon: 'monster', pending: true },
        { label: 'Campaigns',         blurb: 'Storylines, areas, NPCs and encounters.',      href: 'campaigns.html',       icon: 'map',     pending: true },
        { label: 'Compendium',        blurb: 'Search monsters and spells; build homebrew.',  href: 'compendium.html',      icon: 'search',  pending: true }
    ];

    function tile(t) {
        const inner = `
            <div class="title">${icon(t.icon, 15)}${escapeHtml(t.label)}${t.pending ? '<span class="nav-soon">soon</span>' : ''}</div>
            <p>${escapeHtml(t.blurb)}</p>`;
        return t.pending
            ? `<div class="hub-tile is-pending" aria-disabled="true">${inner}</div>`
            : `<a class="hub-tile" href="${t.href}">${inner}</a>`;
    }

    function characterCard(character) {
        const scores = character.ability_scores || {};
        const dex = abilityMod(scores.dexterity);
        const wis = abilityMod(scores.wisdom);
        const initiative = character.initiative_bonus !== null && character.initiative_bonus !== undefined
            ? character.initiative_bonus
            : dex;
        const passive = 10 + wis + (character.proficiency_bonus || 2);

        const conditions = Array.isArray(character.active_conditions) ? character.active_conditions : [];
        let tag = '';
        if (character.pending_level_up) {
            tag = '<span class="tag tag-accent">LEVEL UP</span>';
        } else if (conditions.length) {
            tag = `<span class="tag tag-warning">${escapeHtml(conditions[0].toUpperCase())}</span>`;
        }

        const subclass = character.subclass ? ` ${character.subclass}` : '';
        const meta = `Lv ${character.level || 1} ${character.class || ''}${subclass} · ${character.player_name || ''}`;

        return `
            <div class="character-card${character.pending_level_up ? ' is-flagged' : ''}"
                 style="flex-direction:column;gap:var(--space-10)">
                <div class="card-top">
                    <div class="avatar">${escapeHtml((character.name || '?').charAt(0).toUpperCase())}</div>
                    <div style="flex:1;min-width:0">
                        <div class="card-name">${escapeHtml(character.name)}</div>
                        <div class="card-meta">${escapeHtml(meta)}</div>
                    </div>
                    ${tag}
                </div>
                ${renderHP(character.current_hit_points, character.hit_point_maximum, character.temporary_hit_points)}
                <div class="chipline">
                    <div class="chip">${character.armor_class ?? 10}<span>AC</span></div>
                    <div class="chip">${formatMod(initiative)}<span>IN</span></div>
                    <div class="chip chip-sp">${character.speed ?? 30}<span>SP</span></div>
                    <div class="chip">${passive}<span>PP</span></div>
                </div>
            </div>`;
    }

    async function load() {
        const worldId = session.gameWorldId;

        // Characters stay world-level, exactly as v1 reads them, so both
        // versions always agree about who is in the party.
        const charactersQuery = db
            .from('characters')
            .select('id, name, player_name, class, subclass, level, armor_class, speed, initiative_bonus, proficiency_bonus, current_hit_points, hit_point_maximum, temporary_hit_points, active_conditions, pending_level_up, ability_scores(dexterity, wisdom)')
            .eq('game_world_id', worldId)
            .order('name');

        const campaignsQuery = db
            .from('campaigns')
            .select('id, name, status, is_default')
            .eq('game_world_id', worldId)
            .order('sort_order');

        const encountersQuery = db
            .from('encounters')
            .select('id, name, status, round, campaign_id')
            .eq('game_world_id', worldId)
            .eq('status', 'active')
            .limit(1);

        const [characters, campaigns, encounters] = await Promise.all([
            charactersQuery, campaignsQuery, encountersQuery
        ]);

        return {
            characters: characters.data || [],
            charactersError: characters.error,
            campaigns: campaigns.data || [],
            liveEncounter: (encounters.data || [])[0] || null
        };
    }

    function render(data) {
        renderShell({
            active: 'overview',
            title: 'Overview',
            sub: `${session.gameWorldName} · ${data.characters.length} character${data.characters.length === 1 ? '' : 's'}`,
            counts: {
                characters: data.characters.length,
                campaigns: data.campaigns.length
            },
            topbarExtra: ''
        });

        const parts = [];

        if (data.charactersError) {
            parts.push(`<div class="error-banner">Could not load the party. ${escapeHtml(data.charactersError.message || '')}</div>`);
        }

        parts.push(`<section class="hub-tiles">${TILES.map(tile).join('')}</section>`);

        parts.push(`
            <section>
                <div class="section-head">
                    <span class="eyebrow">Party</span>
                    <span class="rule"></span>
                </div>
                ${
                    data.characters.length
                        ? `<div class="party-roster">${data.characters.map(characterCard).join('')}</div>`
                        : `<div class="empty-state">
                               <h3>No characters yet</h3>
                               <p>Create your first character in the classic version; they will appear here.</p>
                           </div>`
                }
            </section>`);

        const campaignLine = data.campaigns.length === 1
            ? escapeHtml(data.campaigns[0].name)
            : `${data.campaigns.length} campaigns`;

        parts.push(`
            <section style="display:flex;flex-direction:column;gap:var(--space-12)">
                <div class="section-head">
                    <span class="eyebrow">This world</span>
                    <span class="rule"></span>
                </div>
                ${
                    data.liveEncounter
                        ? `<div class="summary-card is-pending" aria-disabled="true">
                               ${icon('monster', 18)}
                               <div class="body">
                                   <div class="title">${escapeHtml(data.liveEncounter.name)}</div>
                                   <div class="meta">In progress · round ${data.liveEncounter.round || 0}</div>
                               </div>
                               <span class="nav-soon">soon</span>
                           </div>`
                        : ''
                }
                <div class="summary-card is-pending" aria-disabled="true">
                    ${icon('map', 18)}
                    <div class="body">
                        <div class="title">Campaigns</div>
                        <div class="meta">${campaignLine}</div>
                    </div>
                    <span class="nav-soon">soon</span>
                </div>
                ${
                    isDM
                        ? `<div class="summary-card is-pending" aria-disabled="true">
                               ${icon('user', 18)}
                               <div class="body">
                                   <div class="title">DM panel</div>
                                   <div class="meta">Leveling mode, grant levels and EXP</div>
                               </div>
                               <span class="nav-soon">soon</span>
                           </div>`
                        : ''
                }
            </section>`);

        $('#main-content').innerHTML = parts.join('');
    }

    (async function init() {
        // Shell first so the page is never blank while the queries run.
        const main = renderShell({
            active: 'overview',
            title: 'Overview',
            sub: session.gameWorldName || ''
        });
        main.innerHTML = '<div class="party-roster"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';

        try {
            const data = await load();
            render(data);

            // A DM whose 12 hour token has lapsed still sees the world, but
            // private campaign data quietly stops resolving. Say so instead.
            if (dmTokenExpired()) {
                toast('Your DM session has expired. Log in again to see private campaign data.', 'error');
            }
        } catch (err) {
            console.error('Failed to load overview:', err);
            $('#main-content').innerHTML =
                `<div class="error-banner">Could not load this world. Check your connection and refresh.</div>`;
        }
    })();
})();
