// ========================================
// TAPHOU5E for Owlbear Rodeo — shared module
//
// Loaded by every extension page after supabase-js and ../v2/js/core.js, so
// db, getSession, saveSession, onCharacterChange, hpClass and the rest are the
// v2 ones. See docs/campaigns-schema-design.md 11.3a23.
//
// Owlbear loads each page in an iframe on owlbear.rodeo. The browser gives
// those iframes their own storage, apart from the taphou5e site, but all of
// them share it with each other -- including v2 pages opened in an Owlbear
// modal. A session saved here under core.js's SESSION_KEY is the one the
// embedded character sheet reads.
// ========================================

import OBR from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';
export { OBR };
export { buildShape } from 'https://cdn.jsdelivr.net/npm/@owlbear-rodeo/sdk@3.1.0/+esm';

export const ID = 'com.taphou5e.owlbear';

// Token metadata: { kind: 'character' | 'combatant', id }. Nothing else about
// the character is stored on the map; every client reads it from taphou5e.
export const LINK = `${ID}/link`;

// Room metadata.
//   ROOM_SESSION   { worldId, worldName, token, issued } -- the player session
//                  the GM's client shares, or { off: true, worldId } after
//                  "Stop sharing"
//   ROOM_ENCOUNTER the encounter the GM links enemy tokens from
export const ROOM_SESSION = `${ID}/session`;
export const ROOM_ENCOUNTER = `${ID}/encounter`;

// Marks the HP bars this extension draws as local items.
export const BAR = `${ID}/bar`;

export const SHEET_MODAL = `${ID}/sheet`;
export const LINK_POPOVER = `${ID}/link`;

// The GM's client shares again an hour before the server's twelve run out.
export const SHARE_REFRESH_MS = 11 * 60 * 60 * 1000;

// Every page here built its Supabase client from the session it found at
// load. When another page signs in, signs out or adopts a new shared session,
// this one starts again with it.
window.addEventListener('storage', event => {
    if (event.key === SESSION_KEY || event.key === null) window.location.reload();
});

export const page = file => new URL(file, import.meta.url).href;
export const ICON = page('icon.svg');

export function linkOf(item) {
    const link = item && item.metadata && item.metadata[LINK];
    return link && link.id && (link.kind === 'character' || link.kind === 'combatant') ? link : null;
}

// core.js's sessionTokenExpired asks about the session it found at load. The
// pages here need to ask about whichever session they are holding.
export function sessionValid(s) {
    if (!s || !s.dmToken) return false;
    const issued = s.dmTokenIssued || s.timestamp || 0;
    return Date.now() - issued <= SESSION_TOKEN_TTL_MS;
}

export function liveSession() {
    const s = getSession();
    return sessionValid(s) ? s : null;
}

// A shared room session as v2 stores a login.
export function sessionFromRoom(shared) {
    return {
        gameWorldId: shared.worldId,
        gameWorldName: shared.worldName,
        role: 'player',
        timestamp: shared.issued,
        dmToken: shared.token,
        dmTokenIssued: shared.issued
    };
}

export function roomSessionUsable(shared) {
    return !!shared && !shared.off && !!shared.token &&
        Date.now() - (shared.issued || 0) < SESSION_TOKEN_TTL_MS;
}

// A client for a token other than the one this page loaded with: core.js
// builds db once, from the session it found at load.
export function clientFor(token) {
    return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        global: { headers: { 'x-dm-token': token } }
    });
}

// Mint a player session from the GM's DM session and put it in the room.
// Returns { ok } or { ok: false, error }, where error 'unsupported' means the
// database predates world_share_player_session and the GM must give the
// player PIN instead (shareWithPlayerToken).
export async function shareRoomSession(dmToken) {
    const { data, error } = await clientFor(dmToken).rpc('world_share_player_session');
    if (error) {
        const missing = error.code === 'PGRST202' || /could not find the function/i.test(error.message || '');
        return { ok: false, error: missing ? 'unsupported' : 'failed' };
    }
    if (!data || !data.ok) return { ok: false, error: (data && data.error) || 'failed' };
    await publishRoomSession(data);
    return { ok: true };
}

