// ========================================
// Supabase Configuration
// ========================================
const SUPABASE_URL = 'https://zlsguyiwwwbyoqxdewsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpsc2d1eWl3d3dieW9xeGRld3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzU0NzMsImV4cCI6MjA4NDIxMTQ3M30.LNcqEHFvGobozl5oPNs_GYpduYBoNmM7n6IhbuInfb4';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    realtime: {
        params: {
            eventsPerSecond: 10
        }
    }
});


// ========================================
// D&D 5e API Configuration
// ========================================
const DND_API_BASE = 'https://www.dnd5eapi.co/api';

// ========================================
// Constants
// ========================================
const SKILLS = {
    'Acrobatics': 'dex', 'Animal Handling': 'wis', 'Arcana': 'int', 'Athletics': 'str',
    'Deception': 'cha', 'History': 'int', 'Insight': 'wis', 'Intimidation': 'cha',
    'Investigation': 'int', 'Medicine': 'wis', 'Nature': 'int', 'Perception': 'wis',
    'Performance': 'cha', 'Persuasion': 'cha', 'Religion': 'int', 'Sleight of Hand': 'dex',
    'Stealth': 'dex', 'Survival': 'wis'
};

const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
const ABILITY_FULL = { str: 'Strength', dex: 'Dexterity', con: 'Constitution', int: 'Intelligence', wis: 'Wisdom', cha: 'Charisma' };
const ABILITY_SHORT = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };

const CONDITIONS = ['Blinded', 'Charmed', 'Deafened', 'Frightened', 'Grappled', 'Incapacitated', 
    'Invisible', 'Paralyzed', 'Petrified', 'Poisoned', 'Prone', 'Restrained', 'Stunned', 'Unconscious', 'Exhaustion'];

const HIT_DICE = { Barbarian: 12, Fighter: 10, Paladin: 10, Ranger: 10, Bard: 8, Cleric: 8, Druid: 8, 
    Monk: 8, Rogue: 8, Warlock: 8, Sorcerer: 6, Wizard: 6, Artificer: 8 };

// Special attacks that aren't in the API (e.g., Unarmed Strike)
const SPECIAL_ATTACKS = [
    {
        name: 'Unarmed Strike',
        damage: '1+STR',
        damage_type: 'Bludgeoning',
        properties: 'Melee',
        description: 'Instead of using a weapon to make a melee weapon attack, you can use an unarmed strike: a punch, kick, head-butt, or similar forceful blow (none of which count as weapons). On a hit, an unarmed strike deals bludgeoning damage equal to 1 + your Strength modifier. You are proficient with your unarmed strikes.',
        special_options: [
            {
                name: 'Damage',
                description: 'Make an attack roll against the target. Your bonus to the roll equals your Strength modifier plus your Proficiency Bonus. On a hit, the target takes Bludgeoning damage equal to 1 + your Strength modifier.'
            },
            {
                name: 'Grapple',
                description: 'The target must succeed on a Strength or Dexterity saving throw (it chooses which), or it has the Grappled condition. The DC for the saving throw and any escape attempts equals 8 + your Strength modifier + Proficiency Bonus. This grapple is possible only if the target is no more than one size larger than you and if you have a hand free to grab it.\n\nGrappled Condition: Speed is 0. Disadvantage on attack rolls against any target other than the grappler. The grappler can drag or carry you when moving (costs 1 extra foot per foot moved).'
            },
            {
                name: 'Shove',
                description: 'The target must succeed on a Strength or Dexterity saving throw (it chooses which), or you either push the target 5 feet away or cause it to have the Prone condition. The DC for the saving throw equals 8 + your Strength modifier + Proficiency Bonus. This shove is possible only if the target is no more than one size larger than you.'
            }
        ]
    },
    {
        name: 'Improvised Weapon',
        damage: '1d4+STR',
        damage_type: 'Bludgeoning',
        properties: 'Melee or Ranged (20/60)',
        description: 'An improvised weapon includes any object you can wield in one or two hands, such as broken glass, a table leg, a frying pan, a wagon wheel, or a dead goblin.'
    }
];

// Common bonus actions available to all characters
const COMMON_BONUS_ACTIONS = [
    {
        name: 'Two-Weapon Fighting',
        description: 'When you take the Attack action and attack with a light melee weapon that you\'re holding in one hand, you can use a bonus action to attack with a different light melee weapon that you\'re holding in the other hand. You don\'t add your ability modifier to the damage of the bonus attack, unless that modifier is negative.',
        source: 'Combat'
    },
    {
        name: 'Offhand Attack',
        description: 'If you are wielding two light melee weapons, you can make an attack with your off-hand weapon as a bonus action after taking the Attack action. You don\'t add your ability modifier to the damage unless it\'s negative (or you have the Two-Weapon Fighting style).',
        source: 'Combat'
    }
];

// ========================================
// State
// ========================================
let characters = [];
let currentCharacter = null;
let currentTab = 'stats';
let apiSearchCache = {};
let currentSearchController = null;

// ========================================
// Utility Functions
// ========================================
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);
const getModifier = score => Math.floor((score - 10) / 2);
const formatMod = mod => mod >= 0 ? `+${mod}` : `${mod}`;
const getProfBonus = level => Math.ceil(level / 4) + 1;
const escapeHtml = t => { const d = document.createElement('div'); d.textContent = t; return d.innerHTML; };

// ========================================
// Session Management
// ========================================
let currentSession = null;

async function validateSession() {
    console.log('Validating session...');
    
    // Check for session in localStorage or sessionStorage
    let session = JSON.parse(localStorage.getItem('dnd-session') || sessionStorage.getItem('dnd-session') || 'null');
    
    if (!session) {
        console.log('No session found, redirecting to login...');
        // No session, redirect to login
        window.location.href = 'index.html';
        return false;
    }
    
    console.log('Session found:', session);
    
    // Check if session is less than 7 days old
    const oneWeek = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - session.timestamp > oneWeek) {
        console.log('Session expired, clearing...');
        // Clear expired session
        clearSession();
        window.location.href = 'index.html';
        return false;
    }
    
    // Verify game world still exists
    try {
        const { data: gameWorld, error } = await db
            .from('game_worlds')
            .select('*')
            .eq('id', session.gameWorldId)
            .eq('is_active', true)
            .single();
        
        if (error || !gameWorld) {
            console.error('Game world not found or error:', error);
            // Game world not found, clear session and redirect
            clearSession();
            window.location.href = 'index.html';
            return false;
        }
        
        console.log('Game world found:', gameWorld.name);
        
        currentSession = {
            ...session,
            gameWorld
        };
        
        return true;
    } catch (error) {
        console.error('Error validating session:', error);
        clearSession();
        window.location.href = 'index.html';
        return false;
    }
}

function clearSession() {
    console.log('Clearing session...');
    localStorage.removeItem('dnd-session');
    sessionStorage.removeItem('dnd-session');
    currentSession = null;
}

async function loadCharacters() {
    if (!currentSession) {
        console.error('No session when loading characters');
        return;
    }
    
    console.log('Loading characters for game world:', currentSession.gameWorldId);
    
    const { data, error } = await db
        .from('characters')
        .select(`*, ability_scores (*), skills (*)`)
        .eq('game_world_id', currentSession.gameWorldId)
        .order('updated_at', { ascending: false });
    
    if (error) { 
        console.error('Error loading characters:', error); 
        return; 
    }
    
    characters = data || [];
    console.log(`Loaded ${characters.length} characters`);
    renderRoster();
}


// Get ability score with consistent key access
function getAbilityScore(abilityScores, shortKey) {
    if (!abilityScores) return 10;
    const fullKey = ABILITY_FULL[shortKey]?.toLowerCase();
    return abilityScores[fullKey] || abilityScores[shortKey] || 10;
}

function getPassivePerception(char) {
    if (!char.ability_scores) return 10;
    const wisMod = getModifier(getAbilityScore(char.ability_scores, 'wis'));
    const profBonus = getProfBonus(char.level);
    const skill = char.skills?.find(s => s.skill_name === 'Perception');
    let bonus = wisMod;
    if (skill?.proficient) bonus += profBonus;
    if (skill?.expertise) bonus += profBonus;
    return 10 + bonus;
}

function getHpPercent(curr, max) { return Math.max(0, Math.min(100, (curr / max) * 100)); }
function getHpClass(pct) { return pct > 50 ? 'high' : pct > 25 ? 'mid' : 'low'; }
function roll4d6Drop() { const r = [0,0,0,0].map(() => Math.floor(Math.random() * 6) + 1).sort((a,b) => b-a); return r[0]+r[1]+r[2]; }
function calcHP(cls, lvl, conMod) { const hd = HIT_DICE[cls] || 8; return lvl === 1 ? Math.max(1, hd + conMod) : Math.max(1, hd + conMod + (lvl-1) * (Math.floor(hd/2) + 1 + conMod)); }

function showPage(id) { 
    $$('.page').forEach(p => p.classList.add('hidden')); 
    $(`#${id}`).classList.remove('hidden'); 
    // Save current page state to localStorage
    if (id === 'character-page' && currentCharacter) {
        localStorage.setItem('dnd-current-page', 'character-page');
        localStorage.setItem('dnd-current-character-id', currentCharacter.id);
    } else if (id === 'home-page') {
        localStorage.setItem('dnd-current-page', 'home-page');
        localStorage.removeItem('dnd-current-character-id');
    } else if (id === 'create-page') {
        localStorage.setItem('dnd-current-page', 'create-page');
    }
}
function showLoading() { $('#loading').classList.remove('hidden'); }
function hideLoading() { $('#loading').classList.add('hidden'); }

// Debounce utility for API searches
function debounce(fn, delay) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

