// ========================================
// TAPHOU5E v2 — party roster
//
// The world-level roster: every character in this game world, read through
// characters.game_world_id exactly as v1 does. Campaign membership never
// changes what appears here, which is why the two versions can never disagree
// about who is in the party.
// ========================================

(function () {
    if (!requireSession()) return;

    async function load() {
        const { data, error } = await db
            .from('characters')
            .select(CHARACTER_CARD_COLUMNS)
            .eq('game_world_id', session.gameWorldId)
            .order('name');
        return { characters: data || [], error };
    }

    function render(data) {
        renderShell({
            active: 'characters',
            title: 'Characters',
            sub: `${session.gameWorldName} · ${data.characters.length} character${data.characters.length === 1 ? '' : 's'}`,
            counts: { characters: data.characters.length },
            // Character creation still lives in the classic app: it drives the
            // level-up engine and feature registry, which v2 has not taken on
            // yet. Linking out is honest; a half-built form would not be.
            topbarExtra: '<a class="btn" href="../characters.html">Add character (classic)</a>'
        });

        const main = $('#main-content');

        if (data.error) {
            main.innerHTML = `<div class="error-banner">Could not load characters. ${escapeHtml(data.error.message || '')}</div>`;
            return;
        }

        if (!data.characters.length) {
            main.innerHTML = `
                <div class="empty-state">
                    <h3>No characters yet</h3>
                    <p>This world has no characters. Create one in the classic version and it will appear here.</p>
                    <a class="btn btn-accent" href="../characters.html">Open the classic version</a>
                </div>`;
            return;
        }

        // Characters who are down or owed a level sort to the front rather than
        // being listed twice: at party size a duplicate row reads as a bug.
        const needsAttention = ch => ch.pending_level_up || (ch.current_hit_points || 0) <= 0;
        const ordered = data.characters.slice().sort((a, b) => {
            const diff = Number(needsAttention(b)) - Number(needsAttention(a));
            return diff !== 0 ? diff : (a.name || '').localeCompare(b.name || '');
        });
        const flagged = ordered.filter(needsAttention).length;

        main.innerHTML = `
            <div class="section-head">
                <span class="eyebrow">Party</span>
                <span class="rule"></span>
                ${flagged ? `<span class="hint">${flagged} need${flagged === 1 ? 's' : ''} attention</span>` : ''}
            </div>
            <div class="party-roster">${ordered.map(characterCard).join('')}</div>`;
    }

    (async function init() {
        renderShell({ active: 'characters', title: 'Characters', sub: session.gameWorldName || '' });
        $('#main-content').innerHTML =
            '<div class="party-roster">' + '<div class="skeleton"></div>'.repeat(4) + '</div>';

        try {
            render(await load());
        } catch (err) {
            console.error('Failed to load characters:', err);
            $('#main-content').innerHTML =
                '<div class="error-banner">Could not load characters. Check your connection and refresh.</div>';
        }
    })();
})();