// data is a world_login or world_share_player_session result for a player.
export async function publishRoomSession(data) {
    await OBR.room.setMetadata({
        [ROOM_SESSION]: {
            worldId: data.game_world_id,
            worldName: data.game_world_name,
            token: data.dm_token,
            issued: Date.now()
        }
    });
}

export async function stopRoomSession(worldId) {
    await OBR.room.setMetadata({ [ROOM_SESSION]: { off: true, worldId } });
}

// ========================================
// Reading what tokens are linked to
// ========================================

const CHARACTER_COLUMNS = 'id, name, current_hit_points, hit_point_maximum, temporary_hit_points';
const COMBATANT_COLUMNS =
    'id, encounter_id, display_name, current_hit_points, max_hit_points, temporary_hit_points, is_defeated';

const byId = rows => Object.fromEntries((rows || []).map(r => [r.id, r]));
const unique = list => Array.from(new Set(list));

// A player session reads combatants of active encounters only (the policies
// decide, not this code), so a player's client finds no row for an enemy
// until the DM starts the fight.
export async function fetchLinked(links) {
    const characterIds = unique(links.filter(l => l.kind === 'character').map(l => l.id));
    const combatantIds = unique(links.filter(l => l.kind === 'combatant').map(l => l.id));
    const none = { data: [] };

    const [characters, combatants] = await Promise.all([
        characterIds.length ? db.from('characters').select(CHARACTER_COLUMNS).in('id', characterIds) : none,
        combatantIds.length ? db.from('encounter_combatants').select(COMBATANT_COLUMNS).in('id', combatantIds) : none
    ]);
    const encounterIds = unique((combatants.data || []).map(c => c.encounter_id));
    const encounters = encounterIds.length
        ? await db.from('encounters').select('id, name, status, hide_monster_hp').in('id', encounterIds)
        : none;

    return {
        characters: byId(characters.data),
        combatants: byId(combatants.data),
        encounters: byId(encounters.data)
    };
}

// What one client may show for one token. The rules live here so the bar on
// the map and the panel in the context menu cannot disagree.
//   bar   draw the HP bar / numbers
//   state show the state word (Healthy ... Down)
//   edit  offer damage and heal
export function hpView(link, data, role) {
    if (!link) return null;
    if (link.kind === 'character') {
        const ch = data.characters[link.id];
        if (!ch) return null;
        return {
            kind: 'character', name: ch.name, row: ch,
            current: ch.current_hit_points ?? 0, max: ch.hit_point_maximum ?? 0,
            temp: ch.temporary_hit_points ?? 0,
            bar: true, state: true, edit: true
        };
    }
    const row = data.combatants[link.id];
    if (!row) return null;
    const enc = data.encounters[row.encounter_id] || null;
    const gm = role === 'GM';
    // The tracker's own rule: players read monster HP only when the DM has
    // made it visible. Here they still get the state word, on a click.
    const visible = gm || (enc && !enc.hide_monster_hp);
    return {
        kind: 'combatant', name: row.display_name, row, encounter: enc,
        current: row.current_hit_points ?? 0, max: row.max_hit_points ?? 0,
        temp: row.temporary_hit_points ?? 0,
        bar: !!visible, state: true, edit: gm
    };
}

// The tracker's applyHP and the sheet's setHP, for one token: clamp to
// [0, max]; a monster at zero is defeated, and healed off zero is not.
export async function applyHP(view, delta) {
    const next = Math.max(0, Math.min(view.max || 0, view.current + delta));
    if (view.kind === 'character') {
        return db.from('characters').update({ current_hit_points: next }).eq('id', view.row.id);
    }
    return db.from('encounter_combatants')
        .update({ current_hit_points: next, is_defeated: next === 0 }).eq('id', view.row.id);
}

// Follow Owlbear's light or dark mode rather than taphou5e's own setting:
// these pages sit inside Owlbear's chrome.
export async function followTheme() {
    const apply = theme => document.documentElement.setAttribute(
        'data-theme', theme.mode === 'LIGHT' ? 'light' : 'dark');
    apply(await OBR.theme.getTheme());
    OBR.theme.onChange(apply);
}