// ========================================
// D&D 5e API Functions
// ========================================
async function searchDndApi(endpoint, query) {
    if (!query || query.length < 2) return [];
    
    const cacheKey = `${endpoint}:${query.toLowerCase()}`;
    if (apiSearchCache[cacheKey]) return apiSearchCache[cacheKey];
    
    // Cancel previous request
    if (currentSearchController) {
        currentSearchController.abort();
    }
    currentSearchController = new AbortController();
    
    try {
        const response = await fetch(`${DND_API_BASE}/${endpoint}?name=${encodeURIComponent(query)}`, {
            signal: currentSearchController.signal
        });
        if (!response.ok) return [];
        const data = await response.json();
        const results = data.results || [];
        apiSearchCache[cacheKey] = results;
        return results;
    } catch (e) {
        if (e.name === 'AbortError') return [];
        console.error('API search error:', e);
        return [];
    }
}

// Search multiple endpoints for features/traits/feats
async function searchMultipleEndpoints(endpoints, query) {
    if (!query || query.length < 2) return [];
    
    // Cancel previous request
    if (currentSearchController) {
        currentSearchController.abort();
    }
    currentSearchController = new AbortController();
    
    try {
        // Search all endpoints in parallel
        const searches = endpoints.map(async (endpoint) => {
            const cacheKey = `${endpoint}:${query.toLowerCase()}`;
            if (apiSearchCache[cacheKey]) {
                return apiSearchCache[cacheKey].map(r => ({ ...r, _endpoint: endpoint }));
            }
            
            try {
                const response = await fetch(`${DND_API_BASE}/${endpoint}?name=${encodeURIComponent(query)}`, {
                    signal: currentSearchController.signal
                });
                if (!response.ok) return [];
                const data = await response.json();
                const results = (data.results || []).map(r => ({ ...r, _endpoint: endpoint }));
                apiSearchCache[cacheKey] = data.results || [];
                return results;
            } catch (e) {
                if (e.name !== 'AbortError') console.error(`API search error for ${endpoint}:`, e);
                return [];
            }
        });
        
        const allResults = await Promise.all(searches);
        // Flatten and sort by name
        return allResults.flat().sort((a, b) => a.name.localeCompare(b.name));
    } catch (e) {
        if (e.name === 'AbortError') return [];
        console.error('Multi-endpoint search error:', e);
        return [];
    }
}

async function getDndApiDetails(url) {
    try {
        const response = await fetch(`https://www.dnd5eapi.co${url}`);
        if (!response.ok) return null;
        return await response.json();
    } catch (e) {
        console.error('API details error:', e);
        return null;
    }
}

// Format spell details from API
function formatSpellFromApi(spell) {
    return {
        name: spell.name,
        level: spell.level,
        school: spell.school?.name || '',
        casting_time: spell.casting_time || '',
        range: spell.range || '',
        components: spell.components?.join(', ') || '',
        duration: spell.duration || '',
        description: Array.isArray(spell.desc) ? spell.desc.join('\n\n') : (spell.desc || ''),
        higher_level: Array.isArray(spell.higher_level) ? spell.higher_level.join('\n\n') : (spell.higher_level || ''),
        api_index: spell.index
    };
}

// Format equipment/item details from API
function formatItemFromApi(item) {
    const result = {
        name: item.name,
        item_type: item.equipment_category?.name || 'Gear',
        weight: item.weight || null,
        description: ''
    };
    
    // Build description from various fields
    const descParts = [];
    if (item.desc && item.desc.length > 0) {
        descParts.push(item.desc.join(' '));
    }
    if (item.cost) {
        descParts.push(`Cost: ${item.cost.quantity} ${item.cost.unit}`);
    }
    result.description = descParts.join('\n');
    
    return result;
}

// Format weapon details from API
function formatWeaponFromApi(weapon, charAbilityScores, profBonus) {
    const isFinesse = weapon.properties?.some(p => p.name === 'Finesse');
    const isRanged = weapon.weapon_range === 'Ranged';
    
    // Calculate attack bonus
    let abilityMod = 0;
    if (charAbilityScores) {
        if (isFinesse) {
            const strMod = getModifier(getAbilityScore(charAbilityScores, 'str'));
            const dexMod = getModifier(getAbilityScore(charAbilityScores, 'dex'));
            abilityMod = Math.max(strMod, dexMod);
        } else if (isRanged) {
            abilityMod = getModifier(getAbilityScore(charAbilityScores, 'dex'));
        } else {
            abilityMod = getModifier(getAbilityScore(charAbilityScores, 'str'));
        }
    }
    
    // Format damage
    let damage = '';
    if (weapon.damage) {
        damage = weapon.damage.damage_dice;
        if (abilityMod !== 0) {
            damage += abilityMod >= 0 ? `+${abilityMod}` : `${abilityMod}`;
        }
    }
    
    // Format properties
    const props = weapon.properties?.map(p => p.name).join(', ') || '';
    
    return {
        name: weapon.name,
        attack_bonus: abilityMod + (profBonus || 0),
        damage: damage,
        damage_type: weapon.damage?.damage_type?.name || '',
        properties: props
    };
}

// Format feature/trait/feat from API with auto-source detection
function formatFeatureFromApi(item, endpoint) {
    const result = {
        name: item.name,
        description: Array.isArray(item.desc) ? item.desc.join('\n\n') : (item.desc || ''),
        source: 'Other'
    };
    
    // Auto-detect source based on endpoint and data
    if (endpoint === 'features') {
        // Class features - just show "Class" in blue
        result.source = 'Class';
    } else if (endpoint === 'traits') {
        // Racial traits - just show "Race"
        result.source = 'Race';
    } else if (endpoint === 'feats') {
        result.source = 'Feat';
        // Add prerequisites if available
        if (item.prerequisites && item.prerequisites.length > 0) {
            const prereqDesc = item.prerequisites.map(p => {
                if (p.ability_score) return `${p.ability_score.name} ${p.minimum_score}+`;
                if (p.proficiency) return `Proficiency: ${p.proficiency.name}`;
                if (p.spell) return `Spell: ${p.spell.name}`;
                return '';
            }).filter(Boolean).join(', ');
            if (prereqDesc) {
                result.description = `Prerequisites: ${prereqDesc}\n\n${result.description}`;
            }
        }
    }
    
    return result;
}

// ========================================
// Home Page
// ========================================

function renderRoster() {
    const roster = $('#party-roster');
    const empty = $('#empty-state');
    if (!characters.length) { roster.innerHTML = ''; empty.classList.remove('hidden'); return; }
    empty.classList.add('hidden');
    roster.innerHTML = characters.map(c => {
        const pct = getHpPercent(c.current_hit_points, c.hit_point_maximum);
        const pp = getPassivePerception(c);
        const conditions = c.active_conditions || [];
        return `<div class="character-card" data-id="${c.id}">
            <div class="card-header">
                <div class="card-info">
                    <h2>${escapeHtml(c.name)}</h2>
                    <p class="card-subtitle">${escapeHtml(c.race)} ${escapeHtml(c.class)}${c.subclass ? ` (${escapeHtml(c.subclass)})` : ''}</p>
                    <p class="card-player">${escapeHtml(c.player_name)}</p>
                </div>
                <div class="card-level">${c.level}</div>
            </div>
            <div class="hp-bar-section">
                <div class="hp-bar-header">
                    <span class="hp-bar-label">HP</span>
                    <span class="hp-bar-value">${c.current_hit_points}${c.temporary_hit_points > 0 ? `<span class="temp">+${c.temporary_hit_points}</span>` : ''}/${c.hit_point_maximum}</span>
                </div>
                <div class="hp-bar"><div class="hp-bar-fill ${getHpClass(pct)}" style="width:${pct}%"></div></div>
            </div>
            ${conditions.length ? `<div class="card-conditions">${conditions.map(cond => `<span class="card-condition-tag">${cond}</span>`).join('')}</div>` : ''}
            <div class="quick-stats">
                <div class="quick-stat"><div class="quick-stat-value">${c.armor_class}</div><div class="quick-stat-label">AC</div></div>
                <div class="quick-stat"><div class="quick-stat-value">${formatMod(c.initiative_bonus)}</div><div class="quick-stat-label">Init</div></div>
                <div class="quick-stat"><div class="quick-stat-value">${c.speed}</div><div class="quick-stat-label">Speed</div></div>
                <div class="quick-stat"><div class="quick-stat-value">${pp}</div><div class="quick-stat-label">PP</div></div>
            </div>
        </div>`;
    }).join('');
    $$('.character-card').forEach(card => card.addEventListener('click', () => openCharacter(card.dataset.id)));
}

// ========================================
// Create Character
// ========================================
function initCreatePage() {
    ABILITIES.forEach(ab => {
        $(`#score-${ab}`).addEventListener('input', e => {
            $(`#mod-${ab}`).textContent = formatMod(getModifier(parseInt(e.target.value) || 10));
            updateHPField();
        });
    });
    $('#roll-abilities-btn').addEventListener('click', () => {
        ABILITIES.forEach(ab => {
            const s = roll4d6Drop();
            $(`#score-${ab}`).value = s;
            $(`#mod-${ab}`).textContent = formatMod(getModifier(s));
        });
        updateHPField();
    });
    $('#char-class').addEventListener('change', updateHPField);
    $('#char-level').addEventListener('input', updateHPField);
    $('#create-form').addEventListener('submit', handleCreate);
    $('#cancel-create-btn').addEventListener('click', () => showPage('home-page'));
    $('#create-back-btn').addEventListener('click', () => showPage('home-page'));
    
    // Initialize HP field on page load
    updateHPField();
}

function updateHPField() {
    const cls = $('#char-class').value;
    const lvl = parseInt($('#char-level').value) || 1;
    const conMod = getModifier(parseInt($('#score-con').value) || 10);
    const suggestedHP = calcHP(cls, lvl, conMod);
    
    // Update both the suggestion text and the actual input field
    $('#hp-suggestion').textContent = `Suggested: ${suggestedHP}`;
    $('#char-hp').value = suggestedHP;
}

