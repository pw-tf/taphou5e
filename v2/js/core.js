// ========================================
// TAPHOU5E v2 — shared core
//
// Loaded by every v2 page before its own script. Owns the Supabase client,
// the session, the DM token, navigation chrome and a few render helpers.
//
// The v1 app at the repo root is frozen and does not load this file.
// ========================================

const SUPABASE_URL = 'https://zlsguyiwwwbyoqxdewsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpsc2d1eWl3d3dieW9xeGRld3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzU0NzMsImV4cCI6MjA4NDIxMTQ3M30.LNcqEHFvGobozl5oPNs_GYpduYBoNmM7n6IhbuInfb4';

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

// ========================================
// Supabase client
//
// The DM token rides as a request header. Postgres reads it via
// request.headers in the row level security policies, which is what separates
// a DM from a player when both share the same anon key. A player simply has no
// token, so the policies fall through to the revealed-rows-only branch.
// ========================================

const headers = {};
if (session && session.dmToken) headers['x-dm-token'] = session.dmToken;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers }
});

// Pages other than login call this first.
function requireSession() {
    if (!session) {
        window.location.replace('login.html');
        return false;
    }
    // v1 expires sessions after 7 days; match that so the two agree.
    const week = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - (session.timestamp || 0) > week) {
        clearSession();
        window.location.replace('login.html');
        return false;
    }
    return true;
}

// Server-side DM tokens last 12 hours. There is no way to probe validity by
// reading a table: a player without a token gets an empty result rather than an
// error, which is indistinguishable from a DM whose world simply has no rows.
// So track it client-side from the issue time. The server stays authoritative;
// this only decides when to warn someone that their private data has gone quiet.
const DM_TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

