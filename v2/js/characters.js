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
            actions: [{ label: 'New character', primary: true, href: 'character-new.html' }]
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
                    <p>Characters belong to the world, so one made here shows up in every campaign you pull them into.</p>
                    <a class="btn btn-accent" href="character-new.html">Create a character</a>
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
            <div class="party-roster holdable">${ordered.map(characterCard).join('')}</div>
            ${isDM ? '<p class="hint">Hold a character (or right-click) for more.</p>' : ''}`;

        wireCardMenus('.party-roster', '.character-card',
            card => characterMenu(card, data.characters));
    }

    function characterMenu(card, characters) {
        const character = characters.find(c => c.id === card.dataset.id);
        if (!character) return null;

        const href = `character-sheet.html?id=${encodeURIComponent(character.id)}`;
        const actions = [
            { label: 'Open sheet', hint: `Level ${character.level || 1} ${character.class || ''}`.trim(),
              run: () => { window.location.href = href; } }
        ];

        if (character.pending_level_up) {
            actions.push({ label: 'Level up', hint: 'Opens the wizard on their sheet',
                           run: () => { window.location.href = href; } });
        }

        // Characters belong to the world, so only a DM removes one, and only
        // ever deliberately -- see deleteCharacter.
        if (isDM) actions.push({
            label: 'Delete', danger: true, hint: 'Permanent, with everything on their sheet',
            run: () => deleteCharacter(character)
        });

        return { title: character.name, actions };
    }

    // A character is the largest thing a person builds in this app, and a
    // press-and-hold is easy to trigger by accident, so this asks for the
    // name to be typed rather than accepting a tap on a red button.
    function deleteCharacter(character) {
        confirmByName({
            title: `Delete ${character.name}`,
            name: character.name,
            confirmLabel: 'Delete character',
            message: 'Their abilities, skills, spells, inventory, features and campaign '
                   + 'memberships go with them, and they are removed from any encounter '
                   + 'they are in. This cannot be undone.',
            onConfirm: async () => {
                const { error } = await db.from('characters').delete().eq('id', character.id);
                if (error) throw new Error(error.message || 'Could not delete the character.');
                render(await load());
            }
        });
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
