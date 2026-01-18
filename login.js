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

// Simple SHA-256 hash function for PINs
async function hashPIN(pin) {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
// Role Selection
// ========================================
function setupRoleSelection() {
    $$('.role-option').forEach(option => {
        option.addEventListener('click', () => {
            const form = option.closest('.login-form');
            if (!form) return;
            
            // Update active role in current form
            form.querySelectorAll('.role-option').forEach(opt => {
                opt.classList.remove('active');
            });
            option.classList.add('active');
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
    const activeRole = $('#join-form .role-option.active');
    if (!activeRole) return;
    
    const role = activeRole.dataset.role;
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
        // Hash the PIN
        const pinHash = await hashPIN(pin);
        
        // Fetch game world
        const { data: gameWorld, error } = await db
            .from('game_worlds')
            .select('*')
            .eq('name', worldName)
            .eq('is_active', true)
            .single();
        
        if (error) {
            console.error('Error fetching game world:', error);
            showError('join-error', 'Game world not found');
            return;
        }
        
        // Verify PIN based on role
        const correctPinHash = role === 'dm' ? gameWorld.dm_pin_hash : gameWorld.player_pin_hash;
        if (pinHash !== correctPinHash) {
            showError('join-error', 'Incorrect PIN for selected role');
            return;
        }
        
        // Create session
        const session = {
            gameWorldId: gameWorld.id,
            gameWorldName: gameWorld.name,
            role: role,
            timestamp: Date.now()
        };
        
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
        // Hash PINs
        const dmPinHash = await hashPIN(dmPin);
        const playerPinHash = await hashPIN(playerPin);
        
        // Create game world
        const { data: gameWorld, error } = await db
            .from('game_worlds')
            .insert({
                name: worldName,
                description: description || null,
                dm_pin_hash: dmPinHash,
                player_pin_hash: playerPinHash
            })
            .select()
            .single();
        
        if (error) {
            if (error.code === '23505') { // Unique constraint violation
                showError('create-error', 'Game world name already exists');
            } else {
                console.error('Error creating game world:', error);
                showError('create-error', 'Failed to create game world');
            }
            return;
        }
        
        // Create DM session
        const session = {
            gameWorldId: gameWorld.id,
            gameWorldName: gameWorld.name,
            role: 'dm',
            timestamp: Date.now()
        };
        
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
    setupRoleSelection();
    setupRememberMe();
    
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