// ========================================
// TAPHOU5E for Owlbear Rodeo — background
//
// Runs once per person in the room, unseen. It:
//   - keeps the room's shared player session (the GM's client mints it,
//     everyone else's adopts it),
//   - registers the token context menus,
//   - draws HP bars as local items, which exist only in this client, so each
//     person's bars follow what they may see, and nothing is saved into the
//     scene.
// ========================================

import {
    OBR, buildShape, LINK, ROOM_SESSION, BAR, LINK_POPOVER, ICON, SHARE_REFRESH_MS,
    page, linkOf, liveSession, sessionFromRoom, roomSessionUsable, shareRoomSession,
    fetchLinked, hpView, ID
} from './obr.js';

const HP_COLOURS = { high: '#7fa65c', mid: '#d9a94a', low: '#c4452f' };
const TEMP_COLOUR = '#3d5a72';
const TRACK_COLOUR = '#15110e';
const TRACK_EDGE = '#47392e';

// A share that failed waits this long before the next try, so a room whose
// metadata changes often does not turn one refusal into a stream of them.
const SHARE_RETRY_MS = 5 * 60 * 1000;

OBR.onReady(async () => {
    const role = await OBR.player.getRole();
    const room = await OBR.room.getMetadata();
    if (role === 'GM') keepShared(room[ROOM_SESSION]);
    else if (adoptShared(room[ROOM_SESSION])) return;   // reloading

    OBR.room.onMetadataChange(metadata => {
        if (role === 'GM') keepShared(metadata[ROOM_SESSION]);
        else adoptShared(metadata[ROOM_SESSION]);
    });

    registerMenus();
    startBars(role);
});

// ========================================
// The shared session
// ========================================

// A player's client takes whatever the room holds. Returns true when it is
// about to reload, because core.js builds its client once, at load.
function adoptShared(shared) {
    const current = getSession();
    const token = s => (s && s.dmToken) || null;
    const wanted = roomSessionUsable(shared) ? sessionFromRoom(shared) : null;
    if (token(current) === token(wanted)) return false;

    if (wanted) saveSession(wanted, true);
    else clearSession();
    // Storage the browser refuses would otherwise reload this page forever.
    if (token(getSession()) !== token(wanted)) {
        console.warn('taphou5e: this browser would not store the session');
        return false;
    }
    window.location.reload();
    return true;
}

let shareTimer = null;
let shareFailedAt = 0;
let shareUnsupported = false;

async function keepShared(shared) {
    clearTimeout(shareTimer);
    const own = liveSession();
    if (!own || own.role !== 'dm') {
        // Nothing can be shared until the GM signs in; the badge says so.
        await OBR.action.setBadgeText('!');
        return;
    }
    await OBR.action.setBadgeText(undefined);

    if (shared && shared.off && shared.worldId === own.gameWorldId) return;   // stopped by the GM

    const current = roomSessionUsable(shared) && shared.worldId === own.gameWorldId;
    if (current && Date.now() - shared.issued < SHARE_REFRESH_MS) {
        shareTimer = setTimeout(() => OBR.room.getMetadata().then(m => keepShared(m[ROOM_SESSION])),
            shared.issued + SHARE_REFRESH_MS - Date.now());
        return;
    }
    if (shareUnsupported || Date.now() - shareFailedAt < SHARE_RETRY_MS) return;

    const result = await shareRoomSession(own.dmToken);
    if (!result.ok) {
        shareFailedAt = Date.now();
        // An older database cannot mint one; the panel asks for the player PIN.
        if (result.error === 'unsupported') shareUnsupported = true;
        console.warn('taphou5e: could not share a player session:', result.error);
    }
    // Success changes the room metadata, which calls this again to set the timer.
}

// ========================================
// Context menus
// ========================================

const linked = [{ key: ['metadata', LINK], value: undefined, operator: '!=' }];
const unlinked = [{ key: ['metadata', LINK], value: undefined }];

function registerMenus() {
    // Shown in the menu that opens when a linked token is clicked. This is
    // the popup: Owlbear opens it on a click and keeps it closed during a drag.
    OBR.contextMenu.create({
        id: `${ID}/token`,
        icons: [{ icon: ICON, label: 'taphou5e', filter: { max: 1, every: linked } }],
        embed: { url: page('token.html'), height: 132 }
    });

    OBR.contextMenu.create({
        id: `${ID}/link-menu`,
        icons: [
            { icon: ICON, label: 'Link to taphou5e',
              filter: { roles: ['GM'], max: 1, every: unlinked } },
            // A player may say which character their own token is.
            { icon: ICON, label: 'Link to taphou5e character',
              filter: { roles: ['PLAYER'], max: 1, every: [...unlinked, { key: 'layer', value: 'CHARACTER' }] } }
        ],
        onClick: (context, elementId) => OBR.popover.open({
            id: LINK_POPOVER,
            url: page('link.html'),
            width: 320,
            height: 440,
            anchorElementId: elementId
        })
    });

    OBR.contextMenu.create({
        id: `${ID}/unlink`,
        icons: [{ icon: ICON, label: 'Unlink from taphou5e', filter: { roles: ['GM'], every: linked } }],
        onClick: context => OBR.scene.items.updateItems(context.items.map(i => i.id), drafts => {
            drafts.forEach(d => { delete d.metadata[LINK]; });
        })
    });
}

// ========================================
// HP bars
// ========================================

