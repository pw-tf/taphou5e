// ========================================
// TAPHOU5E for Owlbear Rodeo — link a token
//
// Opened from a token's context menu. Lists the world's characters, and for
// the GM the combatants of the encounter chosen in the panel, and writes the
// pick into the token's metadata. Nothing else about the character goes on
// the map.
// ========================================

import {
    OBR, LINK, LINK_POPOVER, ROOM_ENCOUNTER, linkOf, liveSession, followTheme
} from './obr.js';

const root = document.getElementById('link');

OBR.onReady(async () => {
    followTheme();
    const role = await OBR.player.getRole();
    const session = liveSession();
    if (!session) {
        root.innerHTML = `<p class="hint">${role === 'GM'
            ? 'Sign in from the taphou5e button in the toolbar first.'
            : 'Waiting for the GM to connect taphou5e.'}</p>`;
        return;
    }

    const [id] = (await OBR.player.getSelection()) || [];
    const [token] = id ? await OBR.scene.items.getItems([id]) : [];
    if (!token) { OBR.popover.close(LINK_POPOVER); return; }

    const worldId = session.gameWorldId;
    const onMap = new Set((await OBR.scene.items.getItems(item => !!linkOf(item)))
        .map(item => `${linkOf(item).kind}:${linkOf(item).id}`));

    const { data: characters } = await db.from('characters')
        .select('id, name, class, level').eq('game_world_id', worldId).order('name');

    let encounters = [];
    let encounterId = null;
    let combatants = [];
    if (role === 'GM') {
        const { data } = await db.from('encounters')
            .select('id, name, status').eq('game_world_id', worldId).neq('status', 'completed').order('created_at');
        encounters = data || [];
        const chosen = (await OBR.room.getMetadata())[ROOM_ENCOUNTER];
        const pick = encounters.find(e => e.id === chosen)
            || encounters.find(e => e.status === 'active') || encounters[0];
        encounterId = pick ? pick.id : null;
        await loadCombatants();
    }

    async function loadCombatants() {
        if (!encounterId) { combatants = []; return; }
        const { data } = await db.from('encounter_combatants')
            .select('id, display_name, combatant_type').eq('encounter_id', encounterId)
            .neq('combatant_type', 'character').order('sort_order');
        combatants = data || [];
    }

    const row = (kind, rowId, name, meta) => `
        <button class="lk-row${onMap.has(`${kind}:${rowId}`) ? ' is-linked' : ''}"
                data-kind="${kind}" data-id="${escapeHtml(rowId)}">
            <span class="lk-name">${escapeHtml(name)}</span>
            <span class="lk-meta">${onMap.has(`${kind}:${rowId}`) ? 'on the map' : escapeHtml(meta)}</span>
        </button>`;

    function draw() {
        root.innerHTML = `
            <h2 class="lk-title">Link “${escapeHtml(token.name)}”</h2>
            <div class="eyebrow">Characters</div>
            <div class="lk-list">
                ${(characters || []).map(c => row('character', c.id, c.name,
                    `Lv ${c.level || 1} ${c.class || ''}`)).join('') || '<p class="hint">No characters in this world.</p>'}
            </div>
            ${role === 'GM' ? `
                <div class="eyebrow">Enemies</div>
                ${encounters.length ? `
                    <select id="lk-encounter" class="lk-select" aria-label="Encounter">
                        ${encounters.map(e => `<option value="${escapeHtml(e.id)}"${e.id === encounterId ? ' selected' : ''}>
                            ${escapeHtml(e.name)}${e.status === 'active' ? ' (running)' : ''}</option>`).join('')}
                    </select>
                    <div class="lk-list">
                        ${combatants.map(c => row('combatant', c.id, c.display_name, c.combatant_type)).join('')
                            || '<p class="hint">No monsters or NPCs in this encounter.</p>'}
                    </div>` : '<p class="hint">No encounters yet. Build one in the taphou5e tracker.</p>'}` : ''}`;

        root.querySelectorAll('.lk-row').forEach(button => button.addEventListener('click', async () => {
            const link = { kind: button.dataset.kind, id: button.dataset.id };
            await OBR.scene.items.updateItems([token.id], drafts => {
                drafts.forEach(d => { d.metadata[LINK] = link; });
            });
            OBR.popover.close(LINK_POPOVER);
        }));
        document.getElementById('lk-encounter')?.addEventListener('change', async e => {
            encounterId = e.target.value;
            await OBR.room.setMetadata({ [ROOM_ENCOUNTER]: encounterId });
            await loadCombatants();
            draw();
        });
    }

    draw();
});
