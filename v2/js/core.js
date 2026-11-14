// ========================================
// TAPHOU5E v2 — shared core
//
// Loaded by every v2 page before its own script. Owns the Supabase client,
// the session, the DM token, navigation chrome and a few render helpers.
//
// The v1 app at the repo root is frozen and does not load this file.
// ========================================

const SUPABASE_URL = 'https://zlsguyiwwwbyoqxdewsd.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_IgK3AGmhrS6Zs_GHqUdnRw_AECp3J_e';

const SESSION_KEY  = 'dnd-session';        // shared with v1 -- do not rename
const UI_KEY       = 'taphou5e-ui';        // 'classic' | 'next'
const CAMPAIGN_KEY = 'taphou5e-campaign';  // last opened campaign, per world

const $  = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));

// ========================================
// Session
// ========================================

function getSession() {
    try {
        const raw = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
        return raw ? JSON.parse(raw) : null;
    } catch (e) {
        return null;
    }
}

function saveSession(session, remember) {
    const raw = JSON.stringify(session);
    try {
        if (remember) localStorage.setItem(SESSION_KEY, raw);
        else sessionStorage.setItem(SESSION_KEY, raw);
    } catch (e) { /* private mode */ }
}

function clearSession() {
    try {
        localStorage.removeItem(SESSION_KEY);
        sessionStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(CAMPAIGN_KEY);
    } catch (e) { /* ignore */ }
}

const session = getSession();
const isDM = !!session && session.role === 'dm';

// Opened inside Owlbear Rodeo by the extension in /owlbear/. The page is the
// same; it leaves out the navigation and closes the Owlbear modal instead of
// going back. The session comes from the extension, never from a login here.
const EMBED = new URLSearchParams(window.location.search).has('embed');
if (EMBED) {
    const bridge = document.createElement('script');
    bridge.type = 'module';
    bridge.src = '../owlbear/embed.js';
    document.head.appendChild(bridge);
}

// ========================================
// Supabase client
//
// The session token rides as a request header. Postgres reads it via
// request.headers in the row level security policies, which is what scopes
// every table to one world, and what separates a DM from a player when both
// share the same public key. Both roles are issued one by world_login; the
// field and header keep their dm- names because v1 shares them.
// ========================================

const headers = {};
if (session && session.dmToken) headers['x-dm-token'] = session.dmToken;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers }
});

// Server-side session tokens last 12 hours. There is no way to probe validity
// by reading a table: a lapsed token gets an empty result rather than an error,
// which is indistinguishable from a world that simply has no rows. So track it
// client-side from the issue time. The server stays authoritative; this only
// decides when to send someone back to log in instead of showing an empty world.
const SESSION_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function sessionTokenExpired() {
    if (!session.dmToken) return true;
    const issued = session.dmTokenIssued || session.timestamp || 0;
    return Date.now() - issued > SESSION_TOKEN_TTL_MS;
}

// Inside Owlbear there is no login page to go to: the GM's client shares a
// session with the room, and the extension saves it where this page reads it.
function showEmbedWaiting() {
    document.body.innerHTML = `
        <div class="embed-waiting">
            <p>Waiting for the GM to connect taphou5e.</p>
            <p class="hint">The GM signs in from the taphou5e button in Owlbear's toolbar.</p>
        </div>`;
}

// Pages other than login call this first.
function requireSession() {
    if (EMBED && (!session || sessionTokenExpired())) {
        showEmbedWaiting();
        return false;
    }
    if (!session) {
        window.location.replace('login.html');
        return false;
    }
    // Sessions from before every table was scoped carry no token, and see
    // nothing; a lapsed one is the same. Either way, logging in again fixes it.
    if (sessionTokenExpired()) {
        clearSession();
        window.location.replace('login.html');
        return false;
    }
    return true;
}

// ========================================
// Live updates
//
// The database broadcasts "this character changed" -- which one, nothing
// else -- to a per-world topic that only a session can learn. A page answers by
// re-reading through the normal API, so the policies decide what it sees, and
// a forged signal can cause nothing worse than a re-read.
//
// onCharacterChange(handler) calls handler(ids), the characters that changed,
// once changes settle: a burst (creating a character, a long rest) is one call. A call waits while someone is typing or has a dialog open --
// pages redraw wholesale, and a refresh must never take a value from under a
// cursor or close the level-up wizard -- and keeps the scroll position.
//
// onEncounterChange(handler) is the same for encounters and their combatants,
// with handler(ids) given encounter ids.
// ========================================

let liveChannel = null;
const liveHandlers = new Set();
const encounterHandlers = new Set();

async function startLiveUpdates() {
    if (liveChannel) return;
    liveChannel = 'starting';
    const { data: topic, error } = await db.rpc('world_realtime_topic');
    if (error || !topic) { liveChannel = null; return; }
    liveChannel = db.channel(topic)
        .on('broadcast', { event: 'change' }, ({ payload }) => {
            if (!payload) return;
            if (payload.character_id) liveHandlers.forEach(handler => handler(payload.character_id));
            if (payload.encounter_id) encounterHandlers.forEach(handler => handler(payload.encounter_id));
        })
        .subscribe();
}

function isBusy() {
    if (document.querySelector('[aria-modal="true"]')) return true;
    const el = document.activeElement;
    return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
}

function onCharacterChange(handler) {
    settleInto(liveHandlers, handler);
}

function onEncounterChange(handler) {
    settleInto(encounterHandlers, handler);
}

function settleInto(handlers, handler) {
    const pending = new Set();
    let timer = null;

    async function flush() {
        if (isBusy()) {
            timer = setTimeout(flush, 1000);
            return;
        }
        timer = null;
        const ids = Array.from(pending);
        pending.clear();
        const y = window.scrollY;
        await handler(ids);
        window.scrollTo(0, y);
    }

    handlers.add(id => {
        pending.add(id);
        if (!timer) timer = setTimeout(flush, 400);
    });
    startLiveUpdates();
}

// ========================================
// Version switch
// ========================================

function switchToClassic() {
    try { localStorage.setItem(UI_KEY, 'classic'); } catch (e) { /* ignore */ }
    window.location.href = '../characters.html';
}

function stayOnNext() {
    try { localStorage.setItem(UI_KEY, 'next'); } catch (e) { /* ignore */ }
}

// ========================================
// Helpers
// ========================================

function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// Matches v1's getHpClass thresholds so the two versions never disagree about
// whether a character reads as healthy.
function hpClass(current, max) {
    if (!max || max <= 0) return 'low';
    const pct = (current / max) * 100;
    if (pct > 50) return 'high';
    if (pct > 25) return 'mid';
    return 'low';
}

// The single HP component from the design handoff. One fixed-height rail
// everywhere -- never one element per hit point, which is what the v1 tracker
// does today (a 300 HP creature renders 300 divs).
// The bar is notched: one notch per hit point, drawn by CSS from --hp-max.
// It is a background on one pseudo-element, never an element per hit point,
// and the stylesheet coarsens it to every 5, 10, 50 or 100 when single
// points would be too thin to see at the bar's actual width. A bar with no
// maximum has nothing to divide by, so it gets no notches.
function hpNotchClass(max) { return Number(max) > 0 ? ' notched' : ''; }
function hpNotchStyle(max) { return Number(max) > 0 ? ` style="--hp-max:${Number(max)}"` : ''; }

function renderHP(current, max, temp, variant) {
    const cur = Number(current) || 0;
    const mx = Number(max) || 0;
    const tmp = Number(temp) || 0;
    const cls = hpClass(cur, mx);
    const mainPct = mx > 0 ? Math.max(0, Math.min(100, (cur / mx) * 100)) : 0;
    const tempPct = mx > 0 ? Math.max(0, Math.min(100 - mainPct, (tmp / mx) * 100)) : 0;
    const barClass = `hp-bar${variant ? ' ' + variant : ''}${hpNotchClass(mx)}`;

    return `
        <div class="hp">
            <div class="hp-readout">
                <span class="hp-value"><b>${cur}</b><span class="max">/${mx}</span>${
                    tmp > 0 ? `<span class="temp">+${tmp}</span>` : ''
                }</span>
                <span class="hp-state state-${cls}">${hpStateLabel(cur, mx)}</span>
            </div>
            <div class="${barClass}"${hpNotchStyle(mx)}>
                <div class="fill ${cls}" style="width:${mainPct}%"></div>
                ${tempPct > 0 ? `<div class="fill temp" style="width:${tempPct}%"></div>` : ''}
            </div>
        </div>`;
}