async function handleCreate(e) {
    e.preventDefault();
    
    // Add game world validation
    if (!currentSession) {
        alert('Session expired. Please login again.');
        window.location.href = 'index.html';
        return;
    }
    
    const name = $('#char-name').value.trim();
    const playerName = $('#player-name').value.trim();
    const race = $('#char-race').value;
    const cls = $('#char-class').value;
    const subclass = $('#char-subclass').value.trim() || null;
    const level = parseInt($('#char-level').value) || 1;
    const background = $('#char-background').value;
    const alignment = $('#char-alignment').value;
    const ac = parseInt($('#char-ac').value) || 10;
    const speed = parseInt($('#char-speed').value) || 30;
    const abs = {}; ABILITIES.forEach(a => abs[a] = parseInt($(`#score-${a}`).value) || 10);
    const conMod = getModifier(abs.con);
    const dexMod = getModifier(abs.dex);
    const hp = parseInt($('#char-hp').value) || calcHP(cls, level, conMod);
    const profBonus = getProfBonus(level);
    const hd = HIT_DICE[cls] || 8;

    const { data: char, error } = await db.from('characters').insert({
        game_world_id: currentSession.gameWorldId, // Add this line
        name, player_name: playerName, race, class: cls, subclass, level, experience_points: 0, background, alignment,
        armor_class: ac, initiative_bonus: dexMod, speed, hit_point_maximum: hp, current_hit_points: hp,
        temporary_hit_points: 0, hit_dice_total: `${level}d${hd}`, hit_dice_remaining: level,
        death_save_successes: 0, death_save_failures: 0, proficiency_bonus: profBonus, inspiration: false
    }).select().single();

    if (error) { console.error(error); alert('Failed to create character'); return; }
    const id = char.id;

    await db.from('ability_scores').insert({ character_id: id, strength: abs.str, dexterity: abs.dex, constitution: abs.con, intelligence: abs.int, wisdom: abs.wis, charisma: abs.cha });
    await db.from('skills').insert(Object.keys(SKILLS).map(s => ({ character_id: id, skill_name: s, proficient: false, expertise: false })));
    await db.from('saving_throws').insert(ABILITIES.map(a => ({ character_id: id, ability: a, proficient: false })));
    await db.from('currency').insert({ character_id: id, copper: 0, silver: 0, electrum: 0, gold: 0, platinum: 0 });
    await db.from('character_details').insert({ character_id: id });

    $('#create-form').reset();
    ABILITIES.forEach(a => $(`#mod-${a}`).textContent = '+0');
    await loadCharacters();
    openCharacter(id);
}

// ========================================
// Character Detail Page
// ========================================
async function openCharacter(id) {
    // Clean up roster realtime when viewing a specific character
    cleanupRosterRealtime();
    
    showLoading();
    const { data, error } = await db.from('characters').select(`*, ability_scores (*), skills (*), saving_throws (*), inventory_items (*), weapons (*), spells (*), spell_slots (*), features_traits (*), currency (*), character_details (*)`).eq('id', id).single();
    if (error || !data) { console.error(error); hideLoading(); showPage('home-page'); return; }
    currentCharacter = data;
    renderCharacterPage();
    showPage('character-page');
    hideLoading();
    setupRealtime(id);
}

let realtimeRetryCount = 0;
const MAX_REALTIME_RETRIES = 3;
let currentRealtimeChannel = null;

function setupRealtime(id) {
    // Remove any existing channel first
    try {
        if (currentRealtimeChannel) {
            db.removeChannel(currentRealtimeChannel);
            currentRealtimeChannel = null;
        }
    } catch (e) {
        console.warn('Error removing existing channel:', e);
    }
    
    // Create a unique channel name
    const channelName = `char-updates-${id}`;
    const channel = db.channel(channelName, {
        config: {
            broadcast: { self: false },
            presence: { key: '' }
        }
    });
    
    currentRealtimeChannel = channel;
    
    // Listen to characters table
    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'characters', filter: `id=eq.${id}` },
        (payload) => {
            console.log('Characters change:', payload);
            handleRealtimeUpdate('characters', payload);
        }
    );
    
    // Listen to all related tables
    const relatedTables = ['ability_scores', 'skills', 'saving_throws', 'inventory_items', 'weapons', 'spells', 'spell_slots', 'features_traits', 'currency', 'character_details'];
    
    relatedTables.forEach(table => {
        channel.on(
            'postgres_changes',
            { event: '*', schema: 'public', table: table, filter: `character_id=eq.${id}` },
            (payload) => {
                console.log(`${table} change:`, payload);
                handleRealtimeUpdate(table, payload);
            }
        );
    });
    
    // Subscribe to the channel with better error handling
    channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
            console.log('Realtime subscription active for character:', id);
            realtimeRetryCount = 0; // Reset on success
        } else if (status === 'CHANNEL_ERROR') {
            console.warn('Realtime channel error (continuing without live updates):', err);
            // Don't retry on channel errors
        } else if (status === 'TIMED_OUT') {
            console.warn('Realtime subscription timed out (continuing without live updates)');
            // Don't retry timeouts to avoid connection spam
        } else if (status === 'CLOSED') {
            console.log('Realtime channel closed');
        } else {
            console.log('Realtime status:', status);
        }
    });
}

// ========================================
// Roster Realtime Updates
// ========================================
let rosterRealtimeChannel = null;

function setupRosterRealtime() {
    // Remove any existing roster channel first
    try {
        if (rosterRealtimeChannel) {
            db.removeChannel(rosterRealtimeChannel);
            rosterRealtimeChannel = null;
        }
    } catch (e) {
        console.warn('Error removing roster channel:', e);
    }
    
    if (!currentSession) return;
    
    // Create channel for all characters in this game world
    const channelName = `roster-updates-${currentSession.gameWorldId}`;
    const channel = db.channel(channelName, {
        config: {
            broadcast: { self: false },
            presence: { key: '' }
        }
    });
    
    rosterRealtimeChannel = channel;
    
    // Listen to characters table changes for this game world
    channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'characters', filter: `game_world_id=eq.${currentSession.gameWorldId}` },
        async (payload) => {
            console.log('Roster character change:', payload);
            // Reload characters when any character in this game world changes
            await loadCharacters();
        }
    );
    
    // Subscribe to the channel
    channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
            console.log('Roster realtime subscription active');
        } else if (status === 'CHANNEL_ERROR') {
            console.warn('Roster realtime channel error:', err);
        } else if (status === 'TIMED_OUT') {
            console.warn('Roster realtime subscription timed out');
        }
    });
}

function cleanupRosterRealtime() {
    try {
        if (rosterRealtimeChannel) {
            db.removeChannel(rosterRealtimeChannel);
            rosterRealtimeChannel = null;
        }
    } catch (e) {
        console.warn('Error removing roster channel:', e);
    }
}

// Handle realtime updates by merging data locally when possible
function handleRealtimeUpdate(table, payload) {
    if (!currentCharacter) return;
    
    const { eventType, new: newData, old: oldData } = payload;
    
    // For the main character table, update directly
    if (table === 'characters') {
        if (eventType === 'UPDATE' && newData) {
            Object.assign(currentCharacter, newData);
            renderCharacterPage();
        }
        return;
    }
    
    // For related tables, update the nested data
    const tableMapping = {
        'ability_scores': 'ability_scores',
        'skills': 'skills',
        'saving_throws': 'saving_throws',
        'inventory_items': 'inventory_items',
        'weapons': 'weapons',
        'spells': 'spells',
        'spell_slots': 'spell_slots',
        'features_traits': 'features_traits',
        'currency': 'currency',
        'character_details': 'character_details'
    };
    
    const dataKey = tableMapping[table];
    if (!dataKey) return;
    
    // Handle single objects (ability_scores, currency, character_details)
    if (['ability_scores', 'currency', 'character_details'].includes(table)) {
        if (eventType === 'UPDATE' && newData) {
            currentCharacter[dataKey] = newData;
            renderCharacterPage();
        }
        return;
    }
    
    // Handle arrays (skills, weapons, spells, etc.)
    let dataArray = currentCharacter[dataKey];
    if (!Array.isArray(dataArray)) {
        dataArray = [];
        currentCharacter[dataKey] = dataArray;
    }
    
    switch (eventType) {
        case 'INSERT':
            if (newData && !dataArray.find(item => item.id === newData.id)) {
                dataArray.push(newData);
            }
            break;
        case 'UPDATE':
            if (newData) {
                const index = dataArray.findIndex(item => item.id === newData.id);
                if (index !== -1) {
                    dataArray[index] = newData;
                }
            }
            break;
        case 'DELETE':
            if (oldData) {
                const index = dataArray.findIndex(item => item.id === oldData.id);
                if (index !== -1) {
                    dataArray.splice(index, 1);
                }
            }
            break;
    }
    
    renderCharacterPage();
}

// Full refresh from database (used as fallback)
async function refreshChar() {
    if (!currentCharacter) return;
    
    try {
        const { data, error } = await db.from('characters').select(`*, ability_scores (*), skills (*), saving_throws (*), inventory_items (*), weapons (*), spells (*), spell_slots (*), features_traits (*), currency (*), character_details (*)`).eq('id', currentCharacter.id).single();
        if (error) {
            console.error('Error refreshing character:', error);
            return;
        }
        if (data) { 
            currentCharacter = data; 
            renderCharacterPage(); 
        }
    } catch (e) {
        console.error('Exception refreshing character:', e);
    }
}

function renderCharacterPage() {
    const c = currentCharacter;
    $('#char-header-name').textContent = c.name;
    $('#char-header-subtitle').textContent = `Level ${c.level} ${c.race} ${c.class}`;
    renderStatsTab();
    renderSkillsTab();
    renderActionsTab();
    renderInventoryTab();
    renderNotesTab();
}

