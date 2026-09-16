// ========================================
// TAPHOU5E v2 — DM panel
//
// Levelling, matching the classic app's behaviour exactly, because both
// versions write the same columns:
//
//   Milestone  level + 1, pending_level_up = true
//   EXP        experience_points += amount, then level recomputed from the
//              5e thresholds; pending_level_up set only if the level moved
//
// v2 has no level-up wizard of its own — that lives in the classic app, driven
// by level-up-engine.js and feature-registry.js. So a granted level is flagged
// here and completed there, and the panel says so rather than leaving a player
// wondering why nothing happened.
// ========================================

(function () {
    if (!requireSession()) return;

    let characters = [];
    let mode = 'milestone';
    let busy = false;

    async function load() {
        const [world, chars] = await Promise.all([
            db.from('game_worlds').select('leveling_mode').eq('id', session.gameWorldId).single(),
            db.from('characters')
              .select('id, name, race, class, player_name, level, experience_points, pending_level_up')
              .eq('game_world_id', session.gameWorldId)
              .order('name')
        ]);
        mode = (world.data && world.data.leveling_mode) || 'milestone';
        characters = chars.data || [];
    }

    async function refresh() {
        await load();
        draw();
    }

    // ========================================
    // Actions
    // ========================================

    window.setLevelingMode = async next => {
        if (mode === next) return;
        mode = next;
        draw();
        const { error } = await db.from('game_worlds')
            .update({ leveling_mode: next }).eq('id', session.gameWorldId);
        if (error) toast('Could not change the levelling mode.', 'error');
    };

    async function grantLevels(targets) {
        const eligible = targets.filter(c => (c.level || 1) < 20);
        if (!eligible.length) {
            toast('Everyone selected is already at level 20.');
            return;
        }
        busy = true;
        draw();
        try {
            for (const c of eligible) {
                rememberPreGrantLevel(c);
                const { error } = await db.from('characters')
                    .update({ level: (c.level || 1) + 1, pending_level_up: true })
                    .eq('id', c.id);
                if (error) throw new Error(error.message);
            }
            toast(`Level granted to ${eligible.length} character${eligible.length === 1 ? '' : 's'}.`);
        } catch (err) {
            console.error('Grant failed:', err);
            toast('Could not grant that level.', 'error');
        } finally {
            busy = false;
            await refresh();
        }
    }

    async function grantExp(targets, amount) {
        if (!amount || amount <= 0) {
            toast('Enter an amount above zero.', 'error');
            return;
        }
        busy = true;
        draw();
        const levelled = [];
        try {
            for (const c of targets) {
                if ((c.level || 1) >= 20) continue;
                const nextExp = (c.experience_points || 0) + amount;
                const nextLevel = levelForExp(nextExp);
                const updates = { experience_points: nextExp };

                if (nextLevel > (c.level || 1)) {
                    rememberPreGrantLevel(c);
                    updates.level = Math.min(20, nextLevel);
                    updates.pending_level_up = true;
                    levelled.push(`${c.name} → ${updates.level}`);
                }
                const { error } = await db.from('characters').update(updates).eq('id', c.id);
                if (error) throw new Error(error.message);
            }
            toast(levelled.length
                ? `EXP granted. Levelled up: ${levelled.join(', ')}.`
                : `${amount.toLocaleString()} EXP granted.`);
        } catch (err) {
            console.error('Grant failed:', err);
            toast('Could not grant that EXP.', 'error');
        } finally {
            busy = false;
            await refresh();
        }
    }

    window.grantPartyLevel = () => {
        const eligible = characters.filter(c => (c.level || 1) < 20);
        confirmModal({
            title: 'Grant a level to the party',
            message: `${eligible.length} character${eligible.length === 1 ? '' : 's'} will gain a level. ` +
                     'They finish levelling up in the classic version.',
            confirmLabel: 'Grant to party',
            onConfirm: () => grantLevels(characters)
        });
    };

    window.grantOneLevel = id => {
        const c = characters.find(x => x.id === id);
        if (!c) return;
        confirmModal({
            title: `Grant a level to ${c.name}`,
            message: `Level ${c.level} → ${(c.level || 1) + 1}.`,
            confirmLabel: 'Grant level',
            onConfirm: () => grantLevels([c])
        });
    };

    window.grantPartyExp = () => {
        const amount = parseInt($('#party-exp').value, 10);
        grantExp(characters, amount);
    };

    window.grantOneExp = id => {
        const c = characters.find(x => x.id === id);
        if (!c) return;
        const amount = parseInt($(`#exp-${id}`).value, 10);
        grantExp([c], amount);
    };

    // ========================================
    // Render
    // ========================================

    function milestoneRow(c) {
        const maxed = (c.level || 1) >= 20;
        return `
            <div class="dm-row">
                <div class="who">
                    <div class="name">${escapeHtml(c.name)}${
                        c.pending_level_up ? ' <span class="tag tag-accent">LEVEL UP DUE</span>' : ''}</div>
                    <div class="meta">${escapeHtml([c.race, c.class].filter(Boolean).join(' '))} · ${escapeHtml(c.player_name || '')}</div>
                </div>
                <span class="lvl mono">LV ${c.level || 1}</span>
                <button class="btn ${c.pending_level_up ? '' : 'btn-accent'}"
                        onclick="grantOneLevel('${c.id}')" ${maxed || busy ? 'disabled' : ''}>
                    ${maxed ? 'Max' : 'Grant level'}
                </button>
            </div>`;
    }

    function expRow(c) {
        const level = c.level || 1;
        const exp = c.experience_points || 0;
        const next = expForNextLevel(level);
        const pct = next ? Math.min(100, (exp / next) * 100) : 100;
        const label = next
            ? `${exp.toLocaleString()} / ${next.toLocaleString()} XP`
            : `${exp.toLocaleString()} XP (max)`;

        return `
            <div class="dm-row dm-row-exp">
                <div class="who">
                    <div class="name">${escapeHtml(c.name)}${
                        c.pending_level_up ? ' <span class="tag tag-accent">LEVEL UP DUE</span>' : ''}</div>
                    <div class="meta">${escapeHtml([c.race, c.class].filter(Boolean).join(' '))} · ${escapeHtml(c.player_name || '')}</div>
                    <div class="hp-bar" style="margin-top:6px">
                        <div class="fill high" style="width:${pct}%"></div>
                    </div>
                    <div class="mono exp-text">${label}</div>
                </div>
                <span class="lvl mono">LV ${level}</span>
                <div class="exp-grant">
                    <input id="exp-${c.id}" type="number" min="1" placeholder="EXP"
                           aria-label="EXP for ${escapeHtml(c.name)}">
                    <button class="btn btn-accent" onclick="grantOneExp('${c.id}')"
                            ${level >= 20 || busy ? 'disabled' : ''}>Grant</button>
                </div>
            </div>`;
    }

    function body() {
        if (!characters.length) {
            return `<div class="empty-state">
                        <h3>No characters in this world</h3>
                        <p>Characters created in either version appear here.</p>
                    </div>`;
        }

        const pending = characters.filter(c => c.pending_level_up).length;

        return `
            <div class="section-head">
                <span class="eyebrow">Levelling mode</span><span class="rule"></span>
            </div>
            <div class="segmented accent" style="align-self:flex-start">
                <button class="${mode === 'milestone' ? 'is-active' : ''}"
                        onclick="setLevelingMode('milestone')">Milestone</button>
                <button class="${mode === 'exp' ? 'is-active' : ''}"
                        onclick="setLevelingMode('exp')">EXP</button>
            </div>
            <p class="hint">${mode === 'milestone'
                ? 'You grant levels directly.'
                : 'Characters level automatically at the 5e experience thresholds.'}</p>

            ${pending ? `
                <div class="error-banner" style="background:var(--accent-soft);border-color:var(--accent-soft-border);color:var(--text-secondary)">
                    ${pending} character${pending === 1 ? ' has' : 's have'} a level waiting to be taken.
                    Levelling up is finished in the classic version, which picks the
                    new features and hit points.
                </div>` : ''}

            <div class="section-head">
                <span class="eyebrow">Whole party</span><span class="rule"></span>
            </div>
            ${mode === 'milestone'
                ? `<button class="btn btn-accent" style="align-self:flex-start"
                           onclick="grantPartyLevel()" ${busy ? 'disabled' : ''}>Grant a level to everyone</button>`
                : `<div class="exp-grant">
                       <input id="party-exp" type="number" min="1" placeholder="EXP amount"
                              aria-label="EXP for the whole party">
                       <button class="btn btn-accent" onclick="grantPartyExp()"
                               ${busy ? 'disabled' : ''}>Grant to everyone</button>
                   </div>`}

            <div class="section-head">
                <span class="eyebrow">Individually</span><span class="rule"></span>
            </div>
            <div class="stack">
                ${characters.map(mode === 'milestone' ? milestoneRow : expRow).join('')}
            </div>`;
    }

    function draw() {
        renderShell({
            active: 'dm',
            title: 'DM panel',
            sub: `${session.gameWorldName} · ${characters.length} character${characters.length === 1 ? '' : 's'}`,
            counts: { characters: characters.length }
        });
        $('#main-content').innerHTML = body();
    }

    (async function init() {
        renderShell({ active: 'dm', title: 'DM panel', sub: session.gameWorldName || '' });

        // The panel writes levels for the whole world, so it is DM-only. The
        // nav already hides it, but the page is reachable by URL.
        if (!isDM) {
            $('#main-content').innerHTML = `
                <div class="empty-state">
                    <h3>DM only</h3>
                    <p>This panel grants levels and experience across the world.</p>
                    <a class="btn" href="index.html">Back to the overview</a>
                </div>`;
            return;
        }

        $('#main-content').innerHTML = '<div class="skeleton"></div>';
        try {
            await refresh();
        } catch (err) {
            console.error('Failed to load the DM panel:', err);
            $('#main-content').innerHTML =
                '<div class="error-banner">Could not load this world. Check your connection and refresh.</div>';
        }
    })();
})();