function abilityMod(score) {
    return Math.floor(((Number(score) || 10) - 10) / 2);
}

function formatMod(mod) {
    return mod >= 0 ? `+${mod}` : `${mod}`;
}

function toast(message, kind) {
    let host = $('#toast-host');
    if (!host) {
        host = document.createElement('div');
        host.id = 'toast-host';
        host.className = 'toast-host';
        document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = `toast${kind ? ' toast-' + kind : ''}`;
    el.textContent = message;
    host.appendChild(el);
    setTimeout(() => el.remove(), 4200);
}

// ========================================
// Character card -- shared by the hub and the roster
// ========================================

const CHARACTER_CARD_COLUMNS =
    'id, name, player_name, class, subclass, level, armor_class, speed, initiative_bonus, ' +
    'proficiency_bonus, current_hit_points, hit_point_maximum, temporary_hit_points, ' +
    'active_conditions, pending_level_up, ability_scores(dexterity, wisdom)';

function characterCard(character) {
    const scores = character.ability_scores || {};
    const dex = abilityMod(scores.dexterity);
    const wis = abilityMod(scores.wisdom);
    const initiative = character.initiative_bonus !== null && character.initiative_bonus !== undefined
        ? character.initiative_bonus
        : dex;
    const passive = 10 + wis + (character.proficiency_bonus || 2);

    const conditions = Array.isArray(character.active_conditions) ? character.active_conditions : [];
    // Neither status sits beside the name: in a two-up phone grid an inline
    // tag left the name about three characters. A pending level-up is a
    // marker on the card's corner; a condition gets its own line under the
    // name. They no longer compete for one slot, so a card can show both.
    const flag = character.pending_level_up
        ? '<span class="card-flag" role="img" aria-label="Level up due" title="Level up due">!</span>'
        : '';
    const conditionTag = conditions.length
        ? `<div class="card-tags"><span class="tag tag-warning">${escapeHtml(String(conditions[0]).toUpperCase())}</span></div>`
        : '';

    const subclass = character.subclass ? ` ${character.subclass}` : '';
    const meta = `Lv ${character.level || 1} ${character.class || ''}${subclass} · ${character.player_name || ''}`;

    return `
        <a class="character-card${character.pending_level_up ? ' is-flagged' : ''}"
           href="character-sheet.html?id=${encodeURIComponent(character.id)}"
           data-holdable data-id="${escapeHtml(character.id)}"
           style="flex-direction:column;gap:var(--space-10)">
            ${flag}
            <div class="card-top">
                <div class="avatar">${escapeHtml((character.name || '?').charAt(0).toUpperCase())}</div>
                <div style="flex:1;min-width:0">
                    <div class="card-name">${escapeHtml(character.name)}</div>
                    <div class="card-meta">${escapeHtml(meta)}</div>
                    ${conditionTag}
                </div>
            </div>
            ${renderHP(character.current_hit_points, character.hit_point_maximum, character.temporary_hit_points)}
            <div class="chipline">
                <div class="chip">${character.armor_class ?? 10}<span>AC</span></div>
                <div class="chip">${formatMod(initiative)}<span>IN</span></div>
                <div class="chip chip-sp">${character.speed ?? 30}<span>SP</span></div>
                <div class="chip">${passive}<span>PP</span></div>
            </div>
        </a>`;
}

// ========================================
// Icons -- copied verbatim from the v1 pages, per the handoff
// ========================================

const ICONS = {
    overview:   '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
    user:       '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    crown:      '<path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7z"/><path d="M5 20h14"/>',
    monster:    '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
    // The two .ico-ink lines are invisible until hover writes them in.
    book:       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path class="ico-ink" d="M8 13q1-1.5 2 0t2 0 2 0 2 0" pathLength="1" stroke-width="1.5" opacity="0"/><path class="ico-ink" d="M8 17q1-1.5 2 0t2 0 2 0" pathLength="1" stroke-width="1.5" opacity="0"/>',
    search:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    menu:       '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    logout:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    swap:       '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    // Drawn as three panels (left, middle, right) rather than one outline so
    // the side panels can fold out on hover. Looks identical at rest.
    map:        '<polygon points="1 6 8 2 8 18 1 22 1 6"/><polygon points="8 2 16 6 16 22 8 18 8 2"/><polygon points="16 6 23 2 23 18 16 22 16 6"/>',
    sword:      '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/>',
    star:       '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    bag:        '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
    heart:      '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.7 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
    coffee:     '<path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/>',
    // One step of a disclosure: points down, and is turned by CSS when open.
    chevron:    '<polyline points="6 9 12 15 18 9"/>',
    // Three people side by side: a member of the party.
    party:      '<circle cx="12" cy="8" r="3"/><path d="M7 20v-1a5 5 0 0 1 10 0v1"/><circle cx="4.5" cy="10.5" r="2"/><path d="M1 19v-.5a3.5 3.5 0 0 1 3.5-3.5"/><circle cx="19.5" cy="10.5" r="2"/><path d="M23 19v-.5a3.5 3.5 0 0 0-3.5-3.5"/>',
    chevrons:   '<polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/>',
    plus:       '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    back:       '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
    bug:        '<path d="M8 2 9.5 4.5"/><path d="M16 2 14.5 4.5"/><path d="M9 20a5 5 0 0 1-5-5v-3a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v3a5 5 0 0 1-5 5z"/><path d="M4 13H2"/><path d="M22 13h-2"/><path d="m5.5 7-1.7-1.3"/><path d="m18.5 7 1.7-1.3"/><path d="m5.5 19-1.7 1.3"/><path d="m18.5 19 1.7 1.3"/>'
};

// The Pixel themes draw every icon on an 8x8 grid instead: filled squares, no
// strokes. Each is one path of whole-cell rectangles (even-odd, so a shape can
// have holes). Both drawings ship in the same <svg> and the theme picks one
// (v2.css hides .ico-px, pixel.css swaps them), so switching theme needs no
// re-render. The pixel set has no hover animation yet.
const PIXEL_ICONS = {
    home:     'M1 2h1v1h1V2h2v1h1V2h1v5H5V5H3v2H1z',
    overview: 'M1 5h2v2H1zM3 3h2v4H3zM5 1h2v6H5z',
    user:     'M3 1h2v2H3zM2 4h4v1h1v2H1V5h1z',
    crown:    'M0 2h1v2h2V1h2v3h2V2h1v5H0z',
    monster:  'M2 1h4v1h1v3H6v2H5V6H4v1H3V6H2V5H1V2h1zM2 3h1v1H2zM5 3h1v1H5z',
    book:     'M1 1h4v1h1v1h1v4H1zM2 3h3v1H2zM2 5h4v1H2z',
    search:   'M2 1h3v1h1v3H5v1H2V5H1V2h1zM2 2v3h3V2zM5 5h1v1h1v1H6V6H5z',
    menu:     'M1 2h6v1H1zM1 4h6v1H1zM1 6h6v1H1z',
    logout:   'M1 1h3v1H2v4h2v1H1zM3 3h2V2h1v1h1v2H6v1H5V5H3z',
    swap:     'M1 2h4V1h1v1h1v1H6v1H5V3H1zM7 5H3V4H2v1H1v1h1v1h1V6h4z',
    map:      'M1 1h6v6H1zM2 2h4v1H2zM2 4h2v1H2zM5 4h1v2H5z',
    sword:    'M6 1h1v1H6zM5 2h1v1H5zM4 3h1v1H4zM3 4h1v1H3zM1 3h1v1H1zM2 4h1v1H2zM3 5h1v1H3zM4 6h1v1H4zM1 6h1v1H1z',
    star:     'M3 0h2v2h3v2H7v1H6v2H5V6H3v1H2V5H1V4H0V2h3z',
    bag:      'M2 1h4v2h1v4H1V3h1zM3 2v1h2V2z',
    heart:    'M1 1h2v1h2V1h2v1h1v2H7v1H6v1H5v1H3V6H2V5H1V4H0V2h1z',
    coffee:   'M1 3h5v1h1v2H6v1H1zM2 1h1v1H2zM4 1h1v1H4z',
    chevron:  'M1 2h1v2H1zM2 3h1v2H2zM3 4h2v2H3zM5 3h1v2H5zM6 2h1v2H6z',
    party:    'M3 1h2v2H3zM2 4h4v3H2zM0 3h1v1H0zM0 5h1v2H0zM7 3h1v1H7zM7 5h1v2H7z',
    chevrons: 'M3 1h1v2H3zM2 2h1v2H2zM1 3h1v2H1zM2 4h1v2H2zM3 5h1v2H3zM6 1h1v2H6zM5 2h1v2H5zM4 3h1v2H4zM5 4h1v2H5zM6 5h1v2H6z',
    bug:      'M2 2h4v5H2zM1 0h1v1H1zM6 0h1v1H6zM2 1h1v1H2zM5 1h1v1H5zM0 3h1v1H0zM7 3h1v1H7zM1 4h1v1H1zM6 4h1v1H6zM0 6h1v1H0zM7 6h1v1H7z',
    plus:     'M3 1h2v2h2v2H5v2H3V5H1V3h2z',
    back:     'M1 3h1v2H1zM2 2h1v4H2zM3 1h1v6H3zM4 3h3v2H4z'
};

// A name that is one drawing in Ember and its own in Pixel. The nav's Overview
// is the bars in Ember -- the same icon as the sheet's Stats tab -- and a keep
// in Pixel, so it is asked for as 'home' and falls back to 'overview' here.
const ICON_ALIAS = { home: 'overview' };

function icon(name, size) {
    const s = size || 16;
    const line = ICON_ALIAS[name] || name;
    const px = PIXEL_ICONS[name] || PIXEL_ICONS[line];
    // .ico-<name> and the inner <g> are hooks for the hover animations in
    // v2.css; the <g> carries whole-icon motion so it never fights a
    // transform a page puts on the <svg> itself (e.g. the collapse flip).
    // .ico-lg tells Pixel which of its two sizes to use: 8 cells at 2px or 3px.
    return `<svg class="ico ico-${line}${s >= 20 ? ' ico-lg' : ''}" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="ico-g">${ICONS[line] || ''}</g>${px ? `<g class="ico-px" transform="scale(3)" fill="currentColor" stroke="none" fill-rule="evenodd"><path d="${px}"/></g>` : ''}</svg>`;
}

// ========================================
// Navigation
// ========================================

// `pending` marks a destination that has not been built yet. It renders as a
// disabled row rather than a link, so the shell never points at a 404 and the
// nav still shows the shape of the finished app.
const NAV = [
    { id: 'overview',   label: 'Overview',   href: 'index.html',           icon: 'home' },
    { id: 'characters', label: 'Characters', href: 'characters.html',      icon: 'user' },
    { id: 'campaigns',  label: 'Campaigns',  href: 'campaigns.html',       icon: 'map' },
    { id: 'encounters', label: 'Encounters', href: 'monster-tracker.html', icon: 'monster' },
    { id: 'compendium', label: 'Compendium', href: 'compendium.html',      icon: 'search' },
    { id: 'dm',         label: 'DM panel',   href: 'dm-panel.html',        icon: 'crown',   dmOnly: true }
];

function visibleNav() {
    return NAV.filter(item => !item.dmOnly || isDM);
}

function navItems(activeId, counts) {
    return visibleNav().map(item => {
        const count = counts && counts[item.id];
        const badge = count === undefined || count === null
            ? ''
            : `<span class="mono nav-count">${escapeHtml(count)}</span>`;

        if (item.pending) {
            return `<a class="is-pending" aria-disabled="true" title="Not built yet">${icon(item.icon)}<span class="nav-label">${escapeHtml(item.label)}</span>${badge || '<span class="nav-soon">soon</span>'}</a>`;
        }
        return `<a href="${item.href}" class="${item.id === activeId ? 'is-active' : ''}" data-label="${escapeHtml(item.label)}">${icon(item.icon)}<span class="nav-label">${escapeHtml(item.label)}</span>${badge}</a>`;
    }).join('');
}

// ========================================
// Support
//
// One entry, two things behind it: the tip jar the classic version carried,
// and a way to report a bug or send an idea.
//
// The coffee link is a real anchor rather than a button calling window.open,
// because the menu closes before an action runs and a popup opened outside
// the click's gesture is blocked by default in several browsers.
// ========================================

const COFFEE_URL = 'https://buymeacoffee.com/pwtf';

const FEEDBACK_KINDS = [
    { value: 'bug',   label: 'Something is broken' },
    { value: 'idea',  label: 'An idea or request' },
    { value: 'other', label: 'Something else' }
];

function openSupport() {
    openPanel({
        title: 'Support',
        body: `
            <div class="card-menu">
                <a class="card-menu-item" href="${COFFEE_URL}" target="_blank" rel="noopener noreferrer">
                    <span class="label">Buy me a coffee ☕</span>
                    <span class="hint">TAPHOU5E is free and has no ads. A coffee keeps it that way.</span>
                </a>
                <button class="card-menu-item" type="button" id="support-feedback">
                    <span class="label">Report a bug or send an idea</span>
                    <span class="hint">Goes straight to the person who builds this.</span>
                </button>
            </div>`,
        onMount: host => {
            $('#support-feedback', host).addEventListener('click', () => {
                closeModal();
                setTimeout(openFeedback, 0);
            });
        }
    });
}

// What travels with a report, beyond what was typed. Said plainly on the form
// rather than collected quietly -- it is the difference between a bug being
// reproducible and not, but nobody should have to guess that it is going.
function feedbackContext() {
    return {
        game_world_id: (session && session.gameWorldId) || null,
        world_name:    (session && session.gameWorldName) || null,
        role:          session ? (session.role === 'dm' ? 'dm' : 'player') : null,
        page:          location.pathname.split('/').pop() || 'index.html',
        user_agent:    (navigator.userAgent || '').slice(0, 500),
        viewport:      `${window.innerWidth}x${window.innerHeight}`,
        app_version:   'v2'
    };
}

function openFeedback() {
    const context = feedbackContext();
    const where = context.world_name
        ? `${context.world_name} · ${context.role === 'dm' ? 'DM' : 'player'} · ${context.page}`
        : context.page;

    openModal({
        title: 'Report a bug or send an idea',
        prefix: `<p class="hint" style="margin-bottom:var(--space-12)">
                    Sent with this report so a bug can be reproduced:
                    <b>${escapeHtml(where)}</b>, your screen size and your browser.
                    Nothing from your characters or campaign is included.
                 </p>`,
        fields: [
            { name: 'kind', label: 'What is this?', type: 'select', value: 'bug',
              options: FEEDBACK_KINDS },
            { name: 'message', label: 'What happened?', type: 'textarea', rows: 6, required: true,
              placeholder: 'What you did, what happened, and what you expected instead.' },
            { name: 'contact', label: 'How to reach you', type: 'text',
              placeholder: 'Optional',
              hint: 'Only if you are happy to be asked a follow-up. A name, an email or a Discord handle — whatever suits.' }
        ],
        submitLabel: 'Send',
        onSubmit: async values => {
            const { error } = await db.from('feedback').insert({
                kind: values.kind,
                message: values.message,
                contact: values.contact || null,
                ...context
            });
            if (error) throw new Error(error.message);
            toast('Thanks — that went through.', 'success');
        }
    });
}

// The desktop sidebar folds down to the same icon rail the character sheet
// uses. The choice belongs to the device rather than the page: every page
// rebuilds the shell, and each one reads it back here.
const SIDEBAR_KEY = 'taphou5e-sidebar';

function sidebarCollapsed() {
    try { return localStorage.getItem(SIDEBAR_KEY) === 'collapsed'; } catch (e) { return false; }
}

// Collapsed, the labels are hidden, so each row names itself through its
// title -- which is also what a screen reader falls back to.
function applySidebarState(aside, collapsed) {
    aside.classList.toggle('is-collapsed', collapsed);
    $$('[data-label]', aside).forEach(el => {
        if (collapsed) el.title = el.dataset.label;
        else el.removeAttribute('title');
    });
    const toggle = $('#sb-collapse', aside);
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    toggle.title = collapsed ? 'Expand sidebar' : '';
}

function renderSidebar(activeId, counts) {
    const worldName = (session && session.gameWorldName) || 'Unknown world';
    return `
        <aside class="sidebar${sidebarCollapsed() ? ' is-collapsed' : ''}">
            <div class="sidebar-brand">
                <div class="brand"><img src="../taphou5e.png" alt="" class="brand-logo"><span class="brand-word">TAPHOU5E</span></div>
                <div class="world-row">
                    <span class="world-dot"></span>
                    <span class="world-name">${escapeHtml(worldName)}</span>
                    <span class="mono role-pill">${isDM ? 'DM' : 'PLAYER'}</span>
                </div>
            </div>
            <nav class="sidebar-nav">${navItems(activeId, counts)}</nav>
            <div class="sidebar-foot">
                <button class="side-menu-item" id="sb-collapse" type="button" aria-expanded="true">${icon('chevrons', 16)}<span class="nav-label">Collapse</span></button>
                <div class="segmented theme-seg" style="font-size:var(--fs-10)">
                    <button data-theme-option="pixel" onclick="setTheme('pixel')">Pixel</button>
                    <button data-theme-option="pixel-dark" onclick="setTheme('pixel-dark')">Pixel dark</button>
                    <button data-theme-option="dark" onclick="setTheme('dark')">Dark</button>
                    <button data-theme-option="light" onclick="setTheme('light')">Light</button>
                    <button data-theme-option="system" onclick="setTheme('system')">System</button>
                </div>
                <!-- These lived only in the mobile drawer, which is hidden
                     above the breakpoint -- so a desktop had no way out. -->
                <a class="side-menu-item" id="sb-support" data-label="Support">${icon('heart', 16)}<span class="nav-label">Support</span></a>
                <a class="side-menu-item" id="sb-classic" data-label="Switch to classic">${icon('swap', 16)}<span class="nav-label">Switch to classic</span></a>
                <a class="side-menu-item side-menu-item-danger" id="sb-logout" data-label="Logout">${icon('logout', 16)}<span class="nav-label">Logout</span></a>
            </div>
        </aside>`;
}

function renderHeader(title, sub) {
    return `
        <header class="header">
            <button class="icon-btn" id="menu-btn" aria-label="Open menu">${icon('menu', 19)}</button>
            <div style="flex:1;min-width:0">
                <div class="header-title">${escapeHtml(title)}</div>
                <div class="header-sub">${escapeHtml(sub || '')}</div>
            </div>
        </header>`;
}

function renderSideMenu(activeId) {
    const worldName = (session && session.gameWorldName) || 'Unknown world';
    const items = visibleNav().map(item => {
        if (item.pending) {
            return `<a class="side-menu-item is-pending" aria-disabled="true">${icon(item.icon, 18)}${escapeHtml(item.label)}<span class="nav-soon">soon</span></a>`;
        }
        return `<a class="side-menu-item ${item.id === activeId ? 'is-active' : ''}" href="${item.href}">${icon(item.icon, 18)}${escapeHtml(item.label)}</a>`;
    }).join('');

    return `
        <div id="side-menu-overlay" class="side-menu-overlay">
            <div class="side-menu">
                <div class="side-menu-header">
                    <div class="brand"><img src="../taphou5e.png" alt="" class="brand-logo">TAPHOU5E</div>
                    <div class="world-row">
                        <span class="world-dot"></span>
                        <span class="world-name">${escapeHtml(worldName)}</span>
                        <span class="mono role-pill">${isDM ? 'DM' : 'PLAYER'}</span>
                    </div>
                </div>
                <nav style="padding:var(--space-12) 0;flex:1;overflow:auto">
                    ${items}
                    <div class="side-menu-divider"></div>
                    <a class="side-menu-item" id="sm-support">${icon('heart', 18)}Support</a>
                    <a class="side-menu-item" id="sm-classic">${icon('swap', 18)}Switch to classic</a>
                    <a class="side-menu-item side-menu-item-danger" id="sm-logout">${icon('logout', 18)}Logout</a>
                </nav>
                <div class="theme-switch">
                    <span class="eyebrow">Appearance</span>
                    <div class="segmented theme-seg">
                        <button data-theme-option="pixel" onclick="setTheme('pixel')">Pixel</button>
                        <button data-theme-option="pixel-dark" onclick="setTheme('pixel-dark')">Pixel dark</button>
                        <button data-theme-option="dark" onclick="setTheme('dark')">Dark</button>
                        <button data-theme-option="light" onclick="setTheme('light')">Light</button>
                        <button data-theme-option="system" onclick="setTheme('system')">System</button>
                    </div>
                </div>
            </div>
        </div>`;
}

// The icon-only rail the character sheet uses above the breakpoint. Built from
// NAV like the sidebar and drawer: a hand-written copy here once went on
// calling Encounters and Compendium unbuilt long after both shipped, and never
// learned about Campaigns or the DM panel.
function renderRail(activeId) {
    const items = visibleNav().map(item => {
        if (item.pending) {
            return `<span class="icon-btn is-pending" title="${escapeHtml(item.label)} — not built yet">${icon(item.icon, 16)}</span>`;
        }
        return `<a class="icon-btn${item.id === activeId ? ' is-current' : ''}" href="${item.href}"
                   title="${escapeHtml(item.label)}" aria-label="${escapeHtml(item.label)}">${icon(item.icon, 16)}</a>`;
    }).join('');

    return `
        <aside class="rail">
            <div class="rail-brand">T5</div>
            ${items}
        </aside>`;
}

function wireSideMenu() {
    const signOut = () => {
        clearSession();
        window.location.href = 'login.html';
    };

    // The sidebar is always present above the breakpoint, whether or not the
    // drawer exists, so its handlers are wired before the early return.
    $('#sb-support')?.addEventListener('click', openSupport);
    $('#sb-classic')?.addEventListener('click', switchToClassic);
    $('#sb-logout')?.addEventListener('click', signOut);

    const aside = $('.sidebar');
    if (aside) {
        applySidebarState(aside, sidebarCollapsed());
        $('#sb-collapse').addEventListener('click', () => {
            const collapsed = !aside.classList.contains('is-collapsed');
            try {
                if (collapsed) localStorage.setItem(SIDEBAR_KEY, 'collapsed');
                else localStorage.removeItem(SIDEBAR_KEY);
            } catch (e) { /* private mode: it still folds, it just won't be remembered */ }
            applySidebarState(aside, collapsed);
        });
    }

    const overlay = $('#side-menu-overlay');
    if (!overlay) return;

    const open = () => { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; };
    const close = () => { overlay.classList.remove('open'); document.body.style.overflow = ''; };

    $('#menu-btn')?.addEventListener('click', open);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    // The drawer closes first, or the panel opens behind the overlay.
    $('#sm-support')?.addEventListener('click', () => { close(); openSupport(); });
    $('#sm-classic')?.addEventListener('click', switchToClassic);
    $('#sm-logout')?.addEventListener('click', signOut);
}

// Page actions.
//
// The topbar is desktop-only, so anything rendered there alone is unreachable
// on a phone -- which is how "New campaign" went missing below 900px. Actions
// are declared once and rendered twice: as topbar buttons above the breakpoint,
// and as a floating button that flips up a menu below it.
//
// actions: [{ label, onclick?, href?, primary? }]
// Above three, a row of buttons stops reading as a toolbar and starts reading
// as clutter -- the tracker had ten. Past that the topbar collapses into the
// same + menu the phone uses. A threshold rather than a per-page flag, so
// adding an eleventh action cannot bring the problem back.
const ACTION_CROWD_LIMIT = 3;

function renderActions(actions) {
    if (!actions || !actions.length) return { topbar: '', fab: '', compact: false };

    const attrs = a => a.href
        ? `href="${a.href}"` : `onclick="${a.onclick}"`;
    const tag = a => a.href ? 'a' : 'button';
    const compact = actions.length > ACTION_CROWD_LIMIT;

    const topbar = actions.map(a =>
        `<${tag(a)} class="btn ${a.primary ? 'btn-accent' : ''}" ${attrs(a)}>${escapeHtml(a.label)}</${tag(a)}>`
    ).join('');

    const fab = `
        <div class="fab-wrap${compact ? ' is-compact' : ''}" id="fab-wrap">
            <div class="fab-menu" id="fab-menu">
                ${actions.map(a =>
                    `<${tag(a)} class="fab-item ${a.primary ? 'is-primary' : ''}" ${attrs(a)}>${escapeHtml(a.label)}</${tag(a)}>`
                ).join('')}
            </div>
            <button class="fab" id="fab-toggle" aria-expanded="false" aria-label="Actions">
                ${icon('plus', 22)}
            </button>
        </div>`;

    return { topbar, fab, compact };
}

function wireFab() {
    const wrap = $('#fab-wrap');
    if (!wrap) return;
    const toggle = $('#fab-toggle');
    const close = () => { wrap.classList.remove('open'); toggle.setAttribute('aria-expanded', 'false'); };

    toggle.addEventListener('click', e => {
        e.stopPropagation();
        const open = wrap.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Any action closes the menu, and so does tapping away from it.
    $$('.fab-item', wrap).forEach(item => item.addEventListener('click', close));
    document.addEventListener('click', e => { if (!wrap.contains(e.target)) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

// Builds the whole chrome for a page: sidebar, mobile header, drawer, topbar.
function renderShell(options) {
    const { active, title, sub, topbarExtra, counts, actions } = options;
    const { topbar, fab, compact } = renderActions(actions);
    document.body.innerHTML = `
        <div class="app-shell">
            ${renderSidebar(active, counts)}
            <div class="app-main">
                ${renderHeader(title, sub)}
                <div class="topbar">
                    <h1>${escapeHtml(title)}</h1>
                    <div class="spacer">
                        <div class="topbar-actions${compact ? ' is-collapsed' : ''}">${topbar}</div>
                        ${topbarExtra || ''}
                    </div>
                </div>
                <div class="main-content" id="main-content"></div>
            </div>
        </div>
        ${fab}
        ${renderSideMenu(active)}`;
    wireSideMenu();
    wireFab();
    if (typeof window.markThemeButtons === 'function') window.markThemeButtons();
    return $('#main-content');
}

// ========================================
// Number fields select themselves
//
// Tapping a pre-filled number field puts a caret where the finger landed and
// leaves the value in place, so typing appends to it: 250 into a gold field
// showing 137 gives 137250, and 12 into a level showing 1 gives 112. Nobody
// taps a number field meaning to splice digits into the middle of it -- they
// mean to replace it.
//
// Scoped to numbers on purpose. Selecting a name or a note on focus would
// destroy someone's text the moment they tapped in to fix one word.
// ========================================

document.addEventListener('focusin', event => {
    const el = event.target;
    if (!el || el.tagName !== 'INPUT' || el.type !== 'number') return;
    if (el.readOnly || el.disabled || el.value === '') return;
    // Synchronously, not on a timer. A deferred select can land AFTER the
    // first keystroke, which selects the character just typed and lets the
    // second one replace it -- typing 12 gives 2.
    try { el.select(); } catch (e) { /* not selectable */ }
});

// ========================================
// Press-and-hold card menus
//
// Editing and deleting used to live only in a topbar or a row of small
// buttons. On a phone the row crowds the card it belongs to, so instead the
// card itself is the control: hold a finger on it, or right-click on a
// desktop, and the actions for that one thing come up.
//
// Three things make or break the gesture:
//   - a hold that survives a scroll is a trap, so any real movement cancels it
//   - the browser fires a click after the touch ends, which would open the
//     card behind the menu, so the next click is swallowed
//   - iOS shows its own text-selection callout on a long press, which has to
//     be suppressed on the elements that use this
// ========================================

const HOLD_MS = 450;
const HOLD_SLOP_PX = 10;

function openCardMenu(title, actions) {
    const usable = (actions || []).filter(Boolean);
    if (!usable.length) return;

    openPanel({
        title,
        body: `<div class="card-menu">${usable.map((a, i) =>
            `<button class="card-menu-item${a.danger ? ' is-danger' : ''}" data-card-action="${i}">
                <span class="label">${escapeHtml(a.label)}</span>
                ${a.hint ? `<span class="hint">${escapeHtml(a.hint)}</span>` : ''}
            </button>`).join('')}</div>`,
        onMount: host => {
            $$('[data-card-action]', host).forEach(button => {
                button.addEventListener('click', () => {
                    const action = usable[Number(button.dataset.cardAction)];
                    closeModal();
                    // Let the dialog finish closing before the action opens
                    // its own, otherwise the second one replaces the first
                    // mid-teardown and the page is left scroll-locked.
                    setTimeout(() => action.run(), 0);
                });
            });
        }
    });
}

// Delegated from a container, so a redraw never needs to re-bind anything.
// `resolve` receives the card element and returns { title, actions } or null.
function wireCardMenus(containerSelector, cardSelector, resolve) {
    const container = $(containerSelector);
    if (!container || container.dataset.holdWired === cardSelector) return;
    container.dataset.holdWired = cardSelector;

    let timer = null;
    let origin = null;
    let swallowClick = false;

    const cancel = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        origin = null;
    };

    const fire = card => {
        cancel();
        const menu = resolve(card);
        if (!menu) return;
        swallowClick = true;
        // A short buzz is the only feedback that the hold registered; without
        // it people hold, see nothing, and let go early.
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
        openCardMenu(menu.title, menu.actions);
    };

    container.addEventListener('touchstart', e => {
        const card = e.target.closest(cardSelector);
        if (!card || !container.contains(card)) return;
        const touch = e.touches[0];
        origin = { x: touch.clientX, y: touch.clientY };
        timer = setTimeout(() => fire(card), HOLD_MS);
    }, { passive: true });

    container.addEventListener('touchmove', e => {
        if (!timer || !origin) return;
        const touch = e.touches[0];
        // A scroll starts as a touch on a card. Anything past a few pixels is
        // the page moving, not someone holding still.
        if (Math.abs(touch.clientX - origin.x) > HOLD_SLOP_PX ||
            Math.abs(touch.clientY - origin.y) > HOLD_SLOP_PX) cancel();
    }, { passive: true });

    container.addEventListener('touchend', cancel, { passive: true });
    container.addEventListener('touchcancel', cancel, { passive: true });
    container.addEventListener('scroll', cancel, { passive: true });

    // The click the browser synthesises after a long press would follow the
    // card's own link or handler, opening the thing behind the menu.
    container.addEventListener('click', e => {
        if (!swallowClick) return;
        swallowClick = false;
        e.preventDefault();
        e.stopPropagation();
    }, true);

    // The desktop equivalent. Nothing here has a native context menu worth
    // keeping, and a right-click is what someone reaches for anyway.
    container.addEventListener('contextmenu', e => {
        const card = e.target.closest(cardSelector);
        if (!card || !container.contains(card)) return;
        e.preventDefault();
        const menu = resolve(card);
        if (menu) openCardMenu(menu.title, menu.actions);
    });
}

// ========================================
// Explainers -- hold (or hover) for what a thing means
//
// Anything marked `data-explain` shows a small bubble beside it saying what
// it is. On a phone that is a press-and-hold; with a mouse it is a hover.
// `resolve` receives the element and returns { title, text, points, note },
// or null for nothing.
//
// This is the same gesture as the card menus above but a different answer:
// a menu is for things you can DO to a row, a bubble for what a number MEANS.
// An element should carry `data-holdable` or `data-explain`, never both --
// two listeners would both fire on one hold.
//
// Bound once on `document` rather than on a container, because the sheet
// replaces the whole of document.body on every redraw.
// ========================================

const EXPLAIN_HOVER_MS = 350;
const EXPLAIN_MARGIN_PX = 8;

function hideExplainer() {
    const bubble = document.getElementById('explainer');
    if (bubble) bubble.remove();
}

function showExplainer(anchor, entry, viaTouch) {
    hideExplainer();

    const bubble = document.createElement('div');
    bubble.id = 'explainer';
    // A hover bubble lets the pointer through so it can never get in the way
    // of the thing it describes. A touch bubble does not: a tap on it has to
    // land on the bubble, not on the control underneath.
    bubble.className = `explainer${viaTouch ? ' is-touch' : ''}`;
    bubble.setAttribute('role', 'tooltip');
    bubble.innerHTML = `
        <div class="explainer-title">${escapeHtml(entry.title || '')}</div>
        ${entry.text ? `<p>${escapeHtml(entry.text)}</p>` : ''}
        ${entry.points && entry.points.length
            ? `<ul>${entry.points.map(p => `<li>${escapeHtml(p)}</li>`).join('')}</ul>` : ''}
        ${entry.note ? `<p class="explainer-note">${escapeHtml(entry.note)}</p>` : ''}
        <span class="explainer-arrow"></span>`;
    document.body.appendChild(bubble);

    const a = anchor.getBoundingClientRect();
    const b = bubble.getBoundingClientRect();
    const viewW = document.documentElement.clientWidth;
    const viewH = window.innerHeight;
    const gap = 9;

    const centre = a.left + a.width / 2;
    const left = Math.max(EXPLAIN_MARGIN_PX,
        Math.min(centre - b.width / 2, viewW - b.width - EXPLAIN_MARGIN_PX));

    // Above by preference: on a phone the thumb is covering whatever is below.
    const roomAbove = a.top - gap - EXPLAIN_MARGIN_PX;
    const roomBelow = viewH - a.bottom - gap - EXPLAIN_MARGIN_PX;
    const above = b.height <= roomAbove || roomAbove >= roomBelow;
    const top = above
        ? Math.max(EXPLAIN_MARGIN_PX, a.top - gap - b.height)
        : Math.min(viewH - b.height - EXPLAIN_MARGIN_PX, a.bottom + gap);

    bubble.style.left = `${Math.round(left)}px`;
    bubble.style.top = `${Math.round(top)}px`;
    bubble.classList.toggle('is-below', !above);
    bubble.style.setProperty('--arrow-x',
        `${Math.round(Math.max(14, Math.min(centre - left, b.width - 14)))}px`);
}

function wireExplainers(resolve) {
    if (window.__explainersWired) return;
    window.__explainersWired = true;

    const targetOf = e => (e.target instanceof Element ? e.target.closest('[data-explain]') : null);

    let timer = null;
    let origin = null;
    let swallowClick = false;
    let lastTouch = 0;

    const cancel = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        origin = null;
    };

    const fire = el => {
        cancel();
        if (!el.isConnected) return;       // the sheet redrew under the finger
        const entry = resolve(el);
        if (!entry) return;
        swallowClick = true;
        if (navigator.vibrate) { try { navigator.vibrate(12); } catch (e) {} }
        showExplainer(el, entry, true);
    };

    document.addEventListener('touchstart', e => {
        lastTouch = Date.now();
        // Not every browser sends a click after a long press. Left set, the
        // flag would eat the next real tap instead.
        swallowClick = false;
        cancel();

        // A touch anywhere else puts the bubble away. A touch ON the bubble
        // waits for its click: removing it now would let that click fall
        // through to the control underneath.
        if (!(e.target instanceof Element && e.target.closest('#explainer'))) hideExplainer();

        const el = targetOf(e);
        if (!el || e.touches.length !== 1) return;
        const touch = e.touches[0];
        origin = { x: touch.clientX, y: touch.clientY };
        timer = setTimeout(() => fire(el), HOLD_MS);
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (!timer || !origin) return;
        const touch = e.touches[0];
        if (Math.abs(touch.clientX - origin.x) > HOLD_SLOP_PX ||
            Math.abs(touch.clientY - origin.y) > HOLD_SLOP_PX) cancel();
    }, { passive: true });

    document.addEventListener('touchend', cancel, { passive: true });
    document.addEventListener('touchcancel', cancel, { passive: true });

    // Scroll does not bubble, hence the capture. A bubble pinned to the
    // viewport would otherwise be left pointing at nothing.
    document.addEventListener('scroll', () => { cancel(); hideExplainer(); },
        { passive: true, capture: true });

    // Most of what explains itself also does something on a tap -- a
    // condition toggles, a skill flips proficiency. The click that follows a
    // hold must not do that.
    document.addEventListener('click', e => {
        if (swallowClick) {
            swallowClick = false;
            e.preventDefault();
            e.stopPropagation();
            return;
        }
        if (e.target instanceof Element && e.target.closest('#explainer')) hideExplainer();
    }, true);

    // Android raises contextmenu on a long press. There is nothing to offer,
    // and its default can start a text selection under the bubble. A real
    // right-click with a mouse is left alone.
    document.addEventListener('contextmenu', e => {
        if (Date.now() - lastTouch < 1500 && targetOf(e)) e.preventDefault();
    });

    // ---- Mouse: hover ----
    // pointerType keeps this to a real mouse. A tap also produces mouse-ish
    // events, and a bubble on every tap is exactly what the hold avoids.
    let hoverEl = null;
    let hoverTimer = null;

    const endHover = () => {
        if (hoverTimer) clearTimeout(hoverTimer);
        hoverTimer = null;
        hoverEl = null;
        hideExplainer();
    };

    document.addEventListener('pointerover', e => {
        if (e.pointerType !== 'mouse') return;
        const el = targetOf(e);
        if (el === hoverEl) return;
        endHover();
        if (!el) return;
        hoverEl = el;
        hoverTimer = setTimeout(() => {
            hoverTimer = null;
            if (!el.isConnected) return;
            const entry = resolve(el);
            if (entry) showExplainer(el, entry, false);
        }, EXPLAIN_HOVER_MS);
    });

    document.documentElement.addEventListener('pointerleave', e => {
        if (e.pointerType === 'mouse') endHover();
    });
    // Clicking is acting on the thing, not asking about it. Not `mousedown`:
    // lifting a finger after a hold sends one too, and would put away the
    // bubble the hold had just opened.
    document.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse') endHover();
    });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') endHover(); });
}

// A delete that cannot be undone and was reached by a gesture people trigger
// by accident deserves more than a Yes button: the name has to be typed.
function confirmByName({ title, name, message, confirmLabel = 'Delete', onConfirm }) {
    openModal({
        title,
        danger: true,
        submitLabel: confirmLabel,
        fields: [{
            name: 'typed',
            label: `Type ${name} to confirm`,
            required: true,
            placeholder: name,
            hint: message
        }],
        onSubmit: async values => {
            if ((values.typed || '').trim().toLowerCase() !== name.trim().toLowerCase()) {
                throw new Error(`That is not the name. Type ${name} exactly.`);
            }
            await onConfirm();
        }
    });
}

// ========================================
// Modal forms
//
// One small dialog used by every "add" and "edit" action in v2. Fields are
// declared, not hand-written, so each screen stays about its own data.
// ========================================

// Dismiss on a backdrop press, but only when the press STARTED there.
//
// A click fires on the nearest common ancestor of where the press began and
// where it ended. Select a number inside a dialog, drag past its edge, let go
// -- the click lands on the host, and a bare `e.target === host` test throws
// the dialog away mid-edit. Same on a phone: press a field, the keyboard
// opens and the layout shifts under your finger, and the release is outside.
function wireBackdropDismiss(host, dismiss) {
    let startedOnBackdrop = false;
    host.addEventListener('pointerdown', e => { startedOnBackdrop = e.target === host; });
    host.addEventListener('click', e => {
        if (e.target === host && startedOnBackdrop) dismiss();
        startedOnBackdrop = false;
    });
}

function closeModal() {
    const host = $('#modal-host');
    if (host) host.remove();
    document.body.style.overflow = '';
}

// fields: [{ name, label, type: 'text'|'textarea'|'number'|'select'|'checkbox',
//            value, options: [{value,label}], placeholder, required, hint }]
function openModal({ title, fields = [], submitLabel = 'Save', danger = false, onSubmit, prefix = '', onMount }) {
    closeModal();

    const control = f => {
        const common = `id="mf-${f.name}" name="${f.name}"${f.required ? ' required' : ''}`;
        if (f.type === 'textarea') {
            return `<textarea ${common} rows="${f.rows || 4}" placeholder="${escapeHtml(f.placeholder || '')}">${escapeHtml(f.value || '')}</textarea>`;
        }
        if (f.type === 'select') {
            return `<select ${common}>${(f.options || []).map(o =>
                `<option value="${escapeHtml(o.value)}"${o.value === f.value ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
            ).join('')}</select>`;
        }
        if (f.type === 'checkbox') {
            return `<label class="remember-row"><input type="checkbox" ${common}${f.value ? ' checked' : ''}> ${escapeHtml(f.checkboxLabel || '')}</label>`;
        }
        // A number input carries an implicit step="1", so any fractional value
        // fails native validation and the browser refuses to submit -- with no
        // error anywhere the page can see. A challenge rating of 1/4 or an
        // item weighing 0.25 lb hit exactly that. Every number field here is
        // validated in its own onSubmit, so the browser's step check only ever
        // costs us a silent dead end.
        const step = f.type === 'number' ? ` step="${f.step || 'any'}"` : '';
        const bounds = (f.min !== undefined ? ` min="${f.min}"` : '')
                     + (f.max !== undefined ? ` max="${f.max}"` : '');
        return `<input ${common} type="${f.type || 'text'}"${step}${bounds} value="${escapeHtml(f.value ?? '')}" placeholder="${escapeHtml(f.placeholder || '')}">`;
    };

    const body = fields.map(f => {
        // A hidden field carries a value the form needs but nobody edits --
        // an SRD index, say. It gets no label and no row of its own.
        if (f.type === 'hidden') {
            return `<input type="hidden" id="mf-${f.name}" name="${f.name}" value="${escapeHtml(f.value ?? '')}">`;
        }
        return `
        <div class="form-group">
            ${f.type === 'checkbox' ? '' : `<label for="mf-${f.name}">${escapeHtml(f.label)}</label>`}
            ${control(f)}
            ${f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : ''}
        </div>`;
    }).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal-host" class="modal-host">
            <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <div class="modal-head">
                    <h2>${escapeHtml(title)}</h2>
                    <button class="icon-btn" id="modal-close" aria-label="Close">&times;</button>
                </div>
                <form id="modal-form" class="modal-body">
                    ${prefix}
                    ${body}
                    <div class="modal-error error-banner" hidden></div>
                    <div class="modal-actions">
                        <button type="button" class="btn" id="modal-cancel">Cancel</button>
                        <button type="submit" class="btn ${danger ? 'btn-danger' : 'btn-accent'}">${escapeHtml(submitLabel)}</button>
                    </div>
                </form>
            </div>
        </div>`);

    document.body.style.overflow = 'hidden';
    const host = $('#modal-host');
    const form = $('#modal-form');
    const errorBox = $('.modal-error', host);

    const dismiss = () => closeModal();
    $('#modal-close').addEventListener('click', dismiss);
    $('#modal-cancel').addEventListener('click', dismiss);
    wireBackdropDismiss(host, dismiss);
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', esc); }
    });

    // A form with its own header (an SRD search, say) focuses that instead.
    if (onMount) onMount(form);
    const firstField = $('.modal-body input:not([type=hidden]), .modal-body textarea, .modal-body select');
    if (firstField && !form.dataset.focusHandled) firstField.focus();

    form.addEventListener('submit', async e => {
        e.preventDefault();
        errorBox.hidden = true;

        const values = {};
        fields.forEach(f => {
            const el = $(`#mf-${f.name}`);
            if (!el) return;
            if (f.type === 'checkbox') values[f.name] = el.checked;
            else if (f.type === 'number') values[f.name] = el.value === '' ? null : Number(el.value);
            else values[f.name] = el.value.trim();
        });

        const missing = fields.find(f => f.required && !values[f.name]);
        if (missing) {
            errorBox.textContent = `${missing.label} is required.`;
            errorBox.hidden = false;
            return;
        }

        const submit = $('button[type="submit"]', form);
        submit.setAttribute('aria-busy', 'true');
        try {
            await onSubmit(values);
            closeModal();
        } catch (err) {
            // Handled: the message goes in the banner. A rejected DC is not a
            // fault, so this is a warning rather than an error.
            console.warn('Modal submit rejected:', err && err.message);
            errorBox.textContent = (err && err.message) || 'Could not save that. Please try again.';
            errorBox.hidden = false;
            submit.setAttribute('aria-busy', 'false');
        }
    });
}