// ========================================
// Stats Tab
// ========================================
function renderStatsTab() {
    const c = currentCharacter;
    const abs = c.ability_scores || {};
    const pct = getHpPercent(c.current_hit_points, c.hit_point_maximum);
    const profBonus = getProfBonus(c.level);
    const pp = getPassivePerception(c);

    $('#tab-stats').innerHTML = `
        <div class="hp-section">
            <div class="hp-display-with-level">
                <div class="hp-display">
                    <div><span class="hp-current">${c.current_hit_points}</span><span class="hp-max">/${c.hit_point_maximum}</span></div>
                    ${c.temporary_hit_points > 0 ? `<span class="hp-temp">+${c.temporary_hit_points} temp</span>` : ''}
                </div>
                <div class="level-display" onclick="openLevelEditor()">
                    <div class="level-value">${c.level}</div>
                    <div class="level-label">Level</div>
                </div>
            </div>
            <div class="hp-bar-large"><div class="hp-bar-fill ${getHpClass(pct)}" style="width:${pct}%"></div></div>
            <div class="hp-controls">
                <button class="hp-btn damage" onclick="adjustHP(-1)">−</button>
                <input type="number" class="hp-input" id="hp-delta" placeholder="±">
                <button class="hp-btn heal" onclick="adjustHP(1)">+</button>
                <button class="btn-secondary btn-small" onclick="applyHPDelta()">Apply</button>
            </div>
            <div class="rest-buttons">
                <button class="btn-rest short" onclick="takeShortRest()" title="Short Rest">Short Rest</button>
                <button class="btn-rest long" onclick="takeLongRest()" title="Long Rest">Long Rest</button>
            </div>
            <div class="hp-extras">
                <div class="temp-hp-section">
                    <label>Temp HP</label>
                    <input type="number" class="temp-hp-input" value="${c.temporary_hit_points}" onchange="updateTempHP(this.value)">
                </div>
                <div class="death-saves-section ${c.current_hit_points === 0 ? 'visible' : ''}">
                    <div class="death-saves-row">
                        <span>Save</span>
                        ${[1,2,3].map(i => `<div class="death-save-marker success ${i <= c.death_save_successes ? 'filled' : ''}" onclick="toggleDeathSave('successes', ${i})"></div>`).join('')}
                    </div>
                    <div class="death-saves-row">
                        <span>Fail</span>
                        ${[1,2,3].map(i => `<div class="death-save-marker failure ${i <= c.death_save_failures ? 'filled' : ''}" onclick="toggleDeathSave('failures', ${i})"></div>`).join('')}
                    </div>
                </div>
            </div>
        </div>

        <div class="stats-section">
            <div class="section-label">Ability Scores</div>
            <div class="ability-scores-display">
                ${ABILITIES.map(a => {
                    const score = getAbilityScore(abs, a);
                    return `<div class="ability-score-box">
                        <span class="label">${a.toUpperCase()}</span>
                        <span class="score">${score}</span>
                        <span class="modifier">${formatMod(getModifier(score))}</span>
                    </div>`;
                }).join('')}
            </div>
        </div>

        <div class="stats-section">
            <div class="section-label">Combat</div>
            <div class="combat-stats-grid">
                <div class="combat-stat"><span class="value">${c.armor_class}</span><span class="label">AC</span></div>
                <div class="combat-stat"><span class="value">${formatMod(c.initiative_bonus)}</span><span class="label">Initiative</span></div>
                <div class="combat-stat"><span class="value">${c.speed}</span><span class="label">Speed</span></div>
                <div class="combat-stat"><span class="value">${formatMod(profBonus)}</span><span class="label">Prof</span></div>
            </div>
            <div class="combat-stats-grid" style="grid-template-columns: 1fr;">
                <div class="combat-stat"><span class="value">${pp}</span><span class="label">Passive Perception</span></div>
            </div>
        </div>

        <div class="stats-section">
            <div class="section-label">Saving Throws</div>
            <div class="saving-throws-grid">
                ${(() => {
                    // Use saving_throws from DB if available, otherwise generate from abilities
                    const saves = c.saving_throws && c.saving_throws.length > 0 
                        ? c.saving_throws 
                        : ABILITIES.map(a => ({ ability: a, proficient: false, id: null }));
                    return saves.map(s => {
                        const mod = getModifier(getAbilityScore(abs, s.ability)) + (s.proficient ? profBonus : 0);
                        return `<div class="save-row ${s.proficient ? 'proficient' : ''}" ${s.id ? `onclick="toggleSaveProficiency('${s.id}', ${s.proficient})"` : ''}>
                            <span class="name"><span class="prof-indicator"></span>${s.ability.toUpperCase()}</span>
                            <span class="modifier">${formatMod(mod)}</span>
                        </div>`;
                    }).join('');
                })()}
            </div>
        </div>

        <div class="stats-section conditions-section">
            <div class="section-label">Conditions</div>
            <div class="conditions-grid">
                ${CONDITIONS.map(cond => `<span class="condition-tag ${(c.active_conditions || []).includes(cond) ? 'active' : ''}" onclick="toggleCondition('${cond}')">${cond}</span>`).join('')}
            </div>
        </div>
    `;
}

// HP Functions - with optimistic UI updates
window.adjustHP = async function(delta) {
    const newHP = Math.max(0, Math.min(currentCharacter.hit_point_maximum, currentCharacter.current_hit_points + delta));
    // Optimistic update
    currentCharacter.current_hit_points = newHP;
    renderCharacterPage();
    // Database update
    await db.from('characters').update({ current_hit_points: newHP }).eq('id', currentCharacter.id);
};

window.applyHPDelta = async function() {
    const delta = parseInt($('#hp-delta').value) || 0;
    if (delta === 0) return;
    const newHP = Math.max(0, Math.min(currentCharacter.hit_point_maximum, currentCharacter.current_hit_points + delta));
    // Optimistic update
    currentCharacter.current_hit_points = newHP;
    renderCharacterPage();
    $('#hp-delta').value = '';
    // Database update
    await db.from('characters').update({ current_hit_points: newHP }).eq('id', currentCharacter.id);
};

window.updateTempHP = async function(val) {
    const newTempHP = Math.max(0, parseInt(val) || 0);
    // Optimistic update
    currentCharacter.temporary_hit_points = newTempHP;
    // Note: Don't re-render to avoid losing input focus
    // Database update
    await db.from('characters').update({ temporary_hit_points: newTempHP }).eq('id', currentCharacter.id);
};

window.toggleDeathSave = async function(type, num) {
    const field = type === 'successes' ? 'death_save_successes' : 'death_save_failures';
    const current = currentCharacter[field];
    const newVal = current >= num ? num - 1 : num;
    // Optimistic update
    currentCharacter[field] = newVal;
    renderCharacterPage();
    // Database update
    await db.from('characters').update({ [field]: newVal }).eq('id', currentCharacter.id);
};

window.toggleSaveProficiency = async function(id, current) {
    // Optimistic update
    const save = currentCharacter.saving_throws?.find(s => s.id === id);
    if (save) {
        save.proficient = !current;
        renderCharacterPage();
    }
    // Database update
    await db.from('saving_throws').update({ proficient: !current }).eq('id', id);
};

window.toggleCondition = async function(condition) {
    const current = currentCharacter.active_conditions || [];
    const updated = current.includes(condition) ? current.filter(c => c !== condition) : [...current, condition];
    // Optimistic update
    currentCharacter.active_conditions = updated;
    renderCharacterPage();
    // Database update
    await db.from('characters').update({ active_conditions: updated }).eq('id', currentCharacter.id);
};

// Rest functions - reset feature usage tracking
window.takeShortRest = async function() {
    // Reset features that recharge on short rest
    const features = currentCharacter.features_traits || [];
    const updatedFeatures = features.map(f => {
        if (f.uses_per_rest === 'short' || f.uses_per_rest === 'short_or_long') {
            return { ...f, uses_remaining: f.uses_total || 1 };
        }
        return f;
    });
    
    // Optimistic update
    currentCharacter.features_traits = updatedFeatures;
    renderCharacterPage();
    
    // Update each feature in the database
    for (const f of updatedFeatures) {
        if (f.uses_per_rest === 'short' || f.uses_per_rest === 'short_or_long') {
            await db.from('features_traits').update({ uses_remaining: f.uses_total || 1 }).eq('id', f.id);
        }
    }
};

window.takeLongRest = async function() {
    const c = currentCharacter;
    
    // Reset HP to maximum
    const newHP = c.hit_point_maximum;
    
    // Reset features that recharge on short or long rest
    const features = c.features_traits || [];
    const updatedFeatures = features.map(f => {
        if (f.uses_per_rest) {
            return { ...f, uses_remaining: f.uses_total || 1 };
        }
        return f;
    });
    
    // Reset spell slots
    const slots = c.spell_slots || [];
    const updatedSlots = slots.map(s => ({ ...s, used: 0 }));
    
    // Reset death saves
    const updates = {
        current_hit_points: newHP,
        temporary_hit_points: 0,
        death_save_successes: 0,
        death_save_failures: 0
    };
    
    // Optimistic update
    Object.assign(currentCharacter, updates);
    currentCharacter.features_traits = updatedFeatures;
    currentCharacter.spell_slots = updatedSlots;
    renderCharacterPage();
    
    // Database updates
    await db.from('characters').update(updates).eq('id', c.id);
    
    for (const f of updatedFeatures) {
        if (f.uses_per_rest) {
            await db.from('features_traits').update({ uses_remaining: f.uses_total || 1 }).eq('id', f.id);
        }
    }
    
    for (const s of updatedSlots) {
        await db.from('spell_slots').update({ used: 0 }).eq('id', s.id);
    }
};

// ========================================
// Level Editor
// ========================================
window.openLevelEditor = function() {
    const modal = $('#level-modal');
    $('#new-level').value = currentCharacter.level;
    modal.classList.remove('hidden');
};

window.closeLevelModal = function() {
    $('#level-modal').classList.add('hidden');
};

