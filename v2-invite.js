// ============================================================
// V2 INVITE (v2-invite.js)
//
// Offers the new layout to people still on the classic version, once on the
// login page and once on the home screen for someone already signed in.
//
// Deliberately self-contained: it touches no app.js state, adds no globals
// beyond one namespaced object, and reuses the classic modal markup so it
// looks native. The classic app is otherwise frozen, so the smallest possible
// footprint is the point -- this file can be deleted whole and nothing else
// changes. See docs/campaigns-schema-design.md 9.3.
// ============================================================

(function () {
    var UI_KEY     = 'taphou5e-ui';       // 'classic' | 'next', set once chosen
    var INVITE_KEY = 'taphou5e-invite';   // when we last asked, or 'never'
    var SESSION_KEY = 'dnd-session';      // shared with v2 -- do not rename

    var SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

    function read(key) {
        try { return localStorage.getItem(key); } catch (e) { return null; }
    }

    function write(key, value) {
        try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
    }

    // Four reasons not to ask: they already chose, they asked us to stop, we
    // asked recently, or there is no v2 to send them to.
    function shouldAsk() {
        var chosen = read(UI_KEY);
        if (chosen === 'next' || chosen === 'classic') return false;

        var asked = read(INVITE_KEY);
        if (asked === 'never') return false;
        if (asked) {
            var when = parseInt(asked, 10);
            // A corrupt value should not wedge the prompt off forever.
            if (when && Date.now() - when < SNOOZE_MS) return false;
        }
        return true;
    }

    function hasSession() {
        try {
            return !!(localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY));
        } catch (e) {
            return false;
        }
    }

    function dismiss(host, permanent) {
        write(INVITE_KEY, permanent ? 'never' : String(Date.now()));
        host.remove();
        document.body.style.overflow = '';
    }

    // The classic stylesheet has no list styles, and this is the only place
    // the classic app shows a bulleted list, so it brings its own.
    function injectStyles() {
        if (document.getElementById('v2-invite-styles')) return;
        var style = document.createElement('style');
        style.id = 'v2-invite-styles';
        style.textContent =
            '#v2-invite .modal-content { max-width: 440px; }' +
            '.v2-invite-list { list-style: none; margin: 0 0 var(--space-md); padding: 0;' +
                ' display: flex; flex-direction: column; gap: 10px; }' +
            '.v2-invite-list li { position: relative; padding-left: 18px; font-size: 13px;' +
                ' line-height: 1.5; color: var(--text-secondary); }' +
            '.v2-invite-list li::before { content: ""; position: absolute; left: 0; top: 8px;' +
                ' width: 6px; height: 6px; border-radius: 50%; background: var(--accent-primary); }' +
            '.v2-invite-list b { color: var(--text-primary); font-weight: 600; }';
        document.head.appendChild(style);
    }

    function show() {
        if (document.getElementById('v2-invite')) return;
        injectStyles();

        var host = document.createElement('div');
        host.id = 'v2-invite';
        host.className = 'modal';
        host.setAttribute('role', 'dialog');
        host.setAttribute('aria-modal', 'true');
        host.setAttribute('aria-label', 'Try the new layout');
        host.innerHTML =
            '<div class="modal-backdrop"></div>' +
            '<div class="modal-content">' +
                '<h2>TAPHOU5E V2.0 now available!</h2>' +
                '<ul class="v2-invite-list">' +
                    '<li><b>Campaigns</b> &mdash; storylines, areas, NPCs and session recaps in one place</li>' +
                    '<li><b>A rebuilt encounter tracker</b> &mdash; bulk-add monsters, colour-code groups, share an encounter with a code</li>' +
                    '<li><b>A character sheet you can play from</b> &mdash; spells, inventory, currency and charges, all editable</li>' +
                    '<li><b>Character creation and levelling</b> &mdash; point buy, standard array, and a level-up wizard</li>' +
                    '<li><b>Built for a phone</b> &mdash; hold any card to edit or delete it</li>' +
                '</ul>' +
                '<p>Your world, characters and encounters are the same in both &mdash; ' +
                'nothing is copied or moved, and you can switch back whenever you like.</p>' +
                '<label style="display:flex;align-items:center;gap:8px;font-size:13px;' +
                       'color:var(--text-secondary);margin-bottom:var(--space-lg);cursor:pointer">' +
                    '<input type="checkbox" id="v2-invite-never"> Don’t show this again' +
                '</label>' +
                '<div class="modal-actions">' +
                    '<button type="button" class="btn-secondary" id="v2-invite-no">Not now</button>' +
                    '<button type="button" class="btn-primary" id="v2-invite-yes">Try it</button>' +
                '</div>' +
            '</div>';

        document.body.appendChild(host);
        document.body.style.overflow = 'hidden';

        var never = host.querySelector('#v2-invite-never');

        // Setting the flag is also what stops us asking again: the router on
        // the classic login reads it.
        host.querySelector('#v2-invite-yes').addEventListener('click', switchToV2);

        host.querySelector('#v2-invite-no').addEventListener('click', function () {
            dismiss(host, never.checked);
        });

        // Tapping away is "not now" -- it must not count as a permanent no
        // unless the box is ticked, and it must still record that we asked.
        host.querySelector('.modal-backdrop').addEventListener('click', function () {
            dismiss(host, never.checked);
        });

        document.addEventListener('keydown', function esc(e) {
            if (e.key !== 'Escape') return;
            document.removeEventListener('keydown', esc);
            if (document.getElementById('v2-invite')) dismiss(host, never.checked);
        });

        host.querySelector('#v2-invite-yes').focus();
    }

    // The home screen only exists once app.js has validated the session and
    // switched to it. Waiting for that means the prompt never appears over the
    // login redirect, and never over a character sheet that was restored from
    // the last visit -- someone opening a character is mid-task.
    function whenHomeVisible(callback) {
        var home = document.getElementById('home-page');
        if (!home) return;

        if (!home.classList.contains('hidden')) { callback(); return; }

        var observer = new MutationObserver(function () {
            if (home.classList.contains('hidden')) return;
            observer.disconnect();
            clearTimeout(giveUp);
            callback();
        });
        observer.observe(home, { attributes: true, attributeFilter: ['class'] });

        // If the home screen never appears, stop watching rather than firing
        // the prompt over whatever the person ended up on.
        var giveUp = setTimeout(function () { observer.disconnect(); }, 15000);
    }

    function start() {
        if (!shouldAsk()) return;

        if (document.getElementById('home-page')) {
            // The character page: only for someone already signed in.
            if (hasSession()) whenHomeVisible(show);
            return;
        }

        if (document.getElementById('join-form')) show();   // the classic login
    }

    // The deliberate switch on the classic login, which is always available
    // whether or not the prompt is due to appear.
    function wireLoginButton() {
        var button = document.getElementById('try-v2-btn');
        if (button) button.addEventListener('click', switchToV2);
    }

    function boot() {
        wireLoginButton();
        start();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }

    // Taking the offer, from the prompt or from either of the deliberate
    // switches on the classic pages. One place, so they cannot drift.
    function switchToV2() {
        write(UI_KEY, 'next');
        window.location.href = 'v2/';
    }

    // Exposed for the test suite, and for anyone who wants to see it again.
    window.Taphou5eInvite = {
        show: show,
        switchToV2: switchToV2,
        reset: function () {
            try { localStorage.removeItem(INVITE_KEY); } catch (e) { /* ignore */ }
        }
    };
})();
