// ========================================
// Supabase Configuration
// ========================================
const SUPABASE_URL = 'https://zlsguyiwwwbyoqxdewsd.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpsc2d1eWl3d3dieW9xeGRld3NkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2MzU0NzMsImV4cCI6MjA4NDIxMTQ3M30.LNcqEHFvGobozl5oPNs_GYpduYBoNmM7n6IhbuInfb4';

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ========================================
// Utility Functions
// ========================================
const $ = s => document.querySelector(s);
const $$ = s => document.querySelectorAll(s);

// PINs are verified server-side by the world_login / world_create functions.
// The stored hash is never sent to the client, so it cannot be read back and
// reversed -- a 4-digit PIN is only 10,000 values.
function loginErrorMessage(code) {
    switch (code) {
        case 'not_found':       return 'Game world not found';
        case 'bad_pin':         return 'Incorrect PIN';
        case 'rate_limited':    return 'Too many attempts. Please wait 15 minutes and try again.';
        case 'name_taken':      return 'Game world name already exists';
        case 'bad_name':        return 'Game world name must be 3-50 characters';
        case 'pins_identical':  return 'DM and Player PINs must be different';
        default:                return 'An error occurred. Please try again.';
    }
}

function showError(elementId, message) {
    const element = $(`#${elementId}`);
    element.textContent = message;
    element.classList.add('show');
    setTimeout(() => element.classList.remove('show'), 5000);
}

function clearErrors() {
    $$('.form-error').forEach(el => {
        el.classList.remove('show');
        el.textContent = '';
    });
}

// ========================================
// PIN Input Management
// ========================================
function setupPINInputs() {
    // Join form PIN inputs
    const joinPinInputs = $$('#join-form .pin-input');
    joinPinInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value.length === 1 && index < joinPinInputs.length - 1) {
                joinPinInputs[index + 1].focus();
            }
            updateHiddenPIN('join');
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                joinPinInputs[index - 1].focus();
            }
        });
        
        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pastedData = e.clipboardData.getData('text').slice(0, 4);
            pastedData.split('').forEach((char, i) => {
                if (joinPinInputs[i]) {
                    joinPinInputs[i].value = char;
                }
            });
            updateHiddenPIN('join');
            if (pastedData.length === 4) {
                joinPinInputs[3].focus();
            }
        });
    });
    
    // Create form DM PIN inputs
    const dmPinInputs = $$('.create-dm-pin');
    dmPinInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value.length === 1 && index < dmPinInputs.length - 1) {
                dmPinInputs[index + 1].focus();
            }
            updateHiddenPIN('create-dm');
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                dmPinInputs[index - 1].focus();
            }
        });
    });
    
    // Create form Player PIN inputs
    const playerPinInputs = $$('.create-player-pin');
    playerPinInputs.forEach((input, index) => {
        input.addEventListener('input', (e) => {
            const value = e.target.value;
            if (value.length === 1 && index < playerPinInputs.length - 1) {
                playerPinInputs[index + 1].focus();
            }
            updateHiddenPIN('create-player');
        });
        
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !e.target.value && index > 0) {
                playerPinInputs[index - 1].focus();
            }
        });
    });
}

function updateHiddenPIN(type) {
    let inputs, hiddenInput;
    
    switch(type) {
        case 'join':
            inputs = $$('#join-form .pin-input');
            hiddenInput = $('#pin-value');
            break;
        case 'create-dm':
            inputs = $$('.create-dm-pin');
            hiddenInput = $('#dm-pin-value');
            break;
        case 'create-player':
            inputs = $$('.create-player-pin');
            hiddenInput = $('#player-pin-value');
            break;
    }
    
    const pin = Array.from(inputs).map(input => input.value).join('');
    if (hiddenInput) hiddenInput.value = pin;
    return pin;
}

function clearPINInputs(form = 'all') {
    if (form === 'join' || form === 'all') {
        $$('#join-form .pin-input').forEach(input => input.value = '');
        const pinValue = $('#pin-value');
        if (pinValue) pinValue.value = '';
        const firstInput = $('#join-form .pin-input:first-child');
        if (firstInput) firstInput.focus();
    }
    
    if (form === 'create' || form === 'all') {
        $$('.create-dm-pin').forEach(input => input.value = '');
        $$('.create-player-pin').forEach(input => input.value = '');
        const dmPinValue = $('#dm-pin-value');
        const playerPinValue = $('#player-pin-value');
        if (dmPinValue) dmPinValue.value = '';
        if (playerPinValue) playerPinValue.value = '';
        const firstDmInput = $('.create-dm-pin:first-child');
        if (firstDmInput) firstDmInput.focus();
    }
}

