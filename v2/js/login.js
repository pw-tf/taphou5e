// ========================================
// TAPHOU5E v2 — login
//
// PINs are never hashed here. They go to the world_login / world_create
// functions, which verify server-side and hand back a role (and, for a DM, a
// short-lived token). The stored hash is not readable by this client.
// ========================================

(function () {
    const errorBox = $('#form-error');
    const joinForm = $('#join-form');
    const createForm = $('#create-form');
    let levelingMode = 'milestone';

    // Already signed in? Skip straight through, matching v1's behaviour.
    const existing = getSession();
    if (existing) {
        const week = 7 * 24 * 60 * 60 * 1000;
        if (Date.now() - (existing.timestamp || 0) < week) {
            window.location.replace('index.html');
            return;
        }
        clearSession();
    }

    function showError(message) {
        errorBox.textContent = message;
        errorBox.hidden = false;
    }

    function clearError() {
        errorBox.hidden = true;
        errorBox.textContent = '';
    }

    function setMode(mode) {
        clearError();
        $$('[data-mode]').forEach(el => {
            if (el.tagName === 'BUTTON') el.classList.toggle('is-active', el.dataset.mode === mode);
        });
        joinForm.hidden = mode !== 'join';
        createForm.hidden = mode !== 'create';
    }

    // ---------- PIN inputs ----------

    function pinValue(group) {
        return $$(`[data-pin-group="${group}"] .pin-input`).map(i => i.value).join('');
    }

    function wirePinGroup(group) {
        const inputs = $$(`[data-pin-group="${group}"] .pin-input`);
        inputs.forEach((input, index) => {
            // With maxlength="1", typing into a box that already holds a digit
            // is a no-op. Selecting on focus means a second attempt overwrites
            // rather than silently doing nothing.
            input.addEventListener('focus', () => input.select());
            input.addEventListener('input', () => {
                input.value = input.value.replace(/\D/g, '').slice(0, 1);
                if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
            });
            input.addEventListener('keydown', e => {
                if (e.key === 'Backspace' && !input.value && index > 0) inputs[index - 1].focus();
                if (e.key === 'ArrowLeft' && index > 0) inputs[index - 1].focus();
                if (e.key === 'ArrowRight' && index < inputs.length - 1) inputs[index + 1].focus();
            });
            input.addEventListener('paste', e => {
                const digits = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '');
                if (!digits) return;
                e.preventDefault();
                inputs.forEach((box, i) => { box.value = digits[i] || ''; });
                inputs[Math.min(digits.length, inputs.length - 1)].focus();
            });
        });
    }

    ['join', 'dm', 'player'].forEach(wirePinGroup);

    // ---------- Submit ----------

    function busy(form, on) {
        const btn = $('.btn-submit', form);
        if (btn) btn.setAttribute('aria-busy', on ? 'true' : 'false');
    }

    // A successful login also opts this device into v2, so the root router
    // sends them straight here next time.
    function finish(result, remember) {
        const newSession = {
            gameWorldId: result.game_world_id,
            gameWorldName: result.game_world_name,
            role: result.role,
            timestamp: Date.now()
        };
        if (result.dm_token) {
            newSession.dmToken = result.dm_token;
            newSession.dmTokenIssued = Date.now();
        }

        saveSession(newSession, remember);
        stayOnNext();
        window.location.href = 'index.html';
    }

    joinForm.addEventListener('submit', async e => {
        e.preventDefault();
        clearError();

        const worldName = $('#world-name').value.trim();
        const pin = pinValue('join');

        if (!worldName) return showError('Please enter a game world name');
        if (!/^\d{4}$/.test(pin)) return showError('Please enter a valid 4-digit PIN');

        busy(joinForm, true);
        try {
            const { data: result, error } = await db.rpc('world_login', {
                p_world_name: worldName,
                p_pin: pin
            });
            if (error) {
                console.error('Login failed:', error);
                return showError('An error occurred. Please try again.');
            }
            if (!result || !result.ok) {
                return showError(loginErrorMessage(result && result.error));
            }
            finish(result, $('#join-remember').checked);
        } catch (err) {
            console.error('Login failed:', err);
            showError('An error occurred. Please try again.');
        } finally {
            busy(joinForm, false);
        }
    });

    createForm.addEventListener('submit', async e => {
        e.preventDefault();
        clearError();

        const worldName = $('#new-world-name').value.trim();
        const description = $('#world-description').value.trim();
        const dmPin = pinValue('dm');
        const playerPin = pinValue('player');

        if (worldName.length < 3 || worldName.length > 50) {
            return showError('Game world name must be 3-50 characters');
        }
        if (!/^\d{4}$/.test(dmPin)) return showError('Please enter a valid 4-digit DM PIN');
        if (!/^\d{4}$/.test(playerPin)) return showError('Please enter a valid 4-digit Player PIN');
        if (dmPin === playerPin) return showError('DM and Player PINs must be different');

        busy(createForm, true);
        try {
            const { data: result, error } = await db.rpc('world_create', {
                p_name: worldName,
                p_description: description || null,
                p_leveling_mode: levelingMode,
                p_dm_pin: dmPin,
                p_player_pin: playerPin
            });
            if (error) {
                console.error('Error creating game world:', error);
                return showError('Failed to create game world');
            }
            if (!result || !result.ok) {
                return showError(loginErrorMessage(result && result.error));
            }
            finish(result, $('#create-remember').checked);
        } catch (err) {
            console.error('Error creating game world:', err);
            showError('Failed to create game world');
        } finally {
            busy(createForm, false);
        }
    });

    // Mirrors the message map in the v1 client so both versions word failures
    // identically.
    function loginErrorMessage(code) {
        switch (code) {
            case 'not_found':      return 'Game world not found';
            case 'bad_pin':        return 'Incorrect PIN';
            case 'rate_limited':   return 'Too many attempts. Please wait 15 minutes and try again.';
            case 'name_taken':     return 'Game world name already exists';
            case 'bad_name':       return 'Game world name must be 3-50 characters';
            case 'pins_identical': return 'DM and Player PINs must be different';
            default:               return 'An error occurred. Please try again.';
        }
    }

    // ---------- Mode toggles ----------

    $$('[data-mode]').forEach(el => {
        el.addEventListener('click', e => {
            e.preventDefault();
            setMode(el.dataset.mode);
        });
    });

    $$('#leveling-mode [data-mode-value]').forEach(btn => {
        btn.addEventListener('click', () => {
            levelingMode = btn.dataset.modeValue;
            $$('#leveling-mode [data-mode-value]').forEach(b => b.classList.toggle('is-active', b === btn));
            $('#leveling-hint').textContent = levelingMode === 'milestone'
                ? 'DM grants levels directly to characters.'
                : 'Characters level up by earning experience points.';
        });
    });

    // Opting out of v2 should stick, otherwise the router sends them back here.
    $('#use-classic').addEventListener('click', () => {
        try { localStorage.setItem(UI_KEY, 'classic'); } catch (err) { /* ignore */ }
    });
})();
