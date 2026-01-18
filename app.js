// ========================================
// Supabase Configuration
// ========================================
const SUPABASE_URL = 'https://zlsguyiwwwbyoqxdewsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpsc2d1eWl3d3dieW9xeGRld3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzU0NzMsImV4cCI6MjA4NDIxMTQ3M30.LNcqEHFvGobozl5oPNs_GYpduYBoNmM7n6IhbuInfb4';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


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

// Update loadCharacters to filter by game world
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

// ========================================
// Home Page
// ========================================
async function loadCharacters() {
    const { data, error } = await db.from('characters').select(`*, ability_scores (*), skills (*)`).order('updated_at', { ascending: false });
    if (error) { console.error(error); return; }
    characters = data || [];
    renderRoster();
}

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
            updateHPHint();
        });
    });
    $('#roll-abilities-btn').addEventListener('click', () => {
        ABILITIES.forEach(ab => {
            const s = roll4d6Drop();
            $(`#score-${ab}`).value = s;
            $(`#mod-${ab}`).textContent = formatMod(getModifier(s));
        });
        updateHPHint();
    });
    $('#char-class').addEventListener('change', updateHPHint);
    $('#char-level').addEventListener('input', updateHPHint);
    $('#create-form').addEventListener('submit', handleCreate);
    $('#cancel-create-btn').addEventListener('click', () => showPage('home-page'));
    $('#create-back-btn').addEventListener('click', () => showPage('home-page'));
}

function updateHPHint() {
    const cls = $('#char-class').value;
    const lvl = parseInt($('#char-level').value) || 1;
    const conMod = getModifier(parseInt($('#score-con').value) || 10);
    $('#hp-suggestion').textContent = `Suggested: ${calcHP(cls, lvl, conMod)}`;
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

function setupRealtime(id) {
    // Remove any existing channels first
    db.removeAllChannels();
    
    // Create a unique channel name
    const channelName = `char-updates-${id}-${Date.now()}`;
    const channel = db.channel(channelName);
    
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
    
    // Subscribe to the channel
    channel.subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
            console.log('Realtime subscription active for character:', id);
            realtimeRetryCount = 0; // Reset on success
        } else if (status === 'CHANNEL_ERROR') {
            console.error('Realtime channel error:', err);
            // Don't retry on channel errors - they usually indicate a config issue
        } else if (status === 'TIMED_OUT') {
            realtimeRetryCount++;
            if (realtimeRetryCount <= MAX_REALTIME_RETRIES) {
                console.warn(`Realtime subscription timed out, retry ${realtimeRetryCount}/${MAX_REALTIME_RETRIES}...`);
                setTimeout(() => setupRealtime(id), 2000 * realtimeRetryCount); // Exponential backoff
            } else {
                console.warn('Realtime subscription failed after max retries. App will work without live updates.');
            }
        } else {
            console.log('Realtime status:', status);
        }
    });
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
            <div class="hp-display">
                <div><span class="hp-current">${c.current_hit_points}</span><span class="hp-max">/${c.hit_point_maximum}</span></div>
                ${c.temporary_hit_points > 0 ? `<span class="hp-temp">+${c.temporary_hit_points} temp</span>` : ''}
            </div>
            <div class="hp-bar-large"><div class="hp-bar-fill ${getHpClass(pct)}" style="width:${pct}%"></div></div>
            <div class="hp-controls">
                <button class="hp-btn damage" onclick="adjustHP(-1)">−</button>
                <input type="number" class="hp-input" id="hp-delta" placeholder="±">
                <button class="hp-btn heal" onclick="adjustHP(1)">+</button>
                <button class="btn-secondary btn-small" onclick="applyHPDelta()">Apply</button>
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