async function handleLevelUpdate(e) {
    e.preventDefault();
    
    const newLevel = parseInt($('#new-level').value);
    if (!newLevel || newLevel < 1 || newLevel > 20) {
        alert('Please enter a valid level between 1 and 20');
        return;
    }
    
    if (newLevel === currentCharacter.level) {
        closeLevelModal();
        return;
    }
    
    const c = currentCharacter;
    const oldLevel = c.level;
    const cls = c.class;
    const hd = HIT_DICE[cls] || 8;
    const conMod = getModifier(getAbilityScore(c.ability_scores, 'con'));
    
    // Calculate new proficiency bonus
    const newProfBonus = getProfBonus(newLevel);
    
    // Calculate new hit dice
    const newHitDiceTotal = `${newLevel}d${hd}`;
    const newHitDiceRemaining = newLevel;
    
    // Calculate new max HP (optional - could keep current or recalculate)
    // For leveling up, we'll add the average HP per level
    let newMaxHP = c.hit_point_maximum;
    if (newLevel > oldLevel) {
        // Leveling up - add HP for each new level
        const levelsGained = newLevel - oldLevel;
        const hpPerLevel = Math.floor(hd / 2) + 1 + conMod;
        newMaxHP += levelsGained * hpPerLevel;
    } else {
        // Leveling down - recalculate HP from scratch
        newMaxHP = calcHP(cls, newLevel, conMod);
    }
    
    // Ensure current HP doesn't exceed new max
    const newCurrentHP = Math.min(c.current_hit_points, newMaxHP);
    
    // Update character
    const updates = {
        level: newLevel,
        proficiency_bonus: newProfBonus,
        hit_dice_total: newHitDiceTotal,
        hit_dice_remaining: newHitDiceRemaining,
        hit_point_maximum: newMaxHP,
        current_hit_points: newCurrentHP
    };
    
    // Optimistic update
    Object.assign(currentCharacter, updates);
    renderCharacterPage();
    closeLevelModal();
    
    // Database update
    await db.from('characters').update(updates).eq('id', currentCharacter.id);
}

// ========================================
// Skills Tab
// ========================================
function renderSkillsTab() {
    const c = currentCharacter;
    const abs = c.ability_scores || {};
    const profBonus = getProfBonus(c.level);
    
    // Calculate all skill modifiers to find top 2
    const skillMods = Object.entries(SKILLS).map(([name, ab]) => {
        const skill = c.skills?.find(s => s.skill_name === name);
        const mod = getModifier(getAbilityScore(abs, ab)) + (skill?.proficient ? profBonus : 0);
        return { name, mod };
    });
    
    // Sort by modifier descending and get top 2 skill names
    const sortedSkills = [...skillMods].sort((a, b) => b.mod - a.mod);
    const topSkills = new Set([sortedSkills[0]?.name, sortedSkills[1]?.name]);

    $('#tab-skills').innerHTML = `
        <div class="skills-list">
            ${Object.entries(SKILLS).map(([name, ab]) => {
                const skill = c.skills?.find(s => s.skill_name === name);
                const mod = getModifier(getAbilityScore(abs, ab)) + (skill?.proficient ? profBonus : 0);
                const isTopSkill = topSkills.has(name);
                return `<div class="skill-row ${skill?.proficient ? 'proficient' : ''}" onclick="toggleSkillProficiency('${skill?.id}', ${skill?.proficient || false})">
                    <div class="skill-info">
                        <div class="skill-prof-markers"><span class="skill-prof-marker"></span></div>
                        <span class="skill-name">${name}</span>
                        <span class="skill-ability">${ab.toUpperCase()}</span>
                        ${isTopSkill ? '<span class="top-skill-indicator"></span>' : ''}
                    </div>
                    <span class="skill-modifier">${formatMod(mod)}</span>
                </div>`;
            }).join('')}
        </div>
    `;
}

window.toggleSkillProficiency = async function(id, prof) {
    // Simple toggle
    const newProf = !prof;
    
    // Optimistic update
    const skill = currentCharacter.skills?.find(s => s.id === id);
    if (skill) {
        skill.proficient = newProf;
        renderCharacterPage();
    }
    
    // Database update
    await db.from('skills').update({ proficient: newProf }).eq('id', id);
};