// ========================================
// Tab Management
// ========================================
function setupTabs() {
    $$('.login-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabId = tab.dataset.tab;
            
            // Update active tab
            $$('.login-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show active form
            $$('.login-form').forEach(form => form.classList.remove('active'));
            const targetForm = $(`#${tabId}-form`);
            if (targetForm) targetForm.classList.add('active');
            
            // Clear errors and PIN inputs
            clearErrors();
            clearPINInputs(tabId);
        });
    });
    
    // Switch links
    const switchToCreate = $('#switch-to-create');
    if (switchToCreate) {
        switchToCreate.addEventListener('click', () => {
            const createTab = $('.login-tab[data-tab="create"]');
            if (createTab) createTab.click();
        });
    }
    
    const switchToJoin = $('#switch-to-join');
    if (switchToJoin) {
        switchToJoin.addEventListener('click', () => {
            const joinTab = $('.login-tab[data-tab="join"]');
            if (joinTab) joinTab.click();
        });
    }
}

// ========================================
// Leveling Mode Toggle
// ========================================
function setupLevelingModeToggle() {
    const descriptions = {
        milestone: 'DM grants levels directly to characters.',
        exp: 'DM grants EXP. Characters auto-level at 5e thresholds.'
    };
    $$('.leveling-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            $$('.leveling-mode-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const mode = btn.dataset.mode;
            const hidden = $('#leveling-mode-value');
            if (hidden) hidden.value = mode;
            const desc = $('#leveling-mode-desc');
            if (desc) desc.textContent = descriptions[mode];
        });
    });
}

// ========================================
// Remember Me Checkbox
// ========================================
function setupRememberMe() {
    $$('.remember-checkbox').forEach(checkbox => {
        checkbox.addEventListener('click', () => {
            checkbox.classList.toggle('checked');
        });
    });
}

// ========================================
// Form Submission
// ========================================
async function handleJoinSubmit(e) {
    e.preventDefault();
    clearErrors();
    
    const worldNameInput = $('#world-name');
    if (!worldNameInput) return;
    
    const worldName = worldNameInput.value.trim();
    const pin = updateHiddenPIN('join');
    const rememberMe = $('#remember-me');
    const remember = rememberMe ? rememberMe.classList.contains('checked') : false;
    
    // Validation
    if (!worldName) {
        showError('join-error', 'Please enter a game world name');
        return;
    }
    
    if (pin.length !== 4 || !/^\d{4}$/.test(pin)) {
        showError('join-error', 'Please enter a valid 4-digit PIN');
        return;
    }
    
    // Show loading
    const submitBtn = $('#join-form .btn-primary');
    const btnText = $('#join-btn-text');
    const loader = $('#join-loader');
    if (btnText) btnText.style.display = 'none';
    if (loader) loader.style.display = 'inline-block';
    
    try {
        // The PIN is checked on the server, which also decides the role.
        const { data: result, error } = await db.rpc('world_login', {
            p_world_name: worldName,
            p_pin: pin
        });
        
        if (error) {
            console.error('Login failed:', error);
            showError('join-error', 'An error occurred. Please try again.');
            return;
        }
        
        if (!result || !result.ok) {
            showError('join-error', loginErrorMessage(result && result.error));
            return;
        }
        
        // Create session
        const session = {
            gameWorldId: result.game_world_id,
            gameWorldName: result.game_world_name,
            role: result.role,
            timestamp: Date.now()
        };
        
        // A DM carries a short-lived token that unlocks the private campaign
        // data for their own world. Players are issued none.
        if (result.dm_token) {
            session.dmToken = result.dm_token;
        }
        
        // Store session
        if (remember) {
            localStorage.setItem('dnd-session', JSON.stringify(session));
        } else {
            sessionStorage.setItem('dnd-session', JSON.stringify(session));
        }
        
        // Redirect to characters page
        window.location.href = 'characters.html';
        
    } catch (error) {
        console.error('Login error:', error);
        showError('join-error', 'An error occurred. Please try again.');
    } finally {
        if (btnText) btnText.style.display = 'inline';
        if (loader) loader.style.display = 'none';
    }
}