// ========================================
// Skills Tab
// ========================================
function renderSkillsTab() {
    const c = currentCharacter;
    const abs = c.ability_scores || {};
    const profBonus = getProfBonus(c.level);

    $('#tab-skills').innerHTML = `
        <div class="skills-list">
            ${Object.entries(SKILLS).map(([name, ab]) => {
                const skill = c.skills?.find(s => s.skill_name === name);
                const mod = getModifier(getAbilityScore(abs, ab)) + (skill?.proficient ? profBonus : 0) + (skill?.expertise ? profBonus : 0);
                return `<div class="skill-row ${skill?.proficient ? 'proficient' : ''} ${skill?.expertise ? 'expertise' : ''}" onclick="cycleSkillProficiency('${skill?.id}', ${skill?.proficient || false}, ${skill?.expertise || false})">
                    <div class="skill-info">
                        <div class="skill-prof-markers"><span class="skill-prof-marker"></span><span class="skill-prof-marker"></span></div>
                        <span class="skill-name">${name}</span>
                        <span class="skill-ability">${ab.toUpperCase()}</span>
                    </div>
                    <span class="skill-modifier">${formatMod(mod)}</span>
                </div>`;
            }).join('')}
        </div>
    `;
}

window.cycleSkillProficiency = async function(id, prof, exp) {
    // Determine new values
    let newProf, newExp;
    if (!prof) {
        newProf = true; newExp = false;
    } else if (!exp) {
        newProf = true; newExp = true;
    } else {
        newProf = false; newExp = false;
    }
    
    // Optimistic update
    const skill = currentCharacter.skills?.find(s => s.id === id);
    if (skill) {
        skill.proficient = newProf;
        skill.expertise = newExp;
        renderCharacterPage();
    }
    
    // Database update
    await db.from('skills').update({ proficient: newProf, expertise: newExp }).eq('id', id);
};