// An add form with an SRD search on top: pick an entry and the fields fill
// themselves, or ignore it entirely and type your own. Homebrew has to stay
// as easy as the official material -- v1 made the name field itself the
// search box, which meant a custom name and a lookup fought over one input.
function openSrdForm({ title, which, submitLabel = 'Add', filter, toValues, fields, onSubmit }) {
    let index = null;
    let failed = false;

    openModal({
        title,
        submitLabel,
        fields,
        onSubmit,
        prefix: `
            <div class="form-group srd-search">
                <label for="srd-lookup">Search the SRD</label>
                <input id="srd-lookup" type="text" autocomplete="off"
                       placeholder="Start typing, or skip and fill it in yourself">
                <div id="srd-lookup-results" class="srd-results" role="listbox"></div>
            </div>`,
        onMount: async form => {
            const box = $('#srd-lookup', form);
            const out = $('#srd-lookup-results', form);
            box.focus();
            form.dataset.focusHandled = 'yes';

            try {
                index = await srdIndex(which);
            } catch (err) {
                // Offline, or the SRD is down. The form still works: this is
                // a convenience, not the way in.
                failed = true;
                out.innerHTML = '<p class="hint">Search is unavailable. Fill the fields in yourself.</p>';
                return;
            }

            const usable = filter ? index.filter(filter) : index;

            box.addEventListener('input', () => {
                if (failed) return;
                const query = box.value.trim().toLowerCase();
                if (query.length < 2) { out.innerHTML = ''; return; }

                const hits = usable.filter(r => r.name.toLowerCase().includes(query)).slice(0, 8);
                out.innerHTML = hits.length
                    ? hits.map(r => `<button type="button" class="srd-hit" data-index="${escapeHtml(r.index)}"
                            role="option">${escapeHtml(r.name)}</button>`).join('')
                    : '<p class="hint">Nothing matches. Type the fields in yourself.</p>';

                $$('.srd-hit', out).forEach(hit => hit.addEventListener('click', async () => {
                    out.innerHTML = '<p class="hint">Loading&hellip;</p>';
                    let values;
                    try {
                        values = toValues(await srdDetail(which, hit.dataset.index));
                    } catch (err) {
                        out.innerHTML = '<p class="hint">Could not load that entry. Fill the fields in yourself.</p>';
                        return;
                    }
                    // Fill, don't replace: anything already typed by hand is
                    // left alone, since the search is meant to save work.
                    Object.entries(values).forEach(([name, value]) => {
                        const field = $(`#mf-${name}`, form);
                        if (!field || value === null || value === undefined) return;
                        if (field.type === 'checkbox') field.checked = !!value;
                        else field.value = value;
                    });
                    box.value = values.name || box.value;
                    out.innerHTML = '';
                }));
            });
        }
    });
}