// ========================================
// Actions Tab
// ========================================
function renderActionsTab() {
    const c = currentCharacter;
    const weapons = c.weapons || [];
    const spells = c.spells || [];
    const slots = c.spell_slots || [];
    const features = c.features_traits || [];
    
    // Filter features that are bonus actions (those with is_bonus_action flag or "bonus action" in description)
    const bonusActionFeatures = features.filter(f => 
        f.is_bonus_action || 
        (f.description && f.description.toLowerCase().includes('bonus action'))
    );

    const groupedSpells = spells.reduce((acc, s) => { (acc[s.level] = acc[s.level] || []).push(s); return acc; }, {});

    $('#tab-actions').innerHTML = `
        <div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Attacks</span>
                <button class="add-btn" onclick="openAddModal('weapon')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="weapons-list">
                ${weapons.length ? weapons.map(w => {
                    // Check if this weapon has usage tracking
                    const hasUsage = w.uses_total && w.uses_total > 0;
                    const usesRemaining = w.uses_remaining ?? w.uses_total ?? 0;
                    return `<div class="weapon-card clickable" onclick="showWeaponDetail('${w.id}')">
                    <div class="weapon-info"><h3>${escapeHtml(w.name)}</h3><p>${w.damage_type || ''} ${w.properties || ''}</p></div>
                    <div class="weapon-stats">
                        <div class="weapon-stat"><span class="value">${formatMod(w.attack_bonus)}</span><span class="label">Hit</span></div>
                        <div class="weapon-stat"><span class="value">${w.damage}</span><span class="label">Dmg</span></div>
                    </div>
                    <button class="weapon-delete" onclick="event.stopPropagation(); deleteWeapon('${w.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                </div>`;}).join('') : '<div class="empty-list">No attacks added</div>'}
            </div>
        </div>

        <div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Bonus Actions</span>
                <button class="add-btn" onclick="openAddModal('bonusaction')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="bonus-actions-list">
                ${bonusActionFeatures.length ? bonusActionFeatures.map(f => {
                    const hasUsage = f.uses_total && f.uses_total > 0;
                    const usesRemaining = f.uses_remaining ?? f.uses_total ?? 0;
                    return `<div class="action-card clickable" onclick="showBonusActionDetail('${f.id}')">
                        <div class="action-info">
                            <h3>${escapeHtml(f.name)}</h3>
                            <p>${f.source ? `<span class="action-source">${escapeHtml(f.source)}</span>` : ''}${f.uses_per_rest ? `<span class="action-rest-type">${f.uses_per_rest === 'short' ? 'Short Rest' : 'Long Rest'}</span>` : ''}</p>
                        </div>
                        ${hasUsage ? `<div class="action-uses">
                            ${Array(f.uses_total).fill(0).map((_, i) => `<div class="action-use-marker ${i < usesRemaining ? '' : 'used'}" onclick="event.stopPropagation(); toggleFeatureUse('${f.id}', ${i}, ${usesRemaining}, ${f.uses_total})"></div>`).join('')}
                        </div>` : ''}
                    </div>`;
                }).join('') : '<div class="empty-list">No bonus actions. Add features that use bonus actions from the Notes tab.</div>'}
            </div>
        </div>

        ${slots.length ? `<div class="actions-section">
            <span class="section-label">Spell Slots</span>
            <div class="spell-slots-grid">
                ${slots.sort((a,b) => a.slot_level - b.slot_level).map(s => `<div class="spell-slot-group">
                    <span class="level">Lvl ${s.slot_level}</span>
                    <div class="spell-slot-markers">
                        ${Array(s.total).fill(0).map((_, i) => `<div class="spell-slot-marker ${i < s.used ? 'used' : ''}" onclick="toggleSpellSlot('${s.id}', ${i}, ${s.used}, ${s.total})"></div>`).join('')}
                    </div>
                </div>`).join('')}
            </div>
        </div>` : ''}

        <div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Spells</span>
                <button class="add-btn" onclick="openAddModal('spell')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="spells-list">
                ${Object.keys(groupedSpells).length ? Object.entries(groupedSpells).sort((a,b) => a[0] - b[0]).map(([lvl, list]) => `
                    <div class="spell-level-group">
                        <div class="spell-level-header">${lvl === '0' ? 'Cantrips' : `Level ${lvl}`}</div>
                        ${list.map(s => `<div class="spell-card clickable" onclick="showSpellDetail('${s.id}')">
                            <div class="spell-info">
                                ${s.level > 0 ? `<div class="spell-prepared-toggle ${s.prepared ? 'prepared' : ''}" onclick="event.stopPropagation(); toggleSpellPrepared('${s.id}', ${s.prepared})"></div>` : ''}
                                <span class="spell-name">${escapeHtml(s.name)}</span>
                                ${s.school ? `<span class="spell-school">${s.school}</span>` : ''}
                            </div>
                            <button class="spell-delete" onclick="event.stopPropagation(); deleteSpell('${s.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                        </div>`).join('')}
                    </div>
                `).join('') : '<div class="empty-list">No spells added</div>'}
            </div>
        </div>
    `;
}

window.deleteWeapon = async id => { 
    // Optimistic update
    if (currentCharacter.weapons) {
        currentCharacter.weapons = currentCharacter.weapons.filter(w => w.id !== id);
        renderCharacterPage();
    }
    await db.from('weapons').delete().eq('id', id); 
};

window.deleteSpell = async id => { 
    // Optimistic update
    if (currentCharacter.spells) {
        currentCharacter.spells = currentCharacter.spells.filter(s => s.id !== id);
        renderCharacterPage();
    }
    await db.from('spells').delete().eq('id', id); 
};

window.toggleSpellPrepared = async (id, curr) => { 
    // Optimistic update
    const spell = currentCharacter.spells?.find(s => s.id === id);
    if (spell) {
        spell.prepared = !curr;
        renderCharacterPage();
    }
    await db.from('spells').update({ prepared: !curr }).eq('id', id); 
};

window.toggleSpellSlot = async (id, idx, used, total) => {
    const newUsed = idx < used ? idx : Math.min(total, idx + 1);
    // Optimistic update
    const slot = currentCharacter.spell_slots?.find(s => s.id === id);
    if (slot) {
        slot.used = newUsed;
        renderCharacterPage();
    }
    await db.from('spell_slots').update({ used: newUsed }).eq('id', id);
};

// ========================================
// Inventory Tab
// ========================================
function renderInventoryTab() {
    const c = currentCharacter;
    const currency = c.currency || {};
    const items = c.inventory_items || [];

    $('#tab-inventory').innerHTML = `
        <div class="section-label">Currency</div>
        <div class="currency-grid">
            ${['copper', 'silver', 'electrum', 'gold', 'platinum'].map(type => `
                <div class="currency-item">
                    <label>${type.slice(0, 2).toUpperCase()}</label>
                    <input type="number" value="${currency[type] || 0}" onchange="updateCurrency('${type}', this.value)">
                </div>
            `).join('')}
        </div>

        <div class="section-header-row" style="margin-top: var(--space-lg);">
            <span class="section-label">Items</span>
            <button class="add-btn" onclick="openAddModal('item')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
        </div>
        <div class="items-list">
            ${items.length ? items.map(i => `<div class="item-card clickable" onclick="showItemDetail('${i.id}')">
                <div class="item-info"><h3>${escapeHtml(i.name)}</h3><p>${i.item_type || 'Item'}${i.weight ? ` • ${i.weight} lb` : ''}</p></div>
                <div class="item-quantity">
                    <button onclick="event.stopPropagation(); updateItemQty('${i.id}', ${i.quantity - 1})">−</button>
                    <span>${i.quantity}</span>
                    <button onclick="event.stopPropagation(); updateItemQty('${i.id}', ${i.quantity + 1})">+</button>
                </div>
                <button class="item-delete" onclick="event.stopPropagation(); deleteItem('${i.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
            </div>`).join('') : '<div class="empty-list">No items added</div>'}
        </div>
    `;
}

window.updateCurrency = async (type, val) => { 
    const newVal = Math.max(0, parseInt(val) || 0);
    // Optimistic update
    if (currentCharacter.currency) {
        currentCharacter.currency[type] = newVal;
        // Note: Don't re-render to avoid losing input focus
    }
    await db.from('currency').update({ [type]: newVal }).eq('character_id', currentCharacter.id); 
};

window.updateItemQty = async (id, qty) => { 
    if (qty < 1) {
        deleteItem(id);
    } else {
        // Optimistic update
        const item = currentCharacter.inventory_items?.find(i => i.id === id);
        if (item) {
            item.quantity = qty;
            renderCharacterPage();
        }
        await db.from('inventory_items').update({ quantity: qty }).eq('id', id); 
    }
};

window.deleteItem = async id => { 
    // Optimistic update
    if (currentCharacter.inventory_items) {
        currentCharacter.inventory_items = currentCharacter.inventory_items.filter(i => i.id !== id);
        renderCharacterPage();
    }
    await db.from('inventory_items').delete().eq('id', id); 
};

// ========================================
// Notes Tab
// ========================================
function renderNotesTab() {
    const c = currentCharacter;
    const features = c.features_traits || [];
    const details = c.character_details || {};

    $('#tab-notes').innerHTML = `
        <div class="notes-section">
            <div class="section-header-row">
                <h3>Features & Traits</h3>
                <button class="add-btn" onclick="openAddModal('feature')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="features-list">
                ${features.length ? features.map(f => `<div class="feature-card clickable" onclick="showFeatureDetail('${f.id}')">
                    <div class="feature-header">
                        <div><h4>${escapeHtml(f.name)}</h4>${f.source ? `<span class="feature-source">${escapeHtml(f.source)}</span>` : ''}</div>
                        <button class="feature-delete" onclick="event.stopPropagation(); deleteFeature('${f.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                    </div>
                    ${f.description ? `<p class="feature-description">${escapeHtml(f.description).substring(0, 150)}${f.description.length > 150 ? '...' : ''}</p>` : ''}
                </div>`).join('') : '<div class="empty-list">No features added</div>'}
            </div>
        </div>

        <div class="notes-section">
            <h3>Character Details</h3>
            <div class="details-grid">
                ${['age', 'height', 'weight', 'eyes', 'skin', 'hair'].map(f => `
                    <div class="detail-item">
                        <label>${f.charAt(0).toUpperCase() + f.slice(1)}</label>
                        <input type="text" value="${details[f] || ''}" onchange="updateDetail('${f}', this.value)">
                    </div>
                `).join('')}
            </div>
        </div>

        <div class="notes-section">
            <h3>Personality Traits</h3>
            <textarea class="notes-textarea" placeholder="Enter personality traits..." onchange="updateDetail('personality_traits', this.value)">${details.personality_traits || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Ideals</h3>
            <textarea class="notes-textarea" placeholder="Enter ideals..." onchange="updateDetail('ideals', this.value)">${details.ideals || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Bonds</h3>
            <textarea class="notes-textarea" placeholder="Enter bonds..." onchange="updateDetail('bonds', this.value)">${details.bonds || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Flaws</h3>
            <textarea class="notes-textarea" placeholder="Enter flaws..." onchange="updateDetail('flaws', this.value)">${details.flaws || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Backstory</h3>
            <textarea class="notes-textarea" style="min-height: 200px;" placeholder="Enter backstory..." onchange="updateDetail('backstory', this.value)">${details.backstory || ''}</textarea>
        </div>

        <div class="notes-section">
            <h3>Notes</h3>
            <textarea class="notes-textarea" placeholder="Freeform notes..." onchange="updateCharacterNotes(this.value)">${c.notes || ''}</textarea>
        </div>
    `;
}

window.deleteFeature = async id => { 
    // Optimistic update
    if (currentCharacter.features_traits) {
        currentCharacter.features_traits = currentCharacter.features_traits.filter(f => f.id !== id);
        renderCharacterPage();
    }
    await db.from('features_traits').delete().eq('id', id); 
};

window.updateDetail = async (field, val) => { 
    // Optimistic update
    if (currentCharacter.character_details) {
        currentCharacter.character_details[field] = val;
        // Note: Don't re-render to avoid losing input focus
    }
    await db.from('character_details').update({ [field]: val }).eq('character_id', currentCharacter.id); 
};

window.updateCharacterNotes = async val => { 
    // Optimistic update
    currentCharacter.notes = val;
    // Note: Don't re-render to avoid losing input focus
    await db.from('characters').update({ notes: val }).eq('id', currentCharacter.id); 
};

// ========================================
// Detail Modal - View item/spell/weapon/feature details
// ========================================
window.showDetailModal = function(title, content) {
    // Create or get detail modal
    let modal = $('#detail-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'detail-modal';
        modal.className = 'modal hidden';
        modal.innerHTML = `
            <div class="modal-backdrop" onclick="closeDetailModal()"></div>
            <div class="modal-content detail-modal-content">
                <h2 id="detail-modal-title"></h2>
                <div id="detail-modal-body"></div>
                <div class="modal-actions">
                    <button class="btn-secondary" onclick="closeDetailModal()">Close</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }
    
    $('#detail-modal-title').textContent = title;
    $('#detail-modal-body').innerHTML = content;
    modal.classList.remove('hidden');
};

window.closeDetailModal = function() {
    const modal = $('#detail-modal');
    if (modal) modal.classList.add('hidden');
};

window.showSpellDetail = function(id) {
    const spell = currentCharacter.spells?.find(s => s.id === id);
    if (!spell) return;
    
    const content = `
        <div class="detail-grid">
            <div class="detail-row"><strong>Level:</strong> ${spell.level === 0 ? 'Cantrip' : spell.level}</div>
            ${spell.school ? `<div class="detail-row"><strong>School:</strong> ${spell.school}</div>` : ''}
            ${spell.casting_time ? `<div class="detail-row"><strong>Casting Time:</strong> ${spell.casting_time}</div>` : ''}
            ${spell.range ? `<div class="detail-row"><strong>Range:</strong> ${spell.range}</div>` : ''}
            ${spell.components ? `<div class="detail-row"><strong>Components:</strong> ${spell.components}</div>` : ''}
            ${spell.duration ? `<div class="detail-row"><strong>Duration:</strong> ${spell.duration}</div>` : ''}
        </div>
        ${spell.description ? `<div class="detail-description">${escapeHtml(spell.description).replace(/\n/g, '<br>')}</div>` : ''}
    `;
    
    showDetailModal(spell.name, content);
};

window.showWeaponDetail = function(id) {
    const weapon = currentCharacter.weapons?.find(w => w.id === id);
    if (!weapon) return;
    
    // Check if this is a special weapon like Unarmed Strike with special options
    const specialAttack = SPECIAL_ATTACKS.find(s => s.name === weapon.name);
    const abs = currentCharacter.ability_scores || {};
    const strMod = getModifier(getAbilityScore(abs, 'str'));
    const profBonus = getProfBonus(currentCharacter.level);
    const grappleDC = 8 + strMod + profBonus;
    
    let specialOptionsHtml = '';
    if (specialAttack && specialAttack.special_options) {
        specialOptionsHtml = `
            <div class="detail-section">
                <div class="detail-section-label">Options</div>
                ${specialAttack.special_options.map(opt => `
                    <div class="special-option">
                        <div class="special-option-header">${opt.name}</div>
                        <div class="special-option-desc">${opt.description.replace(/\n/g, '<br>')}</div>
                        ${opt.name === 'Grapple' || opt.name === 'Shove' ? `<div class="special-option-dc"><strong>DC:</strong> ${grappleDC}</div>` : ''}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    const content = `
        <div class="detail-grid">
            <div class="detail-row"><strong>Attack Bonus:</strong> ${formatMod(weapon.attack_bonus)}</div>
            <div class="detail-row"><strong>Damage:</strong> ${weapon.damage}</div>
            ${weapon.damage_type ? `<div class="detail-row"><strong>Damage Type:</strong> ${weapon.damage_type}</div>` : ''}
            ${weapon.properties ? `<div class="detail-row"><strong>Properties:</strong> ${weapon.properties}</div>` : ''}
        </div>
        ${specialOptionsHtml}
    `;
    
    showDetailModal(weapon.name, content);
};

window.showBonusActionDetail = function(id) {
    const feature = currentCharacter.features_traits?.find(f => f.id === id);
    if (!feature) return;
    
    let usageHtml = '';
    if (feature.uses_total && feature.uses_total > 0) {
        const usesRemaining = feature.uses_remaining ?? feature.uses_total;
        usageHtml = `
            <div class="detail-usage">
                <strong>Uses:</strong> ${usesRemaining}/${feature.uses_total}
                ${feature.uses_per_rest ? `<span class="usage-rest-type">(Recharges on ${feature.uses_per_rest === 'short' ? 'Short or Long' : 'Long'} Rest)</span>` : ''}
            </div>
        `;
    }
    
    const content = `
        ${feature.source ? `<div class="detail-source">Source: ${escapeHtml(feature.source)}</div>` : ''}
        ${usageHtml}
        ${feature.description ? `<div class="detail-description">${escapeHtml(feature.description).replace(/\n/g, '<br>')}</div>` : '<p class="empty-list">No description available.</p>'}
    `;
    
    showDetailModal(feature.name, content);
};

window.toggleFeatureUse = async function(id, idx, used, total) {
    // Similar to spell slot toggle - clicking fills/unfills
    const newUsed = idx < used ? idx : Math.min(total, idx + 1);
    const newRemaining = total - newUsed;
    
    // Optimistic update
    const feature = currentCharacter.features_traits?.find(f => f.id === id);
    if (feature) {
        feature.uses_remaining = newRemaining;
        renderCharacterPage();
    }
    
    // Database update
    await db.from('features_traits').update({ uses_remaining: newRemaining }).eq('id', id);
};

window.showItemDetail = function(id) {
    const item = currentCharacter.inventory_items?.find(i => i.id === id);
    if (!item) return;
    
    const content = `
        <div class="detail-grid">
            <div class="detail-row"><strong>Type:</strong> ${item.item_type || 'Gear'}</div>
            <div class="detail-row"><strong>Quantity:</strong> ${item.quantity}</div>
            ${item.weight ? `<div class="detail-row"><strong>Weight:</strong> ${item.weight} lb</div>` : ''}
        </div>
        ${item.description ? `<div class="detail-description">${escapeHtml(item.description).replace(/\n/g, '<br>')}</div>` : ''}
    `;
    
    showDetailModal(item.name, content);
};

window.showFeatureDetail = function(id) {
    const feature = currentCharacter.features_traits?.find(f => f.id === id);
    if (!feature) return;
    
    const content = `
        ${feature.source ? `<div class="detail-source">Source: ${escapeHtml(feature.source)}</div>` : ''}
        ${feature.description ? `<div class="detail-description">${escapeHtml(feature.description).replace(/\n/g, '<br>')}</div>` : '<p class="empty-list">No description available.</p>'}
    `;
    
    showDetailModal(feature.name, content);
};

// ========================================
// Add Modal with API Search
// ========================================
let addModalType = null;
let selectedApiItem = null;
let selectedApiEndpoint = null;

window.openAddModal = function(type) {
    addModalType = type;
    selectedApiItem = null;
    selectedApiEndpoint = null;
    const modal = $('#add-item-modal');
    const title = $('#add-modal-title');
    const fields = $('#add-modal-fields');

    const configs = {
        weapon: { 
            title: 'Add Weapon', 
            apiEndpoint: 'equipment',
            specialItems: SPECIAL_ATTACKS,
            apiFilter: item => item.equipment_category === 'Weapon' || item.url?.includes('weapon'),
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D weapons or type custom...' },
                { name: 'attack_bonus', label: 'Attack Bonus', type: 'number', value: 0 },
                { name: 'damage', label: 'Damage', type: 'text', placeholder: '1d8+3' },
                { name: 'damage_type', label: 'Damage Type', type: 'text', placeholder: 'Slashing' },
                { name: 'properties', label: 'Properties', type: 'text', placeholder: 'Versatile, Finesse' }
            ]
        },
        spell: { 
            title: 'Add Spell', 
            apiEndpoint: 'spells',
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D spells...' },
                { name: 'level', label: 'Level (0 = cantrip)', type: 'number', value: 0 },
                { name: 'school', label: 'School', type: 'text', placeholder: 'Evocation' },
                { name: 'casting_time', label: 'Casting Time', type: 'text', placeholder: '1 action' },
                { name: 'range', label: 'Range', type: 'text', placeholder: '120 feet' },
                { name: 'components', label: 'Components', type: 'text', placeholder: 'V, S, M' },
                { name: 'duration', label: 'Duration', type: 'text', placeholder: 'Instantaneous' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        },
        item: { 
            title: 'Add Item', 
            apiEndpoint: 'equipment',
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D equipment...' },
                { name: 'quantity', label: 'Quantity', type: 'number', value: 1 },
                { name: 'item_type', label: 'Type', type: 'select', options: ['Gear', 'Weapon', 'Armor', 'Consumable', 'Treasure', 'Other'] },
                { name: 'weight', label: 'Weight (lb)', type: 'number' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        },
        feature: { 
            title: 'Add Feature/Trait/Feat', 
            apiEndpoints: ['features', 'traits', 'feats'],
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search class features, racial traits, feats...' },
                { name: 'source', label: 'Source', type: 'text', placeholder: 'Auto-detected or enter manually' },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        },
        bonusaction: { 
            title: 'Add Bonus Action', 
            apiEndpoints: ['features', 'traits', 'feats'],
            specialItems: COMMON_BONUS_ACTIONS,
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search features or add custom...' },
                { name: 'source', label: 'Source', type: 'text', placeholder: 'Class, Race, Feat, etc.' },
                { name: 'uses_total', label: 'Uses (0 = unlimited)', type: 'number', value: 0 },
                { name: 'uses_per_rest', label: 'Recharges On', type: 'select', options: [['', 'N/A'], ['short', 'Short Rest'], ['long', 'Long Rest']] },
                { name: 'description', label: 'Description', type: 'textarea' }
            ]
        }
    };

    const config = configs[type];
    title.textContent = config.title;
    
    fields.innerHTML = config.fields.map(f => {
        if (f.type === 'search') {
            return `<div class="form-group">
                <label>${f.label}${f.required ? ' *' : ''}</label>
                <div class="api-search-container">
                    <input type="text" name="${f.name}" class="api-search-input" ${f.required ? 'required' : ''} placeholder="${f.placeholder || ''}" autocomplete="off">
                    <div class="api-search-results hidden"></div>
                </div>
            </div>`;
        }
        if (f.type === 'textarea') {
            return `<div class="form-group"><label>${f.label}</label><textarea name="${f.name}" class="notes-textarea" style="min-height:80px;" placeholder="${f.placeholder || ''}"></textarea></div>`;
        }
        if (f.type === 'select') {
            // Handle options that can be either strings or [value, label] arrays
            const optionsHtml = f.options.map(o => {
                if (Array.isArray(o)) {
                    return `<option value="${o[0]}">${o[1]}</option>`;
                }
                return `<option value="${o}">${o}</option>`;
            }).join('');
            return `<div class="form-group"><label>${f.label}</label><select name="${f.name}">${optionsHtml}</select></div>`;
        }
        return `<div class="form-group"><label>${f.label}${f.required ? ' *' : ''}</label><input type="${f.type}" name="${f.name}" ${f.required ? 'required' : ''} ${f.value !== undefined ? `value="${f.value}"` : ''} ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}></div>`;
    }).join('');

const searchInput = fields.querySelector('.api-search-input');
    const searchResults = fields.querySelector('.api-search-results');
    
    if (searchInput && searchResults) {
        const debouncedSearch = debounce(async (query) => {
            if (query.length < 2) {
                searchResults.classList.add('hidden');
                return;
            }
            
            searchResults.innerHTML = '<div class="api-search-loading">Searching...</div>';
            searchResults.classList.remove('hidden');
            
            let results = [];
            
            // For features, search multiple endpoints
            if (config.apiEndpoints) {
                results = await searchMultipleEndpoints(config.apiEndpoints, query);
            } else {
                const apiResults = await searchDndApi(config.apiEndpoint, query);
                results = apiResults.map(r => ({ ...r, _endpoint: config.apiEndpoint }));
            }
            
            // Add special items for weapons (like Unarmed Strike)
            if (config.specialItems) {
                const matchingSpecial = config.specialItems.filter(s => 
                    s.name.toLowerCase().includes(query.toLowerCase())
                ).map(s => ({ ...s, _isSpecial: true }));
                results = [...matchingSpecial, ...results];
            }
            
            if (results.length === 0) {
                searchResults.innerHTML = '<div class="api-search-empty">No results found. You can still add a custom entry.</div>';
            } else {
                searchResults.innerHTML = results.slice(0, 15).map(r => {
                    let badge = '';
                    if (r._isSpecial) {
                        badge = '<span class="search-badge special">Special</span>';
                    } else if (r._endpoint === 'features') {
                        badge = '<span class="search-badge feature">Class</span>';
                    } else if (r._endpoint === 'traits') {
                        badge = '<span class="search-badge trait">Race</span>';
                    } else if (r._endpoint === 'feats') {
                        badge = '<span class="search-badge feat">Feat</span>';
                    }
                    
                    return `<div class="api-search-result" data-url="${r.url || ''}" data-name="${escapeHtml(r.name)}" data-endpoint="${r._endpoint || ''}" data-special="${r._isSpecial ? 'true' : 'false'}">
                        ${escapeHtml(r.name)}${badge}
                    </div>`;
                }).join('');
                
                // Add click handlers to results
                searchResults.querySelectorAll('.api-search-result').forEach(result => {
                    result.addEventListener('click', async () => {
                        const url = result.dataset.url;
                        const name = result.dataset.name;
                        const endpoint = result.dataset.endpoint;
                        const isSpecial = result.dataset.special === 'true';
                        
                        searchInput.value = name;
                        searchResults.classList.add('hidden');
                        
                        if (isSpecial) {
                            const specialItem = config.specialItems.find(s => s.name === name);
                            if (specialItem) {
                                selectedApiItem = specialItem;
                                selectedApiEndpoint = 'special';
                                populateFormFromSpecial(type, specialItem, fields);
                            }
                        } else if (url) {
                            const details = await getDndApiDetails(url);
                            if (details) {
                                selectedApiItem = details;
                                selectedApiEndpoint = endpoint;
                                populateFormFromApi(type, details, fields, endpoint);
                            }
                        }
                    });
                });
            }
        }, 300);
        
        searchInput.addEventListener('input', (e) => {
            selectedApiItem = null;
            selectedApiEndpoint = null;
            debouncedSearch(e.target.value);
        });
        
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.length >= 2) {
                searchResults.classList.remove('hidden');
            }
        });
        
        // Close search results when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.api-search-container')) {
                searchResults.classList.add('hidden');
            }
        });
    }

    modal.classList.remove('hidden');
};

function populateFormFromSpecial(type, specialItem, fieldsContainer) {
    const form = fieldsContainer.closest('form');
    
    if (type === 'weapon') {
        const strMod = currentCharacter ? getModifier(getAbilityScore(currentCharacter.ability_scores, 'str')) : 0;
        const profBonus = currentCharacter ? getProfBonus(currentCharacter.level) : 2;
        
        let damage = specialItem.damage || '';
        if (damage.includes('STR')) {
            if (strMod >= 0) {
                damage = damage.replace('+STR', `+${strMod}`).replace('STR', `+${strMod}`);
            } else {
                damage = damage.replace('+STR', strMod.toString()).replace('STR', strMod.toString());
            }
        }
        
        if (form.querySelector('[name="attack_bonus"]')) form.querySelector('[name="attack_bonus"]').value = strMod + profBonus;
        if (form.querySelector('[name="damage"]')) form.querySelector('[name="damage"]').value = damage;
        if (form.querySelector('[name="damage_type"]')) form.querySelector('[name="damage_type"]').value = specialItem.damage_type || '';
        if (form.querySelector('[name="properties"]')) form.querySelector('[name="properties"]').value = specialItem.properties || '';
    } else if (type === 'bonusaction') {
        if (form.querySelector('[name="source"]')) form.querySelector('[name="source"]').value = specialItem.source || '';
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = specialItem.description || '';
    }
}

function populateFormFromApi(type, details, fieldsContainer, endpoint) {
    const form = fieldsContainer.closest('form');
    
    if (type === 'spell') {
        const formatted = formatSpellFromApi(details);
        if (form.querySelector('[name="level"]')) form.querySelector('[name="level"]').value = formatted.level;
        if (form.querySelector('[name="school"]')) form.querySelector('[name="school"]').value = formatted.school;
        if (form.querySelector('[name="casting_time"]')) form.querySelector('[name="casting_time"]').value = formatted.casting_time;
        if (form.querySelector('[name="range"]')) form.querySelector('[name="range"]').value = formatted.range;
        if (form.querySelector('[name="components"]')) form.querySelector('[name="components"]').value = formatted.components;
        if (form.querySelector('[name="duration"]')) form.querySelector('[name="duration"]').value = formatted.duration;
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    } else if (type === 'weapon') {
        const profBonus = currentCharacter ? getProfBonus(currentCharacter.level) : 2;
        const formatted = formatWeaponFromApi(details, currentCharacter?.ability_scores, profBonus);
        if (form.querySelector('[name="attack_bonus"]')) form.querySelector('[name="attack_bonus"]').value = formatted.attack_bonus;
        if (form.querySelector('[name="damage"]')) form.querySelector('[name="damage"]').value = formatted.damage;
        if (form.querySelector('[name="damage_type"]')) form.querySelector('[name="damage_type"]').value = formatted.damage_type;
        if (form.querySelector('[name="properties"]')) form.querySelector('[name="properties"]').value = formatted.properties;
    } else if (type === 'item') {
        const formatted = formatItemFromApi(details);
        if (form.querySelector('[name="item_type"]')) form.querySelector('[name="item_type"]').value = formatted.item_type;
        if (form.querySelector('[name="weight"]')) form.querySelector('[name="weight"]').value = formatted.weight || '';
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    } else if (type === 'feature') {
        const formatted = formatFeatureFromApi(details, endpoint);
        if (form.querySelector('[name="source"]')) form.querySelector('[name="source"]').value = formatted.source;
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    } else if (type === 'bonusaction') {
        const formatted = formatFeatureFromApi(details, endpoint);
        if (form.querySelector('[name="source"]')) form.querySelector('[name="source"]').value = formatted.source;
        if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = formatted.description;
    }
}

window.closeAddModal = function() {
    $('#add-item-modal').classList.add('hidden');
    $('#add-item-form').reset();
    addModalType = null;
    selectedApiItem = null;
    selectedApiEndpoint = null;
};

async function handleAddSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    data.character_id = currentCharacter.id;

    const tables = { weapon: 'weapons', spell: 'spells', item: 'inventory_items', feature: 'features_traits', bonusaction: 'features_traits' };
    const dataKeys = { weapon: 'weapons', spell: 'spells', item: 'inventory_items', feature: 'features_traits', bonusaction: 'features_traits' };
    
    const modalType = addModalType;
    const dataKey = dataKeys[modalType];
    const table = tables[modalType];
    
    // Handle numeric fields - ensure empty strings become proper defaults
    if (modalType === 'item') {
        data.quantity = parseInt(data.quantity) || 1;
        // Handle weight - empty string should become null, not cause a DB error
        data.weight = data.weight && data.weight !== '' ? parseFloat(data.weight) : null;
    }
    if (data.level !== undefined) data.level = parseInt(data.level) || 0;
    if (data.attack_bonus !== undefined) data.attack_bonus = parseInt(data.attack_bonus) || 0;
    
    if (modalType === 'weapon') {
        data.attack_bonus = parseInt(data.attack_bonus) || 0;
    }
    
    // For bonus actions, handle the special fields
    if (modalType === 'bonusaction') {
        data.is_bonus_action = true;
        data.uses_total = parseInt(data.uses_total) || 0;
        data.uses_remaining = data.uses_total;
        if (!data.uses_per_rest || data.uses_per_rest === '') {
            data.uses_per_rest = null;
        }
    }
    
    if (selectedApiItem && modalType === 'spell') {
        data.api_index = selectedApiItem.index;
    }

    closeAddModal();
    
    const tempId = 'temp_' + Date.now();
    const tempItem = { ...data, id: tempId };
    
    if (!currentCharacter[dataKey]) {
        currentCharacter[dataKey] = [];
    }
    currentCharacter[dataKey].push(tempItem);
    renderCharacterPage();

    const { data: insertedData, error } = await db.from(table).insert(data).select().single();
    
    if (error) {
        console.error('Error adding item:', error);
        currentCharacter[dataKey] = currentCharacter[dataKey].filter(item => item.id !== tempId);
        renderCharacterPage();
        alert('Failed to add item');
        return;
    }
    
    if (insertedData) {
        const index = currentCharacter[dataKey].findIndex(item => item.id === tempId);
        if (index !== -1) {
            currentCharacter[dataKey][index] = insertedData;
        }
    }
}

// ========================================
// Delete Character
// ========================================
window.openDeleteModal = function() {
    $('#delete-char-name').textContent = currentCharacter.name;
    $('#delete-modal').classList.remove('hidden');
};

window.closeDeleteModal = function() {
    $('#delete-modal').classList.add('hidden');
};

async function handleDelete() {
    await db.from('characters').delete().eq('id', currentCharacter.id);
    closeDeleteModal();
    currentCharacter = null;
    await loadCharacters();
    showPage('home-page');
}

// ========================================
// Tab Navigation
// ========================================
function initTabs() {
    $$('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            $$('.tab-content').forEach(c => c.classList.remove('active'));
            $(`#tab-${btn.dataset.tab}`).classList.add('active');
        });
    });
}