// ========================================
// Actions Tab
// ========================================
function renderActionsTab() {
    const c = currentCharacter;
    const weapons = c.weapons || [];
    const spells = c.spells || [];
    const slots = c.spell_slots || [];

    const groupedSpells = spells.reduce((acc, s) => { (acc[s.level] = acc[s.level] || []).push(s); return acc; }, {});

    $('#tab-actions').innerHTML = `
        <div class="actions-section">
            <div class="section-header-row">
                <span class="section-label">Weapons</span>
                <button class="add-btn" onclick="openAddModal('weapon')"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>Add</button>
            </div>
            <div class="weapons-list">
                ${weapons.length ? weapons.map(w => `<div class="weapon-card">
                    <div class="weapon-info"><h3>${escapeHtml(w.name)}</h3><p>${w.damage_type || ''} ${w.properties || ''}</p></div>
                    <div class="weapon-stats">
                        <div class="weapon-stat"><span class="value">${formatMod(w.attack_bonus)}</span><span class="label">Hit</span></div>
                        <div class="weapon-stat"><span class="value">${w.damage}</span><span class="label">Dmg</span></div>
                    </div>
                    <button class="weapon-delete" onclick="deleteWeapon('${w.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                </div>`).join('') : '<div class="empty-list">No weapons added</div>'}
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
                        ${list.map(s => `<div class="spell-card">
                            <div class="spell-info">
                                ${s.level > 0 ? `<div class="spell-prepared-toggle ${s.prepared ? 'prepared' : ''}" onclick="toggleSpellPrepared('${s.id}', ${s.prepared})"></div>` : ''}
                                <span class="spell-name">${escapeHtml(s.name)}</span>
                                ${s.school ? `<span class="spell-school">${s.school}</span>` : ''}
                            </div>
                            <button class="spell-delete" onclick="deleteSpell('${s.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
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
            ${items.length ? items.map(i => `<div class="item-card">
                <div class="item-info"><h3>${escapeHtml(i.name)}</h3><p>${i.item_type || 'Item'}${i.weight ? ` • ${i.weight} lb` : ''}</p></div>
                <div class="item-quantity">
                    <button onclick="updateItemQty('${i.id}', ${i.quantity - 1})">−</button>
                    <span>${i.quantity}</span>
                    <button onclick="updateItemQty('${i.id}', ${i.quantity + 1})">+</button>
                </div>
                <button class="item-delete" onclick="deleteItem('${i.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
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
                ${features.length ? features.map(f => `<div class="feature-card">
                    <div class="feature-header">
                        <div><h4>${escapeHtml(f.name)}</h4>${f.source ? `<span class="feature-source">${f.source}</span>` : ''}</div>
                        <button class="feature-delete" onclick="deleteFeature('${f.id}')"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg></button>
                    </div>
                    ${f.description ? `<p class="feature-description">${escapeHtml(f.description)}</p>` : ''}
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
// Add Modal with API Search
// ========================================
let addModalType = null;
let selectedApiItem = null;

window.openAddModal = function(type) {
    addModalType = type;
    selectedApiItem = null;
    const modal = $('#add-item-modal');
    const title = $('#add-modal-title');
    const fields = $('#add-modal-fields');

    const configs = {
        weapon: { 
            title: 'Add Weapon', 
            apiEndpoint: 'equipment',
            apiFilter: item => item.equipment_category === 'Weapon' || item.url?.includes('weapon'),
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D weapons...' },
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
            title: 'Add Feature', 
            apiEndpoint: 'features',
            fields: [
                { name: 'name', label: 'Name', type: 'search', required: true, placeholder: 'Search D&D features...' },
                { name: 'source', label: 'Source', type: 'select', options: ['Class', 'Race', 'Background', 'Feat', 'Other'] },
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
            return `<div class="form-group"><label>${f.label}</label><select name="${f.name}">${f.options.map(o => `<option value="${o}">${o}</option>`).join('')}</select></div>`;
        }
        return `<div class="form-group"><label>${f.label}${f.required ? ' *' : ''}</label><input type="${f.type}" name="${f.name}" ${f.required ? 'required' : ''} ${f.value !== undefined ? `value="${f.value}"` : ''} ${f.placeholder ? `placeholder="${f.placeholder}"` : ''}></div>`;
    }).join('');

    // Set up API search functionality
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
            
            const results = await searchDndApi(config.apiEndpoint, query);
            
            if (results.length === 0) {
                searchResults.innerHTML = '<div class="api-search-empty">No results found. You can still add a custom entry.</div>';
            } else {
                searchResults.innerHTML = results.slice(0, 10).map(r => 
                    `<div class="api-search-result" data-url="${r.url}" data-name="${escapeHtml(r.name)}">${escapeHtml(r.name)}</div>`
                ).join('');
                
                // Add click handlers to results
                searchResults.querySelectorAll('.api-search-result').forEach(result => {
                    result.addEventListener('click', async () => {
                        const url = result.dataset.url;
                        const name = result.dataset.name;
                        
                        searchInput.value = name;
                        searchResults.classList.add('hidden');
                        
                        // Fetch full details and populate form
                        const details = await getDndApiDetails(url);
                        if (details) {
                            selectedApiItem = details;
                            populateFormFromApi(type, details, fields);
                        }
                    });
                });
            }
        }, 300);
        
        searchInput.addEventListener('input', (e) => {
            selectedApiItem = null;
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

function populateFormFromApi(type, details, fieldsContainer) {
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
        if (details.desc) {
            const description = Array.isArray(details.desc) ? details.desc.join('\n\n') : details.desc;
            if (form.querySelector('[name="description"]')) form.querySelector('[name="description"]').value = description;
        }
        if (details.class) {
            if (form.querySelector('[name="source"]')) form.querySelector('[name="source"]').value = 'Class';
        }
    }
}

window.closeAddModal = function() {
    $('#add-item-modal').classList.add('hidden');
    $('#add-item-form').reset();
    addModalType = null;
    selectedApiItem = null;
};

async function handleAddSubmit(e) {
    e.preventDefault();
    const form = e.target;
    const data = Object.fromEntries(new FormData(form));
    data.character_id = currentCharacter.id;

    const tables = { weapon: 'weapons', spell: 'spells', item: 'inventory_items', feature: 'features_traits' };
    const dataKeys = { weapon: 'weapons', spell: 'spells', item: 'inventory_items', feature: 'features_traits' };
    
    // Save the modal type before closing (closeAddModal sets it to null)
    const modalType = addModalType;
    const dataKey = dataKeys[modalType];
    const table = tables[modalType];
    
    // Handle numeric fields
    if (data.quantity) data.quantity = parseInt(data.quantity) || 1;
    if (data.level !== undefined) data.level = parseInt(data.level) || 0;
    if (data.attack_bonus !== undefined) data.attack_bonus = parseInt(data.attack_bonus) || 0;
    if (data.weight) data.weight = parseFloat(data.weight) || null;
    
    // Store API index if we selected from API
    if (selectedApiItem && modalType === 'spell') {
        data.api_index = selectedApiItem.index;
    }

    // Close modal immediately for better UX
    closeAddModal();
    
    // Optimistic update - add temp item with placeholder ID
    const tempId = 'temp_' + Date.now();
    const tempItem = { ...data, id: tempId };
    
    if (!currentCharacter[dataKey]) {
        currentCharacter[dataKey] = [];
    }
    currentCharacter[dataKey].push(tempItem);
    renderCharacterPage();

    // Database insert
    const { data: insertedData, error } = await db.from(table).insert(data).select().single();
    
    if (error) {
        console.error('Error adding item:', error);
        // Remove temp item on error
        currentCharacter[dataKey] = currentCharacter[dataKey].filter(item => item.id !== tempId);
        renderCharacterPage();
        alert('Failed to add item');
        return;
    }
    
    // Replace temp item with real item from database
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
// ========================================
// Initialize App
// ========================================
async function init() {
    // Check session first
    const hasValidSession = await validateSession();
    if (!hasValidSession) {
        console.log('No valid session found, redirecting to login...');
        return; // validateSession will handle the redirect
    }
    
    console.log('Session validated, initializing app...');
    
    // Initialize components
    initCreatePage();
    initTabs();
    
    // Set up event listeners - use optional chaining to avoid null errors
    $('#create-btn')?.addEventListener('click', () => showPage('create-page'));
    $('#refresh-btn')?.addEventListener('click', loadCharacters);
    $('#char-back-btn')?.addEventListener('click', () => { 
        db.removeAllChannels(); 
        currentCharacter = null; 
        loadCharacters(); 
        showPage('home-page'); 
    });
    
    // Logout button
    const logoutBtn = $('#logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            clearSession();
            window.location.href = 'index.html';
        });
    } else {
        console.warn('Logout button not found in DOM');
    }
    
    // Delete character modal buttons
    $('#delete-char-btn')?.addEventListener('click', openDeleteModal);
    $('#cancel-delete-btn')?.addEventListener('click', closeDeleteModal);
    $('#confirm-delete-btn')?.addEventListener('click', handleDelete);
    
    // Add item modal
    $('#add-item-form')?.addEventListener('submit', handleAddSubmit);
    $('#cancel-add-btn')?.addEventListener('click', closeAddModal);
    
    // Fix modal backdrop click handlers
    $('#delete-modal .modal-backdrop')?.addEventListener('click', closeDeleteModal);
    $('#add-item-modal .modal-backdrop')?.addEventListener('click', closeAddModal);
    
    // Load characters and hide loading
    await loadCharacters();
    hideLoading();
    
    // Restore page state from localStorage
    const savedPage = localStorage.getItem('dnd-current-page');
    const savedCharacterId = localStorage.getItem('dnd-current-character-id');
    
    if (savedPage === 'character-page' && savedCharacterId) {
        // Try to restore the character page
        await openCharacter(savedCharacterId);
    } else if (savedPage === 'create-page') {
        showPage('create-page');
    } else {
        showPage('home-page');
    }
    
    // Update header with game world info
    updateHeaderWithGameWorld();
}

// Add this function to update the header with game world info
function updateHeaderWithGameWorld() {
    if (currentSession && currentSession.gameWorldName) {
        const header = $('#home-page .header-content h1.logo');
        if (header) {
            header.textContent = `${currentSession.gameWorldName}`;
        }
        
        // Add role indicator
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