async function handleCreateSubmit(e) {
    e.preventDefault();
    clearErrors();
    
    const worldNameInput = $('#new-world-name');
    if (!worldNameInput) return;
    
    const worldName = worldNameInput.value.trim();
    const descriptionInput = $('#world-description');
    const description = descriptionInput ? descriptionInput.value.trim() : '';
    const dmPin = updateHiddenPIN('create-dm');
    const playerPin = updateHiddenPIN('create-player');
    const levelingModeInput = $('#leveling-mode-value');
    const levelingMode = levelingModeInput ? levelingModeInput.value : 'milestone';
    const rememberCreate = $('#remember-create');
    const remember = rememberCreate ? rememberCreate.classList.contains('checked') : false;
    
    // Validation
    if (!worldName) {
        showError('create-error', 'Please enter a game world name');
        return;
    }
    
    if (worldName.length < 3 || worldName.length > 50) {
        showError('create-error', 'Game world name must be 3-50 characters');
        return;
    }
    
    if (dmPin.length !== 4 || !/^\d{4}$/.test(dmPin)) {
        showError('create-error', 'Please enter a valid 4-digit DM PIN');
        return;
    }
    
    if (playerPin.length !== 4 || !/^\d{4}$/.test(playerPin)) {
        showError('create-error', 'Please enter a valid 4-digit Player PIN');
        return;
    }
    
    if (dmPin === playerPin) {
        showError('create-error', 'DM and Player PINs must be different');
        return;
    }
    
    // Show loading
    const btnText = $('#create-btn-text');
    const loader = $('#create-loader');
    if (btnText) btnText.style.display = 'none';
    if (loader) loader.style.display = 'inline-block';
    
    try {
        // The server hashes the PINs and re-checks the same validation rules.
        const { data: result, error } = await db.rpc('world_create', {
            p_name: worldName,
            p_description: description || null,
            p_leveling_mode: levelingMode,
            p_dm_pin: dmPin,
            p_player_pin: playerPin
        });
        
        if (error) {
            console.error('Error creating game world:', error);
            showError('create-error', 'Failed to create game world');
            return;
        }
        
        if (!result || !result.ok) {
            showError('create-error', loginErrorMessage(result && result.error));
            return;
        }
        
        // Create DM session
        const session = {
            gameWorldId: result.game_world_id,
            gameWorldName: result.game_world_name,
            role: 'dm',
            timestamp: Date.now()
        };
        
        if (result.dm_token) {
            session.dmToken = result.dm_token;
        }
        
        // Store session
        if (remember) {
            localStorage.setItem('dnd-session', JSON.stringify(session));
        } else {
            sessionStorage.setItem('dnd-session', JSON.stringify(session));
        }
        
        // Redirect to characters page
        window.location.href = 'characters.html';
        
    } catch (error) {
        console.error('Create error:', error);
        showError('create-error', 'An error occurred. Please try again.');
    } finally {
        if (btnText) btnText.style.display = 'inline';
        if (loader) loader.style.display = 'none';
    }
}

// ========================================
// Check Existing Session
// ========================================
function checkExistingSession() {
    const session = JSON.parse(localStorage.getItem('dnd-session') || sessionStorage.getItem('dnd-session') || 'null');
    
    if (session) {
        // Check if session is less than 7 days old
        const oneWeek = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - session.timestamp < oneWeek) {
            // Auto-redirect to characters page
            window.location.href = 'characters.html';
        } else {
            // Clear expired session
            localStorage.removeItem('dnd-session');
            sessionStorage.removeItem('dnd-session');
        }
    }
}

// ========================================
// Initialize Login Page
// ========================================
function initLogin() {
    setupPINInputs();
    setupTabs();
    setupRememberMe();
    setupLevelingModeToggle();
    
    // Form submissions
    const joinForm = $('#join-form');
    if (joinForm) {
        joinForm.addEventListener('submit', handleJoinSubmit);
    }
    
    const createForm = $('#create-form');
    if (createForm) {
        createForm.addEventListener('submit', handleCreateSubmit);
    }
    
    // Check for existing session
    checkExistingSession();
}

document.addEventListener('DOMContentLoaded', initLogin);