function dmTokenExpired() {
    if (!isDM) return false;
    if (!session.dmToken) return true;
    const issued = session.dmTokenIssued || session.timestamp || 0;
    return Date.now() - issued > DM_TOKEN_TTL_MS;
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

function hpStateLabel(current, max) {
    const cls = hpClass(current, max);
    if (current <= 0) return 'DOWN';
    if (cls === 'high') return 'HEALTHY';
    if (cls === 'mid') return 'WOUNDED';
    return 'CRITICAL';
}

// The single HP component from the design handoff. One fixed-height rail
// everywhere -- never one element per hit point, which is what the v1 tracker
// does today (a 300 HP creature renders 300 divs).
function renderHP(current, max, temp, variant) {
    const cur = Number(current) || 0;
    const mx = Number(max) || 0;
    const tmp = Number(temp) || 0;
    const cls = hpClass(cur, mx);
    const mainPct = mx > 0 ? Math.max(0, Math.min(100, (cur / mx) * 100)) : 0;
    const tempPct = mx > 0 ? Math.max(0, Math.min(100 - mainPct, (tmp / mx) * 100)) : 0;
    const barClass = variant ? `hp-bar ${variant}` : 'hp-bar';

    return `
        <div class="hp">
            <div class="hp-readout">
                <span class="hp-value"><b>${cur}</b><span class="max">/${mx}</span>${
                    tmp > 0 ? `<span class="temp">+${tmp}</span>` : ''
                }</span>
                <span class="hp-state state-${cls}">${hpStateLabel(cur, mx)}</span>
            </div>
            <div class="${barClass}">
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
    let tag = '';
    if (character.pending_level_up) {
        tag = '<span class="tag tag-accent">LEVEL UP</span>';
    } else if (conditions.length) {
        tag = `<span class="tag tag-warning">${escapeHtml(conditions[0].toUpperCase())}</span>`;
    }

    const subclass = character.subclass ? ` ${character.subclass}` : '';
    const meta = `Lv ${character.level || 1} ${character.class || ''}${subclass} · ${character.player_name || ''}`;

    return `
        <a class="character-card${character.pending_level_up ? ' is-flagged' : ''}"
           href="character-sheet.html?id=${encodeURIComponent(character.id)}"
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
        </a>`;
}

// ========================================
// Icons -- copied verbatim from the v1 pages, per the handoff
// ========================================

const ICONS = {
    overview:   '<path d="M12 20V10"/><path d="M18 20V4"/><path d="M6 20v-4"/>',
    user:       '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
    monster:    '<path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/>',
    book:       '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>',
    search:     '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    menu:       '<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>',
    logout:     '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
    swap:       '<polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/>',
    map:        '<polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>',
    sword:      '<polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/><line x1="16" y1="16" x2="20" y2="20"/><line x1="19" y1="21" x2="21" y2="19"/>',
    star:       '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
    bag:        '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>'
};

function icon(name, size) {
    const s = size || 16;
    return `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ''}</svg>`;
}

// ========================================
// Navigation
// ========================================

// `pending` marks a destination that has not been built yet. It renders as a
// disabled row rather than a link, so the shell never points at a 404 and the
// nav still shows the shape of the finished app.
const NAV = [
    { id: 'overview',   label: 'Overview',   href: 'index.html',           icon: 'overview' },
    { id: 'characters', label: 'Characters', href: 'characters.html',      icon: 'user' },
    { id: 'campaigns',  label: 'Campaigns',  href: 'campaigns.html',       icon: 'map' },
    { id: 'encounters', label: 'Encounters', href: 'monster-tracker.html', icon: 'monster' },
    { id: 'compendium', label: 'Compendium', href: 'compendium.html',      icon: 'search' },
    { id: 'dm',         label: 'DM panel',   href: 'dm-panel.html',        icon: 'user',    pending: true, dmOnly: true }
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
            return `<a class="is-pending" aria-disabled="true" title="Not built yet">${icon(item.icon)}${escapeHtml(item.label)}${badge || '<span class="nav-soon">soon</span>'}</a>`;
        }
        return `<a href="${item.href}" class="${item.id === activeId ? 'is-active' : ''}">${icon(item.icon)}${escapeHtml(item.label)}${badge}</a>`;
    }).join('');
}

function renderSidebar(activeId, counts) {
    const worldName = (session && session.gameWorldName) || 'Unknown world';
    return `
        <aside class="sidebar">
            <div class="sidebar-brand">
                <div class="brand">TAPHOU5E</div>
                <div class="world-row">
                    <span class="world-dot"></span>
                    <span class="world-name">${escapeHtml(worldName)}</span>
                    <span class="mono role-pill">${isDM ? 'DM' : 'PLAYER'}</span>
                </div>
            </div>
            <nav class="sidebar-nav">${navItems(activeId, counts)}</nav>
            <div class="sidebar-foot">
                <div class="segmented" style="font-size:var(--fs-10)">
                    <button data-theme-option="dark" onclick="setTheme('dark')">Dark</button>
                    <button data-theme-option="light" onclick="setTheme('light')">Light</button>
                    <button data-theme-option="system" onclick="setTheme('system')">System</button>
                </div>
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
                    <div class="brand">TAPHOU5E</div>
                    <div class="world-row">
                        <span class="world-dot"></span>
                        <span class="world-name">${escapeHtml(worldName)}</span>
                        <span class="mono role-pill">${isDM ? 'DM' : 'PLAYER'}</span>
                    </div>
                </div>
                <nav style="padding:var(--space-12) 0;flex:1;overflow:auto">
                    ${items}
                    <div class="side-menu-divider"></div>
                    <a class="side-menu-item" id="sm-classic">${icon('swap', 18)}Switch to classic</a>
                    <a class="side-menu-item side-menu-item-danger" id="sm-logout">${icon('logout', 18)}Logout</a>
                </nav>
                <div class="theme-switch">
                    <span class="eyebrow">Appearance</span>
                    <div class="segmented">
                        <button data-theme-option="dark" onclick="setTheme('dark')">Dark</button>
                        <button data-theme-option="light" onclick="setTheme('light')">Light</button>
                        <button data-theme-option="system" onclick="setTheme('system')">System</button>
                    </div>
                </div>
            </div>
        </div>`;
}

function wireSideMenu() {
    const overlay = $('#side-menu-overlay');
    if (!overlay) return;

    const open = () => { overlay.classList.add('open'); document.body.style.overflow = 'hidden'; };
    const close = () => { overlay.classList.remove('open'); document.body.style.overflow = ''; };

    $('#menu-btn')?.addEventListener('click', open);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) close();
    });

    $('#sm-classic')?.addEventListener('click', switchToClassic);
    $('#sm-logout')?.addEventListener('click', () => {
        clearSession();
        window.location.href = 'login.html';
    });
}

// Builds the whole chrome for a page: sidebar, mobile header, drawer, topbar.
function renderShell(options) {
    const { active, title, sub, topbarExtra, counts } = options;
    document.body.innerHTML = `
        <div class="app-shell">
            ${renderSidebar(active, counts)}
            <div class="app-main">
                ${renderHeader(title, sub)}
                <div class="topbar">
                    <h1>${escapeHtml(title)}</h1>
                    <div class="spacer">${topbarExtra || ''}</div>
                </div>
                <div class="main-content" id="main-content"></div>
            </div>
        </div>
        ${renderSideMenu(active)}`;
    wireSideMenu();
    if (typeof window.markThemeButtons === 'function') window.markThemeButtons();
    return $('#main-content');
}

// ========================================
// Modal forms
//
// One small dialog used by every "add" and "edit" action in v2. Fields are
// declared, not hand-written, so each screen stays about its own data.
// ========================================

function closeModal() {
    const host = $('#modal-host');
    if (host) host.remove();
    document.body.style.overflow = '';
}

// fields: [{ name, label, type: 'text'|'textarea'|'number'|'select'|'checkbox',
//            value, options: [{value,label}], placeholder, required, hint }]
function openModal({ title, fields = [], submitLabel = 'Save', danger = false, onSubmit }) {
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
        return `<input ${common} type="${f.type || 'text'}" value="${escapeHtml(f.value ?? '')}" placeholder="${escapeHtml(f.placeholder || '')}">`;
    };

    const body = fields.map(f => `
        <div class="form-group">
            ${f.type === 'checkbox' ? '' : `<label for="mf-${f.name}">${escapeHtml(f.label)}</label>`}
            ${control(f)}
            ${f.hint ? `<p class="hint">${escapeHtml(f.hint)}</p>` : ''}
        </div>`).join('');

    document.body.insertAdjacentHTML('beforeend', `
        <div id="modal-host" class="modal-host">
            <div class="modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
                <div class="modal-head">
                    <h2>${escapeHtml(title)}</h2>
                    <button class="icon-btn" id="modal-close" aria-label="Close">&times;</button>
                </div>
                <form id="modal-form" class="modal-body">
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
    host.addEventListener('click', e => { if (e.target === host) dismiss(); });
    document.addEventListener('keydown', function esc(e) {
        if (e.key === 'Escape') { dismiss(); document.removeEventListener('keydown', esc); }
    });

    const firstField = $('.modal-body input, .modal-body textarea, .modal-body select');
    if (firstField) firstField.focus();

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
            console.error('Modal submit failed:', err);
            errorBox.textContent = (err && err.message) || 'Could not save that. Please try again.';
            errorBox.hidden = false;
            submit.setAttribute('aria-busy', 'false');
        }
    });
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
