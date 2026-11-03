// ========================================
// Bot check for logging in and creating a world
//
// world_login and world_create refuse any request that does not carry a
// solved ALTCHA challenge (supabase/migrations/*_altcha.sql). Solving one
// costs the browser about a second of hashing. That cost is the point: every
// scripted login attempt now pays it, and because the server does the
// checking, calling the API directly skips nothing.
//
// One invisible widget starts solving when the page loads, so a solution is
// usually ready before anyone has finished typing a PIN. Each solution works
// once: take() hands it over and starts on the next.
//
// Shared by the classic login (login.js) and v2's (v2/js/login.js), so the two
// cannot drift apart. Needs the altcha@3.4.1 widget script on the page.
// ========================================

(function () {
    const WAIT_MS = 20000;

    let widget = null;
    let loaded = false;
    let current = null;     // the solution being worked on, or ready

    function fresh() {
        const d = { done: false, failed: false };
        d.promise = new Promise(resolve => {
            d.resolve = payload => { d.done = true; resolve(payload); };
            d.fail = () => { d.done = true; d.failed = true; resolve(null); };
        });
        return d;
    }

    function solve() {
        current = fresh();
        if (loaded) widget.verify();
    }

    function init(supabaseUrl, apiKey) {
        if (widget) return;
        widget = document.createElement('altcha-widget');
        widget.setAttribute('display', 'invisible');
        widget.setAttribute('auto', 'off');
        widget.setAttribute('challenge', supabaseUrl + '/rest/v1/rpc/altcha_challenge');

        widget.addEventListener('load', () => {
            loaded = true;
            widget.configure({
                // The challenge comes from PostgREST, which wants the API key.
                fetch: (url, options = {}) => fetch(url, {
                    ...options,
                    headers: { ...(options.headers || {}), apikey: apiKey }
                })
            });
            if (current && !current.done) widget.verify();
        });
        widget.addEventListener('verified', ev => {
            if (current && !current.done) current.resolve(ev.detail.payload);
        });
        widget.addEventListener('statechange', ev => {
            if (ev.detail.state === 'error' && current && !current.done) current.fail();
        });
        // A challenge lasts ten minutes; someone who left the page open longer
        // would otherwise submit a solution the server will refuse.
        widget.addEventListener('expired', solve);

        current = fresh();
        document.body.appendChild(widget);
    }

    // Resolves to a payload, or to null if none could be made in time -- the
    // widget script blocked, say. Null is still sent: the server answers
    // captcha_required, and the page shows that like any other refusal.
    async function take() {
        if (!widget) return null;
        if (!current || current.failed) solve();
        const mine = current;
        const payload = await Promise.race([
            mine.promise,
            new Promise(resolve => setTimeout(() => resolve(null), WAIT_MS))
        ]);
        if (current === mine) solve();
        return payload;
    }

    window.Taphou5eAltcha = { init, take };
})();
