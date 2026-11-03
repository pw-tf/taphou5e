// ========================================
// TAPHOU5E for Owlbear Rodeo — the toolbar panel
//
// GM: sign in with the world name and DM PIN, share a player session with
// the room, choose the encounter enemies come from, flip its monster-HP
// switch, and link tokens by name.
// Player: nothing to do. The panel says whether the GM has connected.
// ========================================

import {
    OBR, LINK, ROOM_SESSION, ROOM_ENCOUNTER, linkOf, liveSession, roomSessionUsable,
    shareRoomSession, publishRoomSession, stopRoomSession, fetchLinked, followTheme
} from './obr.js';

const root = document.getElementById('panel');

// v2's wording (v2/js/login.js loginErrorMessage), so both say the same.
const LOGIN_ERRORS = {
    not_found: 'Game world not found',
    bad_pin: 'Incorrect PIN',
    rate_limited: 'Too many attempts. Please wait 15 minutes and try again.',
    captcha_required: "Couldn't confirm you're not a bot. Please try again.",
    captcha_invalid: "Couldn't confirm you're not a bot. Please try again.",
    captcha_expired: "Couldn't confirm you're not a bot. Please try again.",
    captcha_replayed: "Couldn't confirm you're not a bot. Please try again."
};

const norm = s => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// "Goblin 2" and "Goblin" are both a goblin.
const baseName = s => norm(s).replace(/\s*#?\d+$/, '');

OBR.onReady(async () => {
    followTheme();
    const role = await OBR.player.getRole();
    let room = await OBR.room.getMetadata();
    OBR.room.onMetadataChange(metadata => { room = metadata; redraw(); });

    const session = liveSession();
    let note = '';
    let needPlayerPin = false;
    let encounters = [];

    if (role === 'GM' && session && session.role === 'dm') {
        const { data } = await db.from('encounters')
            .select('id, name, status, hide_monster_hp')
            .eq('game_world_id', session.gameWorldId).neq('status', 'completed').order('created_at');
        encounters = data || [];
        onEncounterChange(async () => {
            const { data: rows } = await db.from('encounters')
                .select('id, name, status, hide_monster_hp')
                .eq('game_world_id', session.gameWorldId).neq('status', 'completed').order('created_at');
            encounters = rows || [];
            redraw();
        });
    }
    if (role === 'GM' && !(session && session.role === 'dm')) window.Taphou5eAltcha.init(SUPABASE_URL, SUPABASE_ANON_KEY);

    function chosenEncounter() {
        return encounters.find(e => e.id === room[ROOM_ENCOUNTER])
            || encounters.find(e => e.status === 'active') || encounters[0] || null;
    }

    // For changes made elsewhere: never redraw a form out from under someone typing in it.
    function redraw() {
        const el = document.activeElement;
        if (el && root.contains(el) && /^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) return;
        draw();
    }

    async function draw() {
        if (role !== 'GM') return drawPlayer();
        if (!session || session.role !== 'dm') return drawLogin();
        return drawGM();
    }

    // ---------- Player ----------

    function drawPlayer() {
        const shared = room[ROOM_SESSION];
        root.innerHTML = roomSessionUsable(shared) ? `
            <div class="eyebrow">Connected</div>
            <h2 class="pn-world">${escapeHtml(shared.worldName)}</h2>
            <p class="hint">Click your token to see its hit points and open your character sheet.</p>` : `
            <div class="eyebrow">taphou5e</div>
            <p>Waiting for the GM to connect taphou5e.</p>
            <p class="hint">Nothing to do here: the GM signs in, and this connects on its own.</p>`;
    }

    // ---------- GM: sign in ----------

    // Kept across a refused attempt, which redraws the form.
    let typedWorld = null;

    function drawLogin() {
        const last = room[ROOM_SESSION];
        const world = typedWorld ?? ((last && last.worldName) || '');
        root.innerHTML = `
            <div class="eyebrow">taphou5e</div>
            <h2 class="pn-world">Connect a game world</h2>
            <form id="pn-login" class="pn-form" autocomplete="off">
                <label for="pn-world">Game world</label>
                <input id="pn-world" type="text" maxlength="50" required
                       value="${escapeHtml(world)}">
                <label for="pn-pin">DM PIN</label>
                <input id="pn-pin" class="mono" type="password" inputmode="numeric" pattern="\\d{4}"
                       maxlength="4" required>
                <button class="btn btn-accent btn-block btn-submit" type="submit">Sign in</button>
                ${note ? `<p class="pn-error" role="alert">${escapeHtml(note)}</p>` : ''}
            </form>
            <p class="hint">Players in this room are connected through you, and never type a PIN.</p>`;

        const form = document.getElementById('pn-login');
        form.addEventListener('submit', async e => {
            e.preventDefault();
            const worldName = document.getElementById('pn-world').value.trim();
            typedWorld = worldName;
            const pin = document.getElementById('pn-pin').value.trim();
            if (!/^\d{4}$/.test(pin)) { note = 'The PIN is four digits.'; return drawLogin(); }
            form.querySelector('.btn-submit').setAttribute('aria-busy', 'true');
            const { data, error } = await db.rpc('world_login', {
                p_world_name: worldName, p_pin: pin, p_altcha: await window.Taphou5eAltcha.take()
            });
            if (error || !data || !data.ok) {
                note = (data && LOGIN_ERRORS[data.error]) || 'An error occurred. Please try again.';
                return drawLogin();
            }
            if (data.role !== 'dm') {
                note = 'That is the player PIN. The GM signs in with the DM PIN.';
                return drawLogin();
            }
            // The same shape v2's login stores, so the embedded sheet reads it.
            saveSession({
                gameWorldId: data.game_world_id,
                gameWorldName: data.game_world_name,
                role: 'dm',
                timestamp: Date.now(),
                dmToken: data.dm_token,
                dmTokenIssued: Date.now()
            }, true);
            // The background page shares the player session once it sees this.
            window.location.reload();
        });
    }

    // ---------- GM: signed in ----------

    async function drawGM() {
        const shared = room[ROOM_SESSION];
        const sharing = roomSessionUsable(shared) && shared.worldId === session.gameWorldId;
        const until = sharing ? new Date(shared.issued + SESSION_TOKEN_TTL_MS)
            .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
        const enc = chosenEncounter();
        const linkedTokens = await OBR.scene.isReady()
            ? await OBR.scene.items.getItems(item => !!linkOf(item)) : [];
        const data = linkedTokens.length ? await fetchLinked(linkedTokens.map(linkOf))
            : { characters: {}, combatants: {} };
        const target = item => {
            const l = linkOf(item);
            const row = l.kind === 'character' ? data.characters[l.id] : data.combatants[l.id];
            return row ? (row.name || row.display_name) : 'missing';
        };

        root.innerHTML = `
            <div class="eyebrow">Connected · DM</div>
            <h2 class="pn-world">${escapeHtml(session.gameWorldName)}</h2>

            <section class="pn-section">
                ${sharing ? `
                    <p>Players in this room are connected until ${escapeHtml(until)}. It renews on its own.</p>
                    <button class="btn btn-block" id="pn-stop">Stop sharing</button>` : `
                    <p>Players in this room are not connected. They see no sheets and no hit points.</p>
                    <button class="btn btn-accent btn-block" id="pn-share">Connect the players</button>`}
                ${needPlayerPin ? `
                    <form id="pn-pinshare" class="pn-form">
                        <label for="pn-player-pin">This world's database is older. Give the player PIN once instead.</label>
                        <input id="pn-player-pin" class="mono" type="password" inputmode="numeric" maxlength="4" required>
                        <button class="btn btn-accent btn-block btn-submit" type="submit">Connect the players</button>
                    </form>` : ''}
            </section>

            <section class="pn-section">
                <div class="eyebrow">Enemies come from</div>
                ${encounters.length ? `
                    <select id="pn-encounter" class="lk-select" aria-label="Encounter">
                        ${encounters.map(e => `<option value="${escapeHtml(e.id)}"${enc && e.id === enc.id ? ' selected' : ''}>
                            ${escapeHtml(e.name)}${e.status === 'active' ? ' (running)' : ''}</option>`).join('')}
                    </select>
                    <label class="pn-check">
                        <input type="checkbox" id="pn-show-hp"${enc && !enc.hide_monster_hp ? ' checked' : ''}>
                        Show monster HP to players
                    </label>
                    ${enc && enc.status !== 'active'
                        ? '<p class="hint">Players see enemies once this encounter is started in the tracker.</p>' : ''}`
                    : '<p class="hint">No encounters yet. Build one in the taphou5e tracker.</p>'}
                <button class="btn btn-block" id="pn-autolink">Link tokens by name</button>
            </section>

            <section class="pn-section">
                <div class="eyebrow">Linked tokens</div>
                <div class="lk-list">
                    ${linkedTokens.map(item => `
                        <div class="lk-row is-static">
                            <span class="lk-name">${escapeHtml(item.name)}</span>
                            <span class="lk-meta">${escapeHtml(target(item))}</span>
                            <button class="icon-btn" data-unlink="${escapeHtml(item.id)}"
                                    aria-label="Unlink ${escapeHtml(item.name)}">&times;</button>
                        </div>`).join('') || '<p class="hint">None yet. Right-click a token, or link by name.</p>'}
                </div>
            </section>

            ${note ? `<p class="hint pn-note" role="status">${escapeHtml(note)}</p>` : ''}
            <button class="btn btn-block" id="pn-signout">Sign out</button>`;

        document.getElementById('pn-stop')?.addEventListener('click', () => stopRoomSession(session.gameWorldId));
        document.getElementById('pn-share')?.addEventListener('click', share);
        document.getElementById('pn-pinshare')?.addEventListener('submit', shareWithPlayerPin);
        document.getElementById('pn-encounter')?.addEventListener('change', e =>
            OBR.room.setMetadata({ [ROOM_ENCOUNTER]: e.target.value }));
        document.getElementById('pn-show-hp')?.addEventListener('change', async e => {
            const { error } = await db.from('encounters')
                .update({ hide_monster_hp: !e.target.checked }).eq('id', enc.id);
            if (error) { note = 'Could not change that.'; return draw(); }
            enc.hide_monster_hp = !e.target.checked;
        });
        document.getElementById('pn-autolink')?.addEventListener('click', autoLink);
        root.querySelectorAll('[data-unlink]').forEach(button => button.addEventListener('click', async () => {
            await OBR.scene.items.updateItems([button.dataset.unlink], drafts => {
                drafts.forEach(d => { delete d.metadata[LINK]; });
            });
            draw();
        }));
        document.getElementById('pn-signout').addEventListener('click', async () => {
            // The shared session would outlive the GM's by up to twelve hours.
            await stopRoomSession(session.gameWorldId);
            clearSession();
            window.location.reload();
        });
    }

    async function share() {
        const result = await shareRoomSession(session.dmToken);
        if (result.ok) { note = ''; needPlayerPin = false; }
        else if (result.error === 'unsupported') { needPlayerPin = true; window.Taphou5eAltcha.init(SUPABASE_URL, SUPABASE_ANON_KEY); }
        else note = 'Could not connect the players. Try again in a few minutes.';
        draw();
    }

    async function shareWithPlayerPin(e) {
        e.preventDefault();
        const pin = document.getElementById('pn-player-pin').value.trim();
        const { data, error } = await db.rpc('world_login', {
            p_world_name: session.gameWorldName, p_pin: pin, p_altcha: await window.Taphou5eAltcha.take()
        });
        if (error || !data || !data.ok) {
            note = (data && LOGIN_ERRORS[data.error]) || 'An error occurred. Please try again.';
        } else if (data.role !== 'player') {
            note = 'That is the DM PIN. Players get the player PIN.';
        } else {
            await publishRoomSession(data);
            note = '';
            needPlayerPin = false;
        }
        draw();
    }

    async function autoLink() {
        if (!(await OBR.scene.isReady())) { note = 'Open a scene first.'; return draw(); }
        const all = await OBR.scene.items.getItems(item => item.layer === 'CHARACTER' || item.layer === 'MOUNT');
        const taken = new Set(all.map(linkOf).filter(Boolean).map(l => `${l.kind}:${l.id}`));
        const loose = all.filter(item => !linkOf(item));

        const { data: characters } = await db.from('characters')
            .select('id, name').eq('game_world_id', session.gameWorldId);
        const enc = chosenEncounter();
        const { data: combatants } = enc ? await db.from('encounter_combatants')
            .select('id, display_name').eq('encounter_id', enc.id)
            .neq('combatant_type', 'character').order('sort_order') : { data: [] };

        const free = (combatants || []).filter(c => !taken.has(`combatant:${c.id}`));
        const links = {};
        for (const item of loose) {
            const name = norm(item.name);
            const pc = (characters || []).find(c => norm(c.name) === name);
            if (pc) { links[item.id] = { kind: 'character', id: pc.id }; continue; }
            // An exact "Goblin 2" first, then any goblin left over.
            const exact = free.findIndex(c => norm(c.display_name) === name);
            const loose_ = exact >= 0 ? exact : free.findIndex(c => baseName(c.display_name) === baseName(item.name));
            if (loose_ >= 0) {
                links[item.id] = { kind: 'combatant', id: free[loose_].id };
                free.splice(loose_, 1);
            }
        }

        const ids = Object.keys(links);
        if (ids.length) {
            await OBR.scene.items.updateItems(ids, drafts => {
                drafts.forEach(d => { d.metadata[LINK] = links[d.id]; });
            });
        }
        note = ids.length
            ? `Linked ${ids.length} token${ids.length === 1 ? '' : 's'}. ${loose.length - ids.length} had no match.`
            : 'No unlinked token matched a character or an enemy by name.';
        draw();
    }

    // Moving a token changes the scene constantly; only a link or a name
    // changes what this panel lists.
    let listed = '';
    OBR.scene.items.onChange(items => {
        if (role !== 'GM' || !session) return;
        const key = items.filter(item => !!linkOf(item))
            .map(item => `${item.id}=${item.name}=${linkOf(item).id}`).sort().join('|');
        if (key === listed) return;
        listed = key;
        redraw();
    });
    draw();
});