function startBars(role) {
    let tokens = [];
    let data = { characters: {}, combatants: {}, encounters: {} };
    let drawn = new Map();     // token id -> what its bar shows, to skip redraws
    let fetchedKey = '';
    let ready = false;

    const linkKey = list => list.map(t => { const l = linkOf(t); return `${l.kind}:${l.id}`; }).sort().join(',');

    async function refetch() {
        if (!liveSession()) { data = { characters: {}, combatants: {}, encounters: {} }; return; }
        data = await fetchLinked(tokens.map(linkOf));
        fetchedKey = linkKey(tokens);
    }

    // One draw at a time, and at most one waiting behind it.
    let running = null;
    let again = false;
    function schedule() {
        if (running) { again = true; return; }
        running = draw().catch(err => console.error('taphou5e: drawing bars failed', err)).finally(() => {
            running = null;
            if (again) { again = false; schedule(); }
        });
    }

    async function draw() {
        if (!ready) return;
        if (linkKey(tokens) !== fetchedKey) await refetch();
        const dpi = await OBR.scene.grid.getDpi();

        const wanted = new Map();
        for (const token of tokens) {
            const view = hpView(linkOf(token), data, role);
            if (!view || !view.bar) continue;
            if (role !== 'GM' && !token.visible) continue;
            const bounds = await OBR.scene.items.getItemBounds([token.id]);
            // A move needs no redraw: the bar is attached and follows. A new
            // size or new hit points do.
            const sig = [Math.round(bounds.width), Math.round(bounds.height),
                         view.current, view.max, view.temp].join('/');
            wanted.set(token.id, { sig, bounds, view });
        }

        const stale = [];
        const fresh = [];
        for (const [id, sig] of drawn) {
            if (!wanted.has(id) || wanted.get(id).sig !== sig) stale.push(id);
        }
        for (const [id, want] of wanted) {
            if (drawn.get(id) !== want.sig) fresh.push(...barItems(id, want.bounds, want.view, dpi));
        }
        if (stale.length) {
            const old = await OBR.scene.local.getItems(item => stale.includes(item.metadata[BAR]));
            if (old.length) await OBR.scene.local.deleteItems(old.map(i => i.id));
        }
        if (fresh.length) await OBR.scene.local.addItems(fresh);
        drawn = new Map(Array.from(wanted, ([id, want]) => [id, want.sig]));
    }

    // Reached from both isReady() and onReadyChange at start, so act on a
    // change only: a second pass would forget the bars the first one drew.
    async function onScene(isReady) {
        if (isReady === ready) return;
        ready = isReady;
        drawn = new Map();
        if (!isReady) { tokens = []; return; }
        // Bars left by this page's last run, before a reload.
        const old = await OBR.scene.local.getItems(item => !!item.metadata[BAR]);
        if (old.length) await OBR.scene.local.deleteItems(old.map(i => i.id));
        tokens = await OBR.scene.items.getItems(item => !!linkOf(item));
        await refetch();
        schedule();
    }

    OBR.scene.onReadyChange(onScene);
    OBR.scene.isReady().then(onScene);
    OBR.scene.items.onChange(items => {
        tokens = items.filter(item => !!linkOf(item));
        schedule();
    });

    if (!liveSession()) return;

    onCharacterChange(async ids => {
        if (!tokens.some(t => { const l = linkOf(t); return l.kind === 'character' && ids.includes(l.id); })) return;
        await refetch();
        schedule();
    });
    onEncounterChange(async ids => {
        // A combatant this client could not read may be in an encounter that
        // has just started, so any encounter change is worth a look while one
        // is missing.
        const links = tokens.map(linkOf).filter(l => l.kind === 'combatant');
        if (!links.length) return;
        const known = links.filter(l => data.combatants[l.id]);
        const touched = known.some(l => ids.includes(data.combatants[l.id].encounter_id));
        if (!touched && known.length === links.length) return;
        await refetch();
        schedule();
    });

    // Encounter signals need the 20261103120607 migration. Until a database
    // has it, enemy bars catch up on this timer instead.
    setInterval(async () => {
        if (!tokens.some(t => linkOf(t).kind === 'combatant')) return;
        await refetch();
        schedule();
    }, 30000);
}

function barItems(tokenId, bounds, view, dpi) {
    const width = bounds.width * 0.84;
    const height = Math.max(dpi * 0.09, 5);
    const x = bounds.center.x - width / 2;
    const y = bounds.max.y + dpi * 0.04;
    const max = view.max > 0 ? view.max : 0;
    const mainPct = max ? Math.max(0, Math.min(1, view.current / max)) : 0;
    const tempPct = max ? Math.max(0, Math.min(1 - mainPct, view.temp / max)) : 0;
    const z = Date.now();

    const part = (name, offset, w, colour, n) => buildShape()
        .id(`${BAR}/${tokenId}/${name}`)
        .shapeType('RECTANGLE')
        .position({ x: x + offset, y })
        .width(w)
        .height(height)
        .fillColor(colour)
        .strokeWidth(0)
        .attachedTo(tokenId)
        .layer('ATTACHMENT')
        .locked(true)
        .disableHit(true)
        .disableAttachmentBehavior(['ROTATION', 'SCALE'])
        .zIndex(z + n)
        .metadata({ [BAR]: tokenId });

    const items = [part('track', 0, width, TRACK_COLOUR, 0)
        .fillOpacity(0.85).strokeColor(TRACK_EDGE).strokeWidth(1).build()];
    if (mainPct > 0) items.push(part('fill', 0, width * mainPct, HP_COLOURS[hpClass(view.current, max)], 1).build());
    if (tempPct > 0) items.push(part('temp', width * mainPct, width * tempPct, TEMP_COLOUR, 2).build());
    return items;
}
