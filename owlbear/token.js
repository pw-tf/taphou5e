// ========================================
// TAPHOU5E for Owlbear Rodeo — the token popup
//
// Shown inside the context menu Owlbear opens when a linked token is clicked.
//   A character: their HP, damage and heal, and the full sheet in a modal.
//   An enemy, for the GM: its HP, damage and heal, and the encounter's
//     "monster HP visible" switch -- the same column the v2 tracker flips.
//   An enemy, for a player: the bar if the DM shows monster HP, otherwise
//     only how it is faring.
// ========================================

import {
    OBR, SHEET_MODAL, page, linkOf, liveSession, fetchLinked, hpView, applyHP, followTheme
} from './obr.js';

const root = document.getElementById('token');

OBR.onReady(async () => {
    followTheme();
    const role = await OBR.player.getRole();
    let link = null;
    let item = null;
    let view = null;
    let note = '';

    async function load() {
        const [id] = (await OBR.player.getSelection()) || [];
        item = id ? (await OBR.scene.items.getItems([id]))[0] : null;
        link = linkOf(item);
        view = link && liveSession() ? hpView(link, await fetchLinked([link]), role) : null;
        draw();
    }

    function draw() {
        if (!link) { root.innerHTML = ''; return; }
        if (!liveSession()) {
            root.innerHTML = `
                <div class="tk-name">${escapeHtml(item.name)}</div>
                <p class="hint">${role === 'GM'
                    ? 'Sign in from the taphou5e button in the toolbar.'
                    : 'Waiting for the GM to connect taphou5e.'}</p>`;
            return;
        }
        if (!view) {
            root.innerHTML = `
                <div class="tk-name">${escapeHtml(item.name)}</div>
                <p class="hint">${link.kind === 'combatant' && role !== 'GM'
                    ? 'Not in a running encounter.'
                    : 'Its taphou5e record is gone. Link the token again.'}</p>`;
            return;
        }

        const cls = hpClass(view.current, view.max);
        root.innerHTML = `
            <div class="tk-head">
                <div class="tk-name">${escapeHtml(view.name)}</div>
                ${view.bar ? '' : `<span class="hp-state state-${cls}">${hpStateLabel(view.current, view.max)}</span>`}
            </div>
            ${view.bar ? renderHP(view.current, view.max, view.temp, 'row') : ''}
            ${view.edit ? `
                <div class="hp-ctl tk-ctl">
                    <button class="hp-btn damage" data-hp="-1" aria-label="Damage">−</button>
                    <input id="tk-amount" type="number" inputmode="numeric" min="0" placeholder="1"
                           aria-label="Amount">
                    <button class="hp-btn heal" data-hp="1" aria-label="Heal">+</button>
                    ${view.kind === 'character'
                        ? '<button class="btn btn-accent" id="tk-sheet">Sheet</button>' : ''}
                </div>` : ''}
            ${role === 'GM' && view.kind === 'combatant' && view.encounter ? `
                <button class="btn btn-block tk-toggle" id="tk-toggle">
                    ${view.encounter.hide_monster_hp ? 'Monster HP hidden from players' : 'Monster HP shown to players'}
                </button>` : ''}
            ${note ? `<p class="hint tk-note">${escapeHtml(note)}</p>` : ''}`;

        root.querySelectorAll('[data-hp]').forEach(button => {
            button.addEventListener('click', () => changeHP(Number(button.dataset.hp)));
        });
        document.getElementById('tk-amount')?.addEventListener('keydown', e => {
            if (e.key === 'Enter') changeHP(-1);
        });
        document.getElementById('tk-sheet')?.addEventListener('click', openSheet);
        document.getElementById('tk-toggle')?.addEventListener('click', toggleMonsterHP);
    }

    async function changeHP(sign) {
        const input = document.getElementById('tk-amount');
        const amount = Math.abs(parseInt(input && input.value, 10)) || 1;
        const { error } = await applyHP(view, sign * amount);
        note = error ? 'Could not save that hit point change.' : '';
        if (!error) view.current = Math.max(0, Math.min(view.max || 0, view.current + sign * amount));
        draw();
    }

    async function toggleMonsterHP() {
        const enc = view.encounter;
        const next = !enc.hide_monster_hp;
        const { error } = await db.from('encounters').update({ hide_monster_hp: next }).eq('id', enc.id);
        note = error ? 'Could not change that.' : '';
        if (!error) enc.hide_monster_hp = next;
        draw();
    }

    async function openSheet() {
        const [width, height] = await Promise.all([OBR.viewport.getWidth(), OBR.viewport.getHeight()]);
        OBR.modal.open({
            id: SHEET_MODAL,
            url: page(`../v2/character-sheet.html?id=${encodeURIComponent(view.row.id)}&embed=1`),
            width: Math.min(480, width - 32),
            height: Math.min(900, height - 48)
        });
    }

    OBR.player.onChange(player => {
        const [id] = player.selection || [];
        if (!item || id !== item.id) load();
    });
    if (liveSession()) {
        onCharacterChange(ids => link && link.kind === 'character' && ids.includes(link.id) ? load() : null);
        onEncounterChange(ids => view && view.kind === 'combatant' && ids.includes(view.row.encounter_id) ? load() : null);
    }
    load();
});
