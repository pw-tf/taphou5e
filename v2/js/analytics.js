// ========================================
// TAPHOU5E — analytics dashboard
//
// A global, cross-world owner dashboard. Standalone: it does not load core.js,
// because it has no world, no DM token and no player session -- it signs in
// against Supabase auth instead, exactly as the classic page did.
//
// Two data sources:
//   1. The tables anon can read (game_worlds, characters, and the per-character
//      rows). Read directly, counted here.
//   2. The campaign layer, which is dm_all and therefore invisible to this
//      page. public.analytics_overview() returns COUNTS ONLY for it, to
//      authenticated callers only -- no names, no notes, no secrets.
//
// Charting follows one rule worth stating: nominal bars (classes, races,
// levels, statuses) encode MAGNITUDE, so they take a single hue. Only a
// genuine two- or three-way split is coloured by series, and then it always
// carries a legend and printed values.
// ========================================

const SUPABASE_URL = 'https://zlsguyiwwwbyoqxdewsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpsc2d1eWl3d3dieW9xeGRld3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzU0NzMsImV4cCI6MjA4NDIxMTQ3M30.LNcqEHFvGobozl5oPNs_GYpduYBoNmM7n6IhbuInfb4';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const $ = (s, root = document) => root.querySelector(s);

const SECTIONS = [
    { id: 'overview',   label: 'Overview' },
    { id: 'feedback',   label: 'Feedback' },
    { id: 'worlds',     label: 'Worlds' },
    { id: 'campaigns',  label: 'Campaigns' },
    { id: 'characters', label: 'Characters' },
    { id: 'players',    label: 'Players' },
    { id: 'library',    label: 'Library' }
];

let data = null;                                    // last successful load
let worldSort = { key: 'characters', dir: -1 };     // table sort state
let worldPage = 0;                                  // worlds table, zero-based
let showArchived = false;                           // feedback inbox filter

// 194 worlds in one table is a wall. Ten is a screenful.
const WORLDS_PER_PAGE = 10;

// ========================================
// Helpers
// ========================================

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const num = n => Number(n || 0).toLocaleString();

function pct(part, whole) {
    if (!whole) return '0%';
    return Math.round((part / whole) * 100) + '%';
}

function formatDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(iso) {
    const d = iso ? new Date(iso) : new Date();
    return 'Updated ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Count occurrences of a field into [[label, count], …], biggest first.
function tally(rows, pick, fallback = 'Unknown') {
    const counts = new Map();
    rows.forEach(row => {
        const raw = typeof pick === 'function' ? pick(row) : row[pick];
        const key = (raw == null || String(raw).trim() === '') ? fallback : String(raw).trim();
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

// An object of {key: count} from the RPC, biggest first.
function entriesOf(obj) {
    return Object.entries(obj || {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

const titleCase = s => String(s).replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

// A split bar has three slots. A fourth series is never a made-up fourth
// colour -- the tail folds into "Other", so the percentages still add to 100.
function threeWay(entries) {
    const ranked = entries.map(([k, n]) => ({ label: titleCase(k), value: n }));
    if (ranked.length <= 3) return ranked;
    const rest = ranked.slice(2);
    return ranked.slice(0, 2).concat([{ label: 'Other', value: sum(rest.map(r => r.value)) }]);
}

function sum(values) {
    return values.reduce((total, n) => total + Number(n || 0), 0);
}

// ========================================
// Render helpers
// ========================================

function statTile(label, value, sub, hero) {
    return `
        <div class="an-stat${hero ? ' is-hero' : ''}">
            <div class="value">${escapeHtml(value)}</div>
            <div class="label">${escapeHtml(label)}</div>
            ${sub ? `<div class="sub">${escapeHtml(sub)}</div>` : ''}
        </div>`;
}

function statRow(tiles, extraClass) {
    return `<div class="an-stats${extraClass ? ' ' + extraClass : ''}">${tiles.join('')}</div>`;
}

// One hue. The bar's length is the value; colour carries no information, so
// it must not vary with the value.
function barChart(entries, options = {}) {
    const { limit = 0, showPct = true, label = 'items' } = options;
    if (!entries.length) return `<p class="an-none">No ${escapeHtml(label)} yet.</p>`;

    const shown = limit ? entries.slice(0, limit) : entries;
    const max = Math.max(...entries.map(e => e[1]), 1);
    const total = sum(entries.map(e => e[1]));

    const rows = shown.map(([name, count]) => `
        <div class="an-bar-row" data-tip="${escapeHtml(name)} — ${num(count)} (${pct(count, total)})">
            <span class="an-bar-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span>
            <div class="an-bar-track"><div class="an-bar-fill" style="width: ${(count / max) * 100}%"></div></div>
            <span class="an-bar-value">${num(count)}${showPct ? `<span class="pct">${pct(count, total)}</span>` : ''}</span>
        </div>`).join('');

    const more = limit && entries.length > limit
        ? `<p class="an-none">+ ${entries.length - limit} more</p>` : '';

    return `<div class="an-bars">${rows}</div>${more}`;
}

// Two or three series. Always legended, always with printed values -- on the
// light surface the aqua slot sits below 3:1, so the labels are the relief.
function splitBar(parts) {
    const live = parts.filter(p => p.value > 0);
    const total = sum(parts.map(p => p.value));
    if (!total) return '<p class="an-none">Nothing recorded yet.</p>';

    const segments = live.map((p, i) => `
        <span class="c${i + 1}" style="flex: ${p.value}"
              data-tip="${escapeHtml(p.label)} — ${num(p.value)} (${pct(p.value, total)})"></span>`).join('');

    const legend = live.map((p, i) => `
        <div><i class="c${i + 1}"></i>${escapeHtml(p.label)} <b>${num(p.value)}</b>
             <span class="muted">${pct(p.value, total)}</span></div>`).join('');

    return `<div class="an-split">${segments}</div><div class="an-legend">${legend}</div>`;
}

function progRows(rows) {
    const body = rows.map(([name, done, total]) => `
        <div class="an-prog-row" data-tip="${escapeHtml(name)} — ${num(done)} of ${num(total)}">
            <div class="top">
                <span class="name">${escapeHtml(name)}</span>
                <span class="num">${num(done)} <span>/ ${num(total)}</span></span>
            </div>
            <div class="an-bar-track"><div class="an-bar-fill" style="width: ${total ? (done / total) * 100 : 0}%"></div></div>
        </div>`).join('');
    return `<div class="an-prog">${body}</div>`;
}

function panel(title, body, note, wide) {
    return `
        <section class="an-panel${wide ? ' wide' : ''}">
            <header><h3>${escapeHtml(title)}</h3>${note ? `<span class="note">${escapeHtml(note)}</span>` : ''}</header>
            ${body}
        </section>`;
}

function section(id, title, count, body) {
    return `
        <section class="an-section" id="sec-${id}">
            <h2>${escapeHtml(title)}${count ? ` <span class="count">${escapeHtml(count)}</span>` : ''}</h2>
            ${body}
        </section>`;
}

// ========================================
// Data
// ========================================

async function fetchAll() {
    const headCount = table => db.from(table).select('id', { count: 'exact', head: true });

    const [worlds, characters, spells, weapons, inventory, features, effects,
           slots, details, currency, overview, feedback] = await Promise.all([
        db.from('game_worlds').select('*').order('created_at', { ascending: false }),
        db.from('characters')
            .select('id, name, player_name, race, class, subclass, level, background, alignment, ' +
                    'game_world_id, created_at, updated_at, pending_level_up, inspiration, ' +
                    'hit_point_maximum, armor_class, experience_points')
            .order('created_at', { ascending: false })
            .limit(5000),
        headCount('spells'),
        headCount('weapons'),
        headCount('inventory_items'),
        headCount('features_traits'),
        headCount('character_effects'),
        headCount('spell_slots'),
        headCount('character_details'),
        headCount('currency'),
        // The campaign layer is dm_all: only this counts-only function can see it.
        db.rpc('analytics_overview'),
        // Insert-only for the anon key; readable only with a session, which is
        // why the inbox lives here and nowhere else.
        db.from('feedback')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500)
    ]);

    if (worlds.error) throw worlds.error;
    if (characters.error) throw characters.error;

    return {
        worlds: worlds.data || [],
        characters: characters.data || [],
        content: {
            spells: spells.count, weapons: weapons.count, inventory: inventory.count,
            features: features.count, effects: effects.count, slots: slots.count,
            details: details.count, currency: currency.count
        },
        // A missing function or a refused call must not take the whole page
        // down -- everything above it still renders.
        overview: overview.error ? null : overview.data,
        overviewError: overview.error ? overview.error.message : null,
        feedback: feedback.error ? null : (feedback.data || []),
        feedbackError: feedback.error ? feedback.error.message : null,
        loadedAt: new Date().toISOString()
    };
}

// Per-world rollup: what anon can count, joined to the RPC's campaign counts.
function worldRows(d) {
    const byWorld = new Map();
    d.characters.forEach(c => {
        if (!byWorld.has(c.game_world_id)) byWorld.set(c.game_world_id, []);
        byWorld.get(c.game_world_id).push(c);
    });

    const campaign = new Map();
    (d.overview && d.overview.worlds || []).forEach(w => campaign.set(w.id, w));

    return d.worlds.map(w => {
        const chars = byWorld.get(w.id) || [];
        const c = campaign.get(w.id) || {};
        const levels = chars.map(x => Number(x.level) || 0).filter(Boolean);
        return {
            id: w.id,
            name: w.name || 'Untitled world',
            active: !!w.is_active,
            leveling: w.leveling_mode || 'milestone',
            created: w.created_at,
            characters: chars.length,
            avgLevel: levels.length ? sum(levels) / levels.length : 0,
            maxLevel: levels.length ? Math.max(...levels) : 0,
            campaigns: Number(c.authored_campaigns || 0),
            chapters: Number(c.chapters || 0),
            beats: Number(c.beats || 0),
            checks: Number(c.checks || 0),
            areas: Number(c.areas || 0),
            npcs: Number(c.npcs || 0),
            monsters: Number(c.monsters || 0),
            encounters: Number(c.encounters || 0),
            sessions: Number(c.sessions || 0),
            get material() {
                return this.chapters + this.beats + this.checks + this.areas +
                       this.npcs + this.monsters + this.encounters + this.sessions;
            }
        };
    });
}

// ========================================
// Sections
// ========================================

function renderOverview(d, rows) {
    const chars = d.characters;
    const active = d.worlds.filter(w => w.is_active).length;
    const players = new Set(chars.map(c => (c.player_name || '').toLowerCase().trim()).filter(Boolean)).size;
    const material = sum(rows.map(r => r.material));
    const levels = chars.map(c => Number(c.level) || 0).filter(Boolean);
    const avgLevel = levels.length ? (sum(levels) / levels.length).toFixed(1) : '0';
    const withParty = rows.filter(r => r.characters > 0).length;

    const tiles = statRow([
        statTile('Game worlds', num(d.worlds.length), `${num(active)} active · ${num(d.worlds.length - active)} archived`, true),
        statTile('Characters', num(chars.length), `avg level ${avgLevel}`, true),
        statTile('Players', num(players), `${(chars.length / (players || 1)).toFixed(1)} characters each`, true),
        statTile('Campaign items', num(material), 'chapters, beats, checks, NPCs, encounters', true)
    ]);

    const body = `
        <div class="an-grid">
            ${panel('Worlds in use', splitBar([
                { label: 'With a party', value: withParty },
                { label: 'Empty', value: d.worlds.length - withParty }
            ]), 'a world counts as in use once it has one character')}
            ${panel('Levelling mode', splitBar([
                { label: 'Milestone', value: rows.filter(r => r.leveling !== 'xp').length },
                { label: 'Experience', value: rows.filter(r => r.leveling === 'xp').length }
            ]))}
        </div>`;

    return section('overview', 'Overview', '', tiles + body);
}

function renderWorlds(d, rows) {
    const active = rows.filter(r => r.active).length;
    const authored = rows.filter(r => r.material > 0).length;
    const parties = rows.filter(r => r.characters > 0);
    const biggest = parties.length ? Math.max(...parties.map(r => r.characters)) : 0;

    const tiles = statRow([
        statTile('Worlds', num(rows.length)),
        statTile('Active', num(active), pct(active, rows.length) + ' of all worlds'),
        statTile('With campaign material', num(authored), pct(authored, rows.length) + ' of all worlds'),
        statTile('With a party', num(parties.length), pct(parties.length, rows.length) + ' of all worlds'),
        statTile('Largest party', num(biggest), 'characters in one world'),
        statTile('Median party', num(median(parties.map(r => r.characters))), 'across worlds with a party')
    ], 'six');

    // Party size is a distribution, so it keeps its natural order.
    const sizes = new Map();
    rows.forEach(r => {
        const key = r.characters >= 6 ? '6+' : String(r.characters);
        sizes.set(key, (sizes.get(key) || 0) + 1);
    });
    const sizeOrder = ['0', '1', '2', '3', '4', '5', '6+']
        .filter(k => sizes.has(k))
        .map(k => [k === '0' ? 'No characters' : k + (k === '1' ? ' character' : ' characters'), sizes.get(k)]);

    const topParties = parties
        .slice().sort((a, b) => b.characters - a.characters)
        .map(r => [r.name, r.characters]);

    const topMaterial = rows.filter(r => r.material > 0)
        .slice().sort((a, b) => b.material - a.material)
        .map(r => [r.name, r.material]);

    const charts = `
        <div class="an-grid">
            ${panel('Party size', barChart(sizeOrder, { showPct: true, label: 'worlds' }), 'worlds by number of characters')}
            ${panel('Biggest parties', barChart(topParties, { limit: 10, showPct: false, label: 'parties' }), 'top 10')}
            ${panel('Most built-out worlds', barChart(topMaterial, { limit: 10, showPct: false, label: 'worlds' }),
                    'chapters, beats, checks, NPCs, areas, monsters, encounters and sessions combined')}
            ${panel('Status', splitBar([
                { label: 'Active', value: active },
                { label: 'Archived', value: rows.length - active }
            ]))}
        </div>`;

    return section('worlds', 'Worlds', num(rows.length), tiles + charts + worldsTable(rows));
}

const WORLD_COLUMNS = [
    { key: 'name',       label: 'World',      type: 'text' },
    { key: 'active',     label: 'Status',     type: 'text' },
    { key: 'leveling',   label: 'Levelling',  type: 'text' },
    { key: 'characters', label: 'Party',      type: 'num' },
    { key: 'avgLevel',   label: 'Avg lvl',    type: 'num' },
    { key: 'campaigns',  label: 'Campaigns',  type: 'num' },
    { key: 'chapters',   label: 'Chapters',   type: 'num' },
    { key: 'beats',      label: 'Beats',      type: 'num' },
    { key: 'checks',     label: 'Checks',     type: 'num' },
    { key: 'areas',      label: 'Areas',      type: 'num' },
    { key: 'npcs',       label: 'NPCs',       type: 'num' },
    { key: 'monsters',   label: 'Monsters',   type: 'num' },
    { key: 'encounters', label: 'Encounters', type: 'num' },
    { key: 'created',    label: 'Created',    type: 'text' }
];

function worldsTable(rows) {
    const sorted = rows.slice().sort((a, b) => {
        const x = a[worldSort.key], y = b[worldSort.key];
        if (typeof x === 'string' || typeof y === 'string') {
            return String(x).localeCompare(String(y)) * worldSort.dir;
        }
        return ((Number(x) || 0) - (Number(y) || 0)) * worldSort.dir;
    });

    // Clamped rather than reset, so a refresh keeps your place -- and a page
    // that no longer exists (worlds deleted since the last load) lands on the
    // last one that does rather than rendering an empty table.
    const pages = Math.max(1, Math.ceil(sorted.length / WORLDS_PER_PAGE));
    worldPage = Math.min(Math.max(worldPage, 0), pages - 1);
    const from = worldPage * WORLDS_PER_PAGE;
    const page = sorted.slice(from, from + WORLDS_PER_PAGE);

    const head = WORLD_COLUMNS.map(col => `
        <th class="sortable" data-sort="${col.key}">${escapeHtml(col.label)}${
            worldSort.key === col.key ? `<span class="arrow">${worldSort.dir < 0 ? '↓' : '↑'}</span>` : ''
        }</th>`).join('');

    const body = page.map(r => `
        <tr>
            <td class="name">${escapeHtml(r.name)}</td>
            <td><span class="status-pill${r.active ? ' is-active' : ' is-completed'}">${r.active ? 'Active' : 'Archived'}</span></td>
            <td class="muted">${escapeHtml(r.leveling === 'xp' ? 'Experience' : 'Milestone')}</td>
            <td class="num">${num(r.characters)}</td>
            <td class="num">${r.avgLevel ? r.avgLevel.toFixed(1) : '—'}</td>
            <td class="num">${num(r.campaigns)}</td>
            <td class="num">${num(r.chapters)}</td>
            <td class="num">${num(r.beats)}</td>
            <td class="num">${num(r.checks)}</td>
            <td class="num">${num(r.areas)}</td>
            <td class="num">${num(r.npcs)}</td>
            <td class="num">${num(r.monsters)}</td>
            <td class="num">${num(r.encounters)}</td>
            <td class="muted">${escapeHtml(formatDate(r.created))}</td>
        </tr>`).join('');

    // Only when there is somewhere to go. A lone page of three worlds does not
    // need a pager telling you so -- the section heading already has the count.
    const pager = pages > 1 ? `
        <div class="an-pager">
            <span class="range">${num(from + 1)}–${num(from + page.length)} of ${num(sorted.length)} worlds</span>
            <div class="controls">
                <button class="btn btn-quiet" type="button" data-world-page="prev"
                        ${worldPage === 0 ? 'disabled' : ''}>Previous</button>
                <span class="mono page-of">Page ${worldPage + 1} of ${pages}</span>
                <button class="btn btn-quiet" type="button" data-world-page="next"
                        ${worldPage >= pages - 1 ? 'disabled' : ''}>Next</button>
            </div>
        </div>` : '';

    return `
        <div id="worlds-block">
            <div class="an-table-wrap">
                <table class="an-table" id="worlds-table">
                    <thead><tr>${head}</tr></thead>
                    <tbody>${body}</tbody>
                </table>
            </div>
            ${pager}
        </div>`;
}

function redrawWorlds() {
    const block = $('#worlds-block');
    if (block) block.outerHTML = worldsTable(worldRows(data));
}

function renderCampaigns(d) {
    if (!d.overview) {
        return section('campaigns', 'Campaigns', '', `
            <div class="an-locked">
                <b>Campaign figures unavailable.</b>
                <span>The campaign tables are DM-only, so this page reads them through
                      <code>analytics_overview()</code>. That call was refused${
                          d.overviewError ? ': ' + escapeHtml(d.overviewError) : '.'}</span>
            </div>`);
    }

    const o = d.overview;
    const t = o.totals || {};
    const checks = o.checks || {};
    const sharing = o.sharing || {};
    const reveals = o.reveals || {};

    const tiles = statRow([
        statTile('Campaigns', num(t.campaigns), `${num(t.authored_campaigns)} beyond the default one`),
        statTile('Chapters', num(t.chapters)),
        statTile('Beats', num(t.beats), t.chapters ? (t.beats / t.chapters).toFixed(1) + ' per chapter' : ''),
        statTile('Checks', num(t.checks), checks.avg_dc ? 'avg DC ' + checks.avg_dc : ''),
        statTile('Areas', num(t.areas)),
        statTile('NPCs', num(t.npcs)),
        statTile('Monsters', num(t.monsters)),
        statTile('Encounters', num(t.encounters), `${num(t.combatants)} combatants`),
        statTile('Sessions logged', num(t.sessions)),
        statTile('DM notes', num(t.notes)),
        statTile('Party links', num(t.party_links), 'characters attached to a campaign'),
        statTile('Shared encounters', num(t.shared_encounters), `${num(sharing.live)} live · ${num(sharing.imports)} imports`)
    ], 'six');

    const charts = `
        <div class="an-grid">
            ${panel('Chapters by status', barChart(entriesOf(o.chapters_by_status).map(([k, n]) => [titleCase(k), n]), { label: 'chapters' }))}
            ${panel('Beats by status', barChart(entriesOf(o.beats_by_status).map(([k, n]) => [titleCase(k), n]), { label: 'beats' }))}
            ${panel('Checks by type', barChart(entriesOf(o.checks_by_type).map(([k, n]) => [titleCase(k), n]), { label: 'checks' }))}
            ${panel('Checks by skill or ability', barChart(entriesOf(o.checks_by_focus || {}).map(([k, n]) => [titleCase(k), n]), { limit: 12, label: 'checks' }))}
            ${panel('How checks are set up', splitBar([
                { label: 'Group checks', value: Number(checks.group || 0) },
                { label: 'Secret', value: Number(checks.secret || 0) },
                { label: 'Repeatable', value: Number(checks.repeatable || 0) }
            ]), checks.min_dc != null ? `DC ${checks.min_dc}–${checks.max_dc}` : '')}
            ${panel('Outcomes written down', splitBar([
                { label: 'Pass text', value: Number(checks.with_success || 0) },
                { label: 'Fail text', value: Number(checks.with_failure || 0) }
            ]), `of ${num(t.checks)} checks`)}
            ${panel('NPCs by disposition', barChart(entriesOf(o.npcs_by_disposition).map(([k, n]) => [titleCase(k), n]), { label: 'NPCs' }))}
            ${panel('Areas by type', barChart(entriesOf(o.areas_by_type).map(([k, n]) => [titleCase(k), n]), { label: 'areas' }))}
            ${panel('Monsters by challenge rating', barChart(entriesOf(o.monsters_by_cr).map(([k, n]) => [titleCase(k), n]), { label: 'monsters' }))}
            ${panel('Monsters by source', splitBar(threeWay(entriesOf(o.monsters_by_source))))}
            ${panel('Encounters by status', barChart(entriesOf(o.encounters_by_status).map(([k, n]) => [titleCase(k), n]), { label: 'encounters' }))}
            ${panel('Encounters by difficulty', barChart(entriesOf(o.encounters_by_difficulty).map(([k, n]) => [titleCase(k), n]), { label: 'encounters' }))}
            ${panel('Combatants by kind', splitBar(threeWay(entriesOf(o.combatants_by_type))))}
            ${panel('Shown to the party', progRows([
                ['Chapters revealed', Number(reveals.chapters_revealed || 0), Number(t.chapters || 0)],
                ['Beats revealed', Number(reveals.beats_revealed || 0), Number(t.beats || 0)],
                ['Areas discovered', Number(reveals.areas_discovered || 0), Number(t.areas || 0)],
                ['NPCs known', Number(reveals.npcs_known || 0), Number(t.npcs || 0)],
                ['Session recaps published', Number(reveals.sessions_published || 0), Number(t.sessions || 0)]
            ]), 'the rest is DM-only')}
        </div>`;

    return section('campaigns', 'Campaigns', num(t.campaigns), tiles + charts);
}

// ========================================
// Feedback inbox
//
// Reports arrive from the v2 Support menu. Everything here is free text typed
// by whoever submitted it, so every field is escaped on the way out and the
// message keeps its line breaks through CSS rather than through markup.
// ========================================

const KIND_LABEL = { bug: 'Bug', idea: 'Idea', other: 'Other' };

function unreadCount(d) {
    return (d && d.feedback || []).filter(r => !r.is_read && !r.is_archived).length;
}

// Best-effort, and it says what it does not know rather than guessing. The
// full string is on the title attribute either way.
function shortAgent(ua) {
    if (!ua) return 'Unknown browser';
    const browser = /Edg\//.test(ua) ? 'Edge'
        : /OPR\//.test(ua) ? 'Opera'
        : /Chrome\//.test(ua) ? 'Chrome'
        : /Firefox\//.test(ua) ? 'Firefox'
        : /Safari\//.test(ua) ? 'Safari'
        : 'Unknown browser';
    const os = /iPhone|iPad|iPod/.test(ua) ? 'iOS'
        : /Android/.test(ua) ? 'Android'
        : /Mac OS X/.test(ua) ? 'macOS'
        : /Windows/.test(ua) ? 'Windows'
        : /Linux/.test(ua) ? 'Linux'
        : '';
    return os ? `${browser} on ${os}` : browser;
}

function relativeTime(iso) {
    if (!iso) return '';
    const then = new Date(iso);
    if (isNaN(then)) return '';
    const mins = Math.round((Date.now() - then.getTime()) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (mins < 1440) return `${Math.round(mins / 60)}h ago`;
    if (mins < 10080) return `${Math.round(mins / 1440)}d ago`;
    return formatDate(iso);
}

function feedbackCard(row) {
    const meta = [
        row.world_name ? `${row.world_name}${row.role ? ' · ' + (row.role === 'dm' ? 'DM' : 'player') : ''}` : null,
        row.page,
        row.viewport,
        shortAgent(row.user_agent)
    ].filter(Boolean);

    return `
        <article class="fb-card${row.is_read ? '' : ' is-unread'}${row.is_archived ? ' is-archived' : ''}">
            <header class="fb-head">
                <span class="fb-kind is-${escapeHtml(row.kind)}">${escapeHtml(KIND_LABEL[row.kind] || row.kind)}</span>
                ${row.is_read ? '' : '<span class="fb-dot" aria-label="Unread"></span>'}
                ${row.is_archived ? '<span class="hidden-pill">Archived</span>' : ''}
                <time class="fb-when" datetime="${escapeHtml(row.created_at || '')}"
                      title="${escapeHtml(formatDate(row.created_at))}">${escapeHtml(relativeTime(row.created_at))}</time>
            </header>

            <p class="fb-message">${escapeHtml(row.message)}</p>

            <p class="fb-meta" title="${escapeHtml(row.user_agent || '')}">${escapeHtml(meta.join('  ·  '))}</p>
            ${row.contact ? `<p class="fb-contact">Reachable at <b>${escapeHtml(row.contact)}</b></p>` : ''}

            <div class="fb-actions">
                <button class="btn btn-quiet" data-fb="${row.is_read ? 'unread' : 'read'}" data-fb-id="${escapeHtml(row.id)}">
                    ${row.is_read ? 'Mark unread' : 'Mark read'}
                </button>
                <button class="btn ${row.is_archived ? 'btn-quiet' : 'btn-danger'}"
                        data-fb="${row.is_archived ? 'restore' : 'archive'}" data-fb-id="${escapeHtml(row.id)}">
                    ${row.is_archived ? 'Restore' : 'Archive'}
                </button>
            </div>
        </article>`;
}

function renderFeedback(d) {
    if (!d.feedback) {
        return section('feedback', 'Feedback', '', `
            <div class="an-locked">
                <b>Reports unavailable.</b>
                <span>The feedback table could not be read${
                    d.feedbackError ? ': ' + escapeHtml(d.feedbackError) : '.'}</span>
            </div>`);
    }

    const all = d.feedback;
    const live = all.filter(r => !r.is_archived);
    const unread = live.filter(r => !r.is_read);
    const shown = showArchived ? all.filter(r => r.is_archived) : live;

    const tiles = statRow([
        statTile('Unread', num(unread.length), unread.length ? 'waiting on you' : 'all caught up', unread.length > 0),
        statTile('Open reports', num(live.length)),
        statTile('Bugs', num(live.filter(r => r.kind === 'bug').length)),
        statTile('Ideas', num(live.filter(r => r.kind === 'idea').length)),
        statTile('Archived', num(all.length - live.length)),
        statTile('With contact', num(live.filter(r => (r.contact || '').trim()).length), 'you can reply to these')
    ], 'six');

    const toggle = `
        <div class="fb-bar">
            <div class="segmented">
                <button type="button" data-fb-view="open" class="${showArchived ? '' : 'is-active'}">Open</button>
                <button type="button" data-fb-view="archived" class="${showArchived ? 'is-active' : ''}">Archived</button>
            </div>
            <span class="hint">Archiving hides a report without deleting it — it comes back from the Archived tab.</span>
        </div>`;

    const list = shown.length
        ? `<div class="fb-list">${shown.map(feedbackCard).join('')}</div>`
        : `<div class="empty-state">
               <h3>${showArchived ? 'Nothing archived' : 'No reports'}</h3>
               <p>${showArchived
                     ? 'Reports you archive from the Open tab land here.'
                     : 'Anything sent from the Support menu in v2 shows up here.'}</p>
           </div>`;

    return section('feedback', 'Feedback', num(live.length), tiles + toggle + list);
}

// A triage action writes the row, mirrors it locally and redraws the section
// alone -- reloading the whole page would throw away the reading position on
// a list you are working down.
async function feedbackAction(id, action) {
    const row = (data.feedback || []).find(r => r.id === id);
    if (!row) return;

    const patch =
        action === 'read'    ? { is_read: true, read_at: new Date().toISOString() }
      : action === 'unread'  ? { is_read: false, read_at: null }
      : action === 'archive' ? { is_archived: true, is_read: true, read_at: row.read_at || new Date().toISOString() }
      : action === 'restore' ? { is_archived: false }
      : null;
    if (!patch) return;

    const { error } = await db.from('feedback').update(patch).eq('id', id);
    if (error) {
        console.error('Feedback update failed:', error);
        window.alert('Could not update that report: ' + error.message);
        return;
    }

    Object.assign(row, patch);
    redrawFeedback();
}

function redrawFeedback() {
    const host = $('#sec-feedback');
    if (host) host.outerHTML = renderFeedback(data);
    markUnreadBadge();
}

function markUnreadBadge() {
    const badge = $('#nav-feedback-count');
    if (!badge) return;
    const n = unreadCount(data);
    badge.textContent = n ? String(n) : '';
    badge.hidden = !n;
}

function renderCharacters(d) {
    const chars = d.characters;
    const levels = chars.map(c => Number(c.level) || 0).filter(Boolean);
    const pending = chars.filter(c => c.pending_level_up).length;
    const inspired = chars.filter(c => c.inspiration).length;
    const subclassed = chars.filter(c => (c.subclass || '').trim()).length;

    const tiles = statRow([
        statTile('Characters', num(chars.length)),
        statTile('Average level', levels.length ? (sum(levels) / levels.length).toFixed(1) : '0'),
        statTile('Highest level', levels.length ? num(Math.max(...levels)) : '0'),
        statTile('Awaiting level-up', num(pending), pct(pending, chars.length) + ' of the roster'),
        statTile('With a subclass', num(subclassed), pct(subclassed, chars.length) + ' of the roster'),
        statTile('Holding inspiration', num(inspired))
    ], 'six');

    // Levels 1–20 in order: a distribution is read along its axis, not sorted.
    const levelCounts = [];
    for (let lvl = 1; lvl <= 20; lvl++) {
        const n = chars.filter(c => Number(c.level) === lvl).length;
        if (n) levelCounts.push(['Level ' + lvl, n]);
    }

    const charts = `
        <div class="an-grid">
            ${panel('Classes', barChart(tally(chars, 'class'), { label: 'characters' }))}
            ${panel('Races', barChart(tally(chars, 'race'), { label: 'characters' }))}
            ${panel('Levels', barChart(levelCounts, { label: 'characters' }), 'levels with nobody in them are left out')}
            ${panel('Backgrounds', barChart(tally(chars, 'background', 'None'), { limit: 12, label: 'characters' }))}
            ${panel('Alignments', barChart(tally(chars, 'alignment', 'None'), { label: 'characters' }))}
            ${panel('Subclasses', barChart(tally(chars.filter(c => (c.subclass || '').trim()), 'subclass'), { limit: 12, label: 'subclasses' }), 'top 12')}
        </div>`;

    return section('characters', 'Characters', num(chars.length), tiles + charts + recentTable(d));
}

function recentTable(d) {
    const worldNames = new Map(d.worlds.map(w => [w.id, w.name]));
    const recent = d.characters.slice(0, 12);
    if (!recent.length) return '';

    const body = recent.map(c => `
        <tr>
            <td class="name">${escapeHtml(c.name)}</td>
            <td class="muted">${escapeHtml(c.player_name || '—')}</td>
            <td>${escapeHtml(c.class || '—')}${c.subclass ? ` <span class="muted">${escapeHtml(c.subclass)}</span>` : ''}</td>
            <td class="muted">${escapeHtml(c.race || '—')}</td>
            <td class="num">${num(c.level)}</td>
            <td class="muted">${escapeHtml(worldNames.get(c.game_world_id) || 'Unknown world')}</td>
            <td class="muted">${escapeHtml(formatDate(c.created_at))}</td>
        </tr>`).join('');

    return `
        <div class="an-table-wrap">
            <table class="an-table">
                <thead><tr><th>Newest characters</th><th>Player</th><th>Class</th><th>Race</th><th>Level</th><th>World</th><th>Created</th></tr></thead>
                <tbody>${body}</tbody>
            </table>
        </div>`;
}

function renderPlayers(d) {
    const named = d.characters.filter(c => (c.player_name || '').trim());
    const byPlayer = tally(named, c => c.player_name.trim());
    const unique = byPlayer.length;
    const solo = byPlayer.filter(([, n]) => n === 1).length;

    // How many distinct worlds each player appears in.
    const worldsPerPlayer = new Map();
    named.forEach(c => {
        const key = c.player_name.trim().toLowerCase();
        if (!worldsPerPlayer.has(key)) worldsPerPlayer.set(key, new Set());
        worldsPerPlayer.get(key).add(c.game_world_id);
    });
    const multiWorld = Array.from(worldsPerPlayer.values()).filter(s => s.size > 1).length;

    const tiles = statRow([
        statTile('Players', num(unique)),
        statTile('Characters per player', unique ? (named.length / unique).toFixed(1) : '0'),
        statTile('One character only', num(solo), pct(solo, unique) + ' of players'),
        statTile('Playing in several worlds', num(multiWorld))
    ]);

    const charts = `
        <div class="an-grid">
            ${panel('Busiest players', barChart(byPlayer, { limit: 12, showPct: false, label: 'players' }), 'by characters made')}
            ${panel('Characters per player', barChart(
                distribution(byPlayer.map(([, n]) => n), n => n >= 5 ? '5+ characters' : n + (n === 1 ? ' character' : ' characters')),
                { label: 'players' }), 'how many players hold how many characters')}
        </div>`;

    return section('players', 'Players', num(unique), tiles + charts);
}

function renderLibrary(d) {
    const c = d.content;
    const chars = d.characters.length || 1;
    const per = n => (Number(n || 0) / chars).toFixed(1) + ' per character';

    const tiles = statRow([
        statTile('Spells', num(c.spells), per(c.spells)),
        statTile('Weapons', num(c.weapons), per(c.weapons)),
        statTile('Inventory items', num(c.inventory), per(c.inventory)),
        statTile('Features & traits', num(c.features), per(c.features)),
        statTile('Active effects', num(c.effects)),
        statTile('Spell slot rows', num(c.slots))
    ], 'six');

    const total = sum([c.spells, c.weapons, c.inventory, c.features]);

    const charts = `
        <div class="an-grid">
            ${panel('What fills a sheet', barChart([
                ['Spells', Number(c.spells || 0)],
                ['Inventory items', Number(c.inventory || 0)],
                ['Features & traits', Number(c.features || 0)],
                ['Weapons', Number(c.weapons || 0)]
            ].sort((a, b) => b[1] - a[1]), { label: 'rows' }), `${num(total)} rows in total`)}
            ${panel('Sheets filled in', progRows([
                ['Characters with details written', Number(c.details || 0), d.characters.length],
                ['Characters with a purse', Number(c.currency || 0), d.characters.length]
            ]))}
        </div>`;

    return section('library', 'Library', num(total), tiles + charts);
}

// Bucket a list of numbers into [[label, count], …] keeping the natural order.
function distribution(values, labelFor) {
    const counts = new Map();
    values.forEach(v => {
        const key = labelFor(v);
        counts.set(key, (counts.get(key) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }));
}

function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ========================================
// Page
// ========================================

function render() {
    const rows = worldRows(data);
    $('#content').innerHTML = [
        `<nav class="an-jump">${SECTIONS.map(s => `<a href="#sec-${s.id}">${escapeHtml(s.label)}</a>`).join('')}</nav>`,
        renderOverview(data, rows),
        renderFeedback(data),
        renderWorlds(data, rows),
        renderCampaigns(data),
        renderCharacters(data),
        renderPlayers(data),
        renderLibrary(data)
    ].join('');

    const stamp = formatTime(data.loadedAt);
    $('#d-generated').textContent = stamp;
    $('#m-generated').textContent = stamp;
    markUnreadBadge();
}

async function load() {
    $('#content').innerHTML = '<div class="an-loading"><div class="an-spinner"></div><p>Loading analytics…</p></div>';
    try {
        data = await fetchAll();
        render();
    } catch (err) {
        console.error('Analytics failed to load:', err);
        $('#content').innerHTML = `
            <div class="empty-state">
                <h3>Could not load analytics</h3>
                <p>${escapeHtml(err.message || 'The database did not answer.')}</p>
                <button class="btn btn-accent" onclick="load()">Try again</button>
            </div>`;
    }
}

function showDashboard() {
    $('#gate').hidden = true;
    $('#shell').hidden = false;
    if (window.markThemeButtons) window.markThemeButtons();
    buildNav();
    load();
}

function showGate() {
    $('#shell').hidden = true;
    $('#gate').hidden = false;
    $('#gate-password').value = '';
}

function buildNav() {
    $('#side-nav').innerHTML = SECTIONS.map(s => {
        // Only the inbox carries a count, and it is hidden at zero rather than
        // showing a "0" that reads as something needing attention.
        const badge = s.id === 'feedback'
            ? '<span class="mono nav-count is-live" id="nav-feedback-count" hidden></span>' : '';
        return `<a href="#sec-${s.id}">${escapeHtml(s.label)}${badge}</a>`;
    }).join('');
}

// ---------- Hover layer ----------
// An HTML chart is interactive by default, so every mark answers the pointer.
function wireTooltip() {
    const tip = document.createElement('div');
    tip.className = 'an-tip';
    document.body.appendChild(tip);

    document.addEventListener('pointermove', event => {
        const host = event.target.closest && event.target.closest('[data-tip]');
        if (!host) { tip.classList.remove('is-on'); return; }
        tip.textContent = host.getAttribute('data-tip');
        tip.classList.add('is-on');
        const pad = 14;
        const x = Math.min(event.clientX + pad, window.innerWidth - tip.offsetWidth - 8);
        const y = Math.max(event.clientY - tip.offsetHeight - pad, 8);
        tip.style.left = x + 'px';
        tip.style.top = y + 'px';
    });
    document.addEventListener('pointerleave', () => tip.classList.remove('is-on'));
    document.addEventListener('scroll', () => tip.classList.remove('is-on'), true);
}

// ---------- Wiring ----------
document.addEventListener('DOMContentLoaded', async () => {
    wireTooltip();

    $('#gate-form').addEventListener('submit', async event => {
        event.preventDefault();
        const button = $('#gate-submit');
        const error = $('#gate-error');
        error.hidden = true;
        button.setAttribute('aria-busy', 'true');
        button.textContent = 'Signing in…';

        const { error: authError } = await db.auth.signInWithPassword({
            email: $('#gate-email').value.trim(),
            password: $('#gate-password').value
        });

        button.removeAttribute('aria-busy');
        button.textContent = 'Sign in';

        if (authError) {
            error.textContent = authError.message;
            error.hidden = false;
            return;
        }
        showDashboard();
    });

    async function signOut() {
        await db.auth.signOut();
        data = null;
        showGate();
    }
    $('#sb-signout').addEventListener('click', signOut);
    $('#m-signout').addEventListener('click', signOut);
    $('#d-refresh').addEventListener('click', load);
    $('#m-refresh').addEventListener('click', load);

    // Sorting redraws the table alone, so the rest of the page stays put.
    $('#content').addEventListener('click', event => {
        if (!data) return;

        const step = event.target.closest('[data-world-page]');
        if (step) {
            worldPage += step.getAttribute('data-world-page') === 'next' ? 1 : -1;
            redrawWorlds();
            return;
        }

        const header = event.target.closest('th[data-sort]');
        if (!header) return;
        const key = header.getAttribute('data-sort');
        worldSort = worldSort.key === key
            ? { key, dir: -worldSort.dir }
            : { key, dir: key === 'name' || key === 'leveling' ? 1 : -1 };
        // A new order makes page 7 meaningless, so sorting starts over.
        worldPage = 0;
        redrawWorlds();
    });

    $('#content').addEventListener('click', event => {
        if (!data) return;

        const view = event.target.closest('[data-fb-view]');
        if (view) {
            showArchived = view.getAttribute('data-fb-view') === 'archived';
            redrawFeedback();
            return;
        }

        const action = event.target.closest('[data-fb]');
        if (action) {
            feedbackAction(action.getAttribute('data-fb-id'), action.getAttribute('data-fb'));
        }
    });

    const { data: { session } } = await db.auth.getSession();
    if (session) showDashboard(); else showGate();
});
