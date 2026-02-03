// ========================================
// Side Menu - Hamburger Navigation
// ========================================

(function() {
    const isMonsterTracker = window.location.pathname.includes('monster-tracker');

    // Inject side menu HTML into the page
    const menuHTML = `
        <div id="side-menu-overlay" class="side-menu-overlay">
            <div id="side-menu" class="side-menu">
                <div class="side-menu-header">
                    <span class="side-menu-title">Menu</span>
                    <button id="side-menu-close" class="side-menu-close">&times;</button>
                </div>
                <nav class="side-menu-nav">
                    <a id="sm-character-sheets" class="side-menu-item hidden">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="8" r="5"/>
                            <path d="M20 21a8 8 0 0 0-16 0"/>
                        </svg>
                        Character Sheets
                    </a>
                    <a id="sm-player-config" class="side-menu-item hidden">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <circle cx="12" cy="8" r="5"/>
                            <path d="M20 21a8 8 0 0 0-16 0"/>
                        </svg>
                        Player Config
                    </a>
                    <a id="sm-monster-tracker" class="side-menu-item hidden">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="m12.5 17-.5-1-.5 1h1z"/>
                            <path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/>
                            <circle cx="15" cy="12" r="1"/>
                            <circle cx="9" cy="12" r="1"/>
                        </svg>
                        Monster Tracker
                    </a>
                    <div id="sm-dm-divider" class="side-menu-divider hidden"></div>
                    <a id="sm-delete-char" class="side-menu-item side-menu-item-danger hidden">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 6h18"/>
                            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/>
                            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
                        </svg>
                        Delete Character
                    </a>
                    <div id="sm-delete-divider" class="side-menu-divider hidden"></div>
                    <a id="sm-logout" class="side-menu-item">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                            <polyline points="16 17 21 12 16 7"/>
                            <line x1="21" y1="12" x2="9" y2="12"/>
                        </svg>
                        Logout
                    </a>
                </nav>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', menuHTML);

    const overlay = document.getElementById('side-menu-overlay');
    const closeBtn = document.getElementById('side-menu-close');

    function openSideMenu() {
        updateMenuVisibility();
        overlay.classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function closeSideMenu() {
        overlay.classList.remove('open');
        document.body.style.overflow = '';
    }

    function getSession() {
        // On characters.html, app.js exposes currentSession as a global
        if (typeof currentSession !== 'undefined' && currentSession) return currentSession;
        // On monster-tracker.html, read from mtSession or localStorage directly
        if (typeof mtSession !== 'undefined' && mtSession) return mtSession;
        try {
            const raw = localStorage.getItem('dnd-session') || sessionStorage.getItem('dnd-session');
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function updateMenuVisibility() {
        const session = getSession();
        const isDM = session && session.role === 'dm';
        const onCharacterPage = typeof currentCharacter !== 'undefined' && currentCharacter !== null;

        // Character Sheets link (only on monster-tracker page)
        const charSheets = document.getElementById('sm-character-sheets');
        if (isMonsterTracker) {
            charSheets.classList.remove('hidden');
        } else {
            charSheets.classList.add('hidden');
        }

        // Monster Tracker link (only on characters page, DM only)
        const monsterTracker = document.getElementById('sm-monster-tracker');
        if (!isMonsterTracker && isDM) {
            monsterTracker.classList.remove('hidden');
        } else {
            monsterTracker.classList.add('hidden');
        }

        // Player Config (DM only, characters page only)
        const playerConfig = document.getElementById('sm-player-config');
        const dmDivider = document.getElementById('sm-dm-divider');
        if (!isMonsterTracker && isDM) {
            playerConfig.classList.remove('hidden');
            dmDivider.classList.remove('hidden');
        } else {
            playerConfig.classList.add('hidden');
            dmDivider.classList.add('hidden');
        }

        // Delete character (only on character detail page)
        const deleteChar = document.getElementById('sm-delete-char');
        const deleteDivider = document.getElementById('sm-delete-divider');
        if (!isMonsterTracker && onCharacterPage) {
            deleteChar.classList.remove('hidden');
            deleteDivider.classList.remove('hidden');
        } else {
            deleteChar.classList.add('hidden');
            deleteDivider.classList.add('hidden');
        }

        // Show "Login" instead of "Logout" when not logged in on monster-tracker
        const logoutItem = document.getElementById('sm-logout');
        if (isMonsterTracker && !session) {
            logoutItem.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
                    <polyline points="10 17 15 12 10 7"/>
                    <line x1="15" y1="12" x2="3" y2="12"/>
                </svg>
                Login
            `;
        } else {
            logoutItem.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                    <polyline points="16 17 21 12 16 7"/>
                    <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Logout
            `;
        }
    }

    // Open menu from any hamburger button
    document.getElementById('menu-btn')?.addEventListener('click', openSideMenu);
    document.getElementById('char-menu-btn')?.addEventListener('click', openSideMenu);
    document.getElementById('mt-menu-btn')?.addEventListener('click', openSideMenu);

    // Close menu
    closeBtn.addEventListener('click', closeSideMenu);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeSideMenu();
    });

    // Menu item actions
    document.getElementById('sm-character-sheets').addEventListener('click', () => {
        window.location.href = 'characters.html';
    });

    document.getElementById('sm-monster-tracker').addEventListener('click', () => {
        window.location.href = 'monster-tracker.html';
    });

    document.getElementById('sm-player-config').addEventListener('click', () => {
        closeSideMenu();
        if (typeof renderDMPanel === 'function') renderDMPanel();
        if (typeof showPage === 'function') showPage('dm-panel-page');
    });

    document.getElementById('sm-delete-char').addEventListener('click', () => {
        closeSideMenu();
        if (typeof openDeleteModal === 'function') openDeleteModal();
    });

    document.getElementById('sm-logout').addEventListener('click', () => {
        if (typeof clearSession === 'function') clearSession();
        window.location.href = 'index.html';
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('open')) {
            closeSideMenu();
        }
    });
})();