// ========================================
// Initialize App
// ========================================
async function init() {
    const hasValidSession = await validateSession();
    if (!hasValidSession) {
        console.log('No valid session found, redirecting to login...');
        return;
    }
    
    console.log('Session validated, initializing app...');
    
    initCreatePage();
    initTabs();
    
    $('#create-btn')?.addEventListener('click', () => showPage('create-page'));
    $('#refresh-btn')?.addEventListener('click', loadCharacters);
    $('#char-back-btn')?.addEventListener('click', () => { 
        try {
            if (currentRealtimeChannel) {
                db.removeChannel(currentRealtimeChannel);
                currentRealtimeChannel = null;
            }
        } catch (e) {
            console.warn('Error removing channel on back:', e);
        }
        currentCharacter = null; 
        loadCharacters(); 
        showPage('home-page');
        setupRosterRealtime();
    });
    
    const logoutBtn = $('#logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            clearSession();
            window.location.href = 'index.html';
        });
    }
    
    $('#delete-char-btn')?.addEventListener('click', openDeleteModal);
    $('#cancel-delete-btn')?.addEventListener('click', closeDeleteModal);
    $('#confirm-delete-btn')?.addEventListener('click', handleDelete);
    
    $('#add-item-form')?.addEventListener('submit', handleAddSubmit);
    $('#cancel-add-btn')?.addEventListener('click', closeAddModal);
    
    $('#level-form')?.addEventListener('submit', handleLevelUpdate);
    $('#cancel-level-btn')?.addEventListener('click', closeLevelModal);
    
    $('#delete-modal .modal-backdrop')?.addEventListener('click', closeDeleteModal);
    $('#add-item-modal .modal-backdrop')?.addEventListener('click', closeAddModal);
    $('#level-modal .modal-backdrop')?.addEventListener('click', closeLevelModal);
    
    await loadCharacters();
    hideLoading();
    
    setupRosterRealtime();
    
    const savedPage = localStorage.getItem('dnd-current-page');
    const savedCharacterId = localStorage.getItem('dnd-current-character-id');
    
    if (savedPage === 'character-page' && savedCharacterId) {
        await openCharacter(savedCharacterId);
    } else if (savedPage === 'create-page') {
        showPage('create-page');
    } else {
        showPage('home-page');
    }
    
    updateHeaderWithGameWorld();
}

function updateHeaderWithGameWorld() {
    if (currentSession && currentSession.gameWorldName) {
        const header = $('#home-page .header-content h1.logo');
        if (header) {
            header.textContent = `${currentSession.gameWorldName}`;
        }
        
        const roleIndicator = document.createElement('span');
        roleIndicator.className = 'role-indicator';
        roleIndicator.textContent = currentSession.role === 'dm' ? ' (DM)' : ' (Player)';
        roleIndicator.style.fontSize = '12px';
        roleIndicator.style.color = currentSession.role === 'dm' ? 'var(--warning)' : 'var(--accent-primary)';
        roleIndicator.style.marginLeft = '4px';
        
        if (header) {
            header.appendChild(roleIndicator);
        }
    }
}

document.addEventListener('DOMContentLoaded', init);