// The SRD writes descriptions as an array of paragraphs.
function srdText(value) {
    if (Array.isArray(value)) return value.join('\n\n');
    return value || '';
}

// A destructive confirm, in the same dialog language as the forms above.
function confirmModal({ title, message, confirmLabel = 'Delete', onConfirm }) {
    openModal({
        title,
        fields: [{ name: '_confirm', type: 'static', label: message }],
        submitLabel: confirmLabel,
        danger: true,
        onSubmit: onConfirm
    });
    // 'static' has no control; show the message as prose instead.
    const group = $('#modal-form .form-group');
    if (group) group.innerHTML = `<p class="prose">${escapeHtml(message)}</p>`;
}

// A modal with hand-written contents, for forms the declared-field version
// cannot express -- a type-ahead whose body changes as you search, say.
function openPanel({ title, body, onMount, wide }) {
    closeModal();
    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal-host" class="modal-host">
            <div class="modal${wide ? ' modal-wide' : ''}" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <div class="modal-head">
                    <h2>${escapeHtml(title)}</h2>
                    <button class="icon-btn" id="modal-close" aria-label="Close">&times;</button>
                </div>
                <div class="modal-body" id="panel-body">${body}</div>
            </div>
        </div>`);
    document.body.style.overflow = 'hidden';

    const host = $('#modal-host');
    $('#modal-close').addEventListener('click', closeModal);
    wireBackdropDismiss(host, closeModal);
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { closeModal(); document.removeEventListener('keydown', esc); }
    });
    if (onMount) onMount($('#panel-body'));
}

// Finer than the roster's three tiers, matching the classic tracker's wording.
// The fill colour still uses hpClass, so the bar and the word agree.
function hpStateLabel(current, max) {
    const cur = Number(current) || 0;
    const mx = Number(max) || 0;
    if (cur <= 0) return 'DOWN';
    if (!mx) return 'HEALTHY';
    const ratio = cur / mx;
    if (ratio > 0.75) return 'HEALTHY';
    if (ratio > 0.5) return 'INJURED';
    if (ratio > 0.25) return 'BLOODIED';
    return 'CRITICAL';
}

// ---- Shared SRD access (tracker and compendium both search it) ----
const SRD_API = 'https://www.dnd5eapi.co';
const SRD_CACHE = 'taphou5e-srd-';

function srdCacheGet(key) {
    try {
        const raw = sessionStorage.getItem(SRD_CACHE + key);
        return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
}

function srdCacheSet(key, value) {
    try { sessionStorage.setItem(SRD_CACHE + key, JSON.stringify(value)); } catch (e) { /* ignore */ }
}

async function srdIndex(which) {
    const cached = srdCacheGet(which);
    if (cached) return cached;
    const response = await fetch(`${SRD_API}/api/${which}`);
    if (!response.ok) throw new Error(`SRD returned ${response.status}`);
    const results = (await response.json()).results || [];
    srdCacheSet(which, results);
    return results;
}

async function srdDetail(which, apiIndex) {
    const key = `${which}-${apiIndex}`;
    const cached = srdCacheGet(key);
    if (cached) return cached;
    const response = await fetch(`${SRD_API}/api/${which}/${apiIndex}`);
    if (!response.ok) throw new Error(`SRD returned ${response.status}`);
    const body = await response.json();
    srdCacheSet(key, body);
    return body;
}

// The SRD has shipped armor_class as both a number and an array of
// {type, value}; normalise to an integer.
function srdArmorClass(value) {
    if (Array.isArray(value)) return value.length ? Number(value[0].value) : null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

// Roll hit points from the creature's hit dice, as the classic tracker does,
// rather than using the average. Two goblins in the same fight should not have
// identical hit points.
function rollHitPoints(detail) {
    if (!detail || !detail.hit_dice) {
        return (detail && detail.hit_points) || Math.max(1, Math.floor(Math.random() * 10) + 1);
    }
    const parts = String(detail.hit_dice).match(/(\d+)d(\d+)\s*([+-]\s*\d+)?/);
    if (!parts) return detail.hit_points || 1;

    const count = parseInt(parts[1], 10);
    const die = parseInt(parts[2], 10);
    const bonus = parts[3] ? parseInt(parts[3].replace(/\s/g, ''), 10) : 0;

    let total = 0;
    for (let i = 0; i < count; i++) total += Math.floor(Math.random() * die) + 1;
    total += bonus;

    // The SRD sometimes folds the constitution bonus into hit_dice and
    // sometimes does not; hit_points_roll marks the former.
    if (!detail.hit_points_roll && detail.constitution) {
        total += abilityMod(detail.constitution) * count;
    }
    return Math.max(1, total);
}

// d20 plus the creature's dexterity modifier, as the classic tracker does.
function rollInitiativeFor(detail) {
    const dex = detail && detail.dexterity ? abilityMod(detail.dexterity) : 0;
    return Math.floor(Math.random() * 20) + 1 + dex;
}

// ---- Levelling ----
// 5e experience thresholds, index 0 = level 1. Copied from the classic app so
// both versions agree about when a character levels.
const EXP_THRESHOLDS = [
    0, 300, 900, 2700, 6500, 14000, 23000, 34000, 48000, 64000,
    85000, 100000, 120000, 140000, 165000, 195000, 225000, 265000, 305000, 355000
];

function levelForExp(exp) {
    for (let i = EXP_THRESHOLDS.length - 1; i >= 0; i--) {
        if ((exp || 0) >= EXP_THRESHOLDS[i]) return i + 1;
    }
    return 1;
}

function expForNextLevel(level) {
    return level >= 20 ? null : EXP_THRESHOLDS[level];
}

// The least experience a character of `level` can have. 5e counts experience
// as a running total -- level 2 at 300, level 3 at 900 -- so a character who
// has just reached a level already holds its threshold. One levelled by
// milestone may have nothing recorded at all; they are treated as holding the
// floor, or every grant afterwards would make them earn those levels again.
function expFloor(level) {
    return EXP_THRESHOLDS[Math.min(20, Math.max(1, level || 1)) - 1];
}

// Where a character stands within their level, which is what a progress bar
// should show. Measured against the total instead, someone who had just
// reached level 2 read as 300 / 900 -- a third of the way to level 3, when
// they had made no progress at all.
function expProgress(level, exp) {
    const lvl = Math.min(20, Math.max(1, level || 1));
    const total = Math.max(exp || 0, expFloor(lvl));
    const next = expForNextLevel(lvl);
    if (!next) return { total, next: null, into: null, span: null, pct: 100 };
    const floor = expFloor(lvl);
    const span = next - floor;
    const into = total - floor;
    return { total, next, into, span, pct: Math.min(100, (into / span) * 100) };
}

// The classic level-up wizard reads the character's level from before the
// grant out of localStorage, so it knows the range to walk; this writes the
// same key so a level granted here can still be taken there. It is per-device,
// so it only helps when the same browser grants and then runs the wizard.
// v2's own wizard does not depend on it: it reads the last completed level
// from the character's hit dice, which every device can see (levelup.js).
function rememberPreGrantLevel(character) {
    if (character.pending_level_up) return;   // an earlier grant already set it
    try {
        localStorage.setItem(`preGrantLevel_${character.id}`, character.level);
    } catch (e) { /* private mode */ }
}
