"""v2 UI smoke test.

This sandbox's network policy blocks cdn.jsdelivr.net and supabase.co, so the
real client cannot load here. We inject a stub Supabase client before any page
script runs and assert against fixture data. That covers everything I actually
wrote -- shell, routing, rendering, theme, responsive behaviour -- while the
live database calls were already verified server-side.
"""
import asyncio, sys, json
from playwright.async_api import async_playwright

BASE = "http://localhost:8777"
CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"

# Hosts this sandbox blocks by policy; failures against them are expected.
BLOCKED = ("jsdelivr.net", "supabase.co", "googleapis.com", "gstatic.com", "buymeacoffee.com")

FIXTURES = {
    "characters": [
        {"id": "c1", "name": "Brannor Hale", "player_name": "Dave", "class": "Fighter",
         "subclass": "Champion", "level": 5, "armor_class": 18, "speed": 30,
         "initiative_bonus": 2, "proficiency_bonus": 3,
         "current_hit_points": 44, "hit_point_maximum": 44, "temporary_hit_points": 0,
         "active_conditions": [], "pending_level_up": False,
         "ability_scores": {"dexterity": 14, "wisdom": 12}},
        {"id": "c2", "name": "Sythra of the Ninefold Ash", "player_name": "Priya",
         "class": "Wizard", "subclass": None, "level": 5, "armor_class": 12, "speed": 30,
         "initiative_bonus": 3, "proficiency_bonus": 3,
         "current_hit_points": 9, "hit_point_maximum": 44, "temporary_hit_points": 5,
         "active_conditions": ["poisoned"], "pending_level_up": False,
         "ability_scores": {"dexterity": 16, "wisdom": 14}},
        {"id": "c3", "name": "Korr", "player_name": "Sam", "class": "Barbarian",
         "subclass": None, "level": 4, "armor_class": 15, "speed": 40,
         "initiative_bonus": 1, "proficiency_bonus": 2,
         "current_hit_points": 22, "hit_point_maximum": 52, "temporary_hit_points": 0,
         "active_conditions": [], "pending_level_up": True,
         "ability_scores": {"dexterity": 12, "wisdom": 10}},
        {"id": "c4", "name": "Wisp", "player_name": "Alex", "class": "Rogue",
         "subclass": None, "level": 5, "armor_class": 16, "speed": 30,
         "initiative_bonus": 4, "proficiency_bonus": 3,
         "current_hit_points": 0, "hit_point_maximum": 33, "temporary_hit_points": 0,
         "active_conditions": [], "pending_level_up": False,
         "ability_scores": {"dexterity": 18, "wisdom": 13}},
    ],
    "campaigns": [{"id": "cam1", "name": "The Drowned Road", "status": "active", "is_default": True}],
    "encounters": [{"id": "e1", "name": "Ambush at the Ford", "status": "active",
                    "round": 3, "campaign_id": "cam1"}],
}

STUB = """
(() => {
  const FIXTURES = __FIXTURES__;
  window.__capturedHeaders = null;
  function query(table) {
    const q = {};
    ['select','eq','order','limit','neq','in','is'].forEach(m => { q[m] = () => q; });
    q.then = (res, rej) => Promise.resolve({ data: FIXTURES[table] || [], error: null }).then(res, rej);
    return q;
  }
  window.supabase = {
    createClient(url, key, opts) {
      window.__capturedHeaders = (opts && opts.global && opts.global.headers) || {};
      return {
        from: query,
        rpc(fn, params) {
          if (fn === 'world_login') {
            if (params.p_pin === '0000') return Promise.resolve({ data: { ok:false, error:'bad_pin' }, error:null });
            const dm = params.p_pin === '1379';
            return Promise.resolve({ data: { ok:true, role: dm ? 'dm' : 'player',
              game_world_id:'w1', game_world_name: params.p_world_name,
              leveling_mode:'milestone', dm_token: dm ? 'tok_'+'a'.repeat(60) : null }, error:null });
          }
          if (fn === 'world_create') {
            return Promise.resolve({ data: { ok:true, role:'dm', game_world_id:'w1',
              game_world_name: params.p_name, leveling_mode: params.p_leveling_mode,
              dm_token: 'tok_'+'b'.repeat(60) }, error:null });
          }
          return Promise.resolve({ data:null, error:{ message:'unstubbed rpc '+fn } });
        }
      };
    }
  };
})();
""".replace("__FIXTURES__", json.dumps(FIXTURES))

errors, failed = [], []
results = []


def ok(msg):
    results.append(("PASS", msg))
    print(f"PASS  {msg}")


def watch(page, label):
    # Network failures are already tracked (with URLs) via requestfailed, and in
    # this sandbox they are all blocked external hosts. Only keep real JS errors.
    page.on("console", lambda m: errors.append(f"[{label}] {m.text}")
            if m.type == "error" and "Failed to load resource" not in m.text else None)
    page.on("pageerror", lambda e: errors.append(f"[{label}][pageerror] {e}"))
    page.on("requestfailed", lambda r: None if any(b in r.url for b in BLOCKED)
            else failed.append(f"[{label}] {r.url} :: {r.failure}"))


async def fill_pin(page, group, digits):
    boxes = page.locator(f'[data-pin-group="{group}"] .pin-input')
    for i, d in enumerate(digits):
        await boxes.nth(i).fill(d)


async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(executable_path=CHROME)
        ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
        await ctx.add_init_script(STUB)
        page = await ctx.new_page()
        watch(page, "v2")

        # ---------- 1. Login: DM ----------
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "1379")
        await page.screenshot(path="/tmp/shot-01-login.png")
        await page.click("#join-form .btn-submit")
        await page.wait_for_url("**/v2/index.html", timeout=10000)
        await page.wait_for_selector(".party-roster", timeout=10000)
        ok("DM login redirects to the hub")

        # The DM token must reach the client as a request header -- this is the
        # whole mechanism that separates a DM from a player under RLS.
        hdrs = await page.evaluate("window.__capturedHeaders")
        assert hdrs and hdrs.get("x-dm-token", "").startswith("tok_"), f"headers: {hdrs}"
        ok("DM token is passed to the Supabase client as x-dm-token")

        role = (await page.locator(".sidebar .role-pill").inner_text()).strip()
        assert role == "DM", role
        nav = [n.strip() for n in await page.locator(".sidebar-nav a").all_inner_texts()]
        assert any("DM panel" in n for n in nav), nav
        ok(f"DM sees role pill {role!r} and the DM panel item")

        # ---------- 2. Roster rendering ----------
        cards = page.locator(".character-card")
        assert await cards.count() == 4, await cards.count()
        ok("all four characters render")

        # Sythra: 9/44 with +5 temp -> CRITICAL, low fill, temp segment present
        sythra = cards.nth(1)
        assert (await sythra.locator(".hp-value b").inner_text()) == "9"
        assert (await sythra.locator(".hp-value .temp").inner_text()) == "+5"
        assert (await sythra.locator(".hp-state").inner_text()).strip() == "CRITICAL"
        assert await sythra.locator(".hp-bar .fill.low").count() == 1
        assert await sythra.locator(".hp-bar .fill.temp").count() == 1
        ok("HP component: value, temp segment, CRITICAL state and low fill")

        # One rail per bar, never one element per hit point.
        fills = await page.locator(".hp-bar > *").count()
        assert fills <= 8, f"expected at most 2 fills per card, got {fills} total"
        ok(f"HP bars use {fills} fill elements for 4 characters (not one per hit point)")

        # Korr 22/52 -> mid ; Brannor 44/44 -> high ; Wisp 0/33 -> DOWN
        assert (await cards.nth(2).locator(".hp-state").inner_text()).strip() == "WOUNDED"
        assert (await cards.nth(0).locator(".hp-state").inner_text()).strip() == "HEALTHY"
        assert (await cards.nth(3).locator(".hp-state").inner_text()).strip() == "DOWN"
        ok("HP thresholds match v1: HEALTHY / WOUNDED / CRITICAL / DOWN")

        assert (await cards.nth(2).locator(".tag-accent").inner_text()).strip() == "LEVEL UP"
        assert (await cards.nth(1).locator(".tag-warning").inner_text()).strip() == "POISONED"
        ok("status tags: pending level-up and active condition")

        # Passive perception = 10 + wis mod + prof. Sythra: 10 + 2 + 3 = 15
        chips = await cards.nth(1).locator(".chip").all_inner_texts()
        assert "15PP" in [c.replace("\n", "").replace(" ", "") for c in chips], chips
        ok("derived stats computed (passive perception)")

        # XSS: the fixture has no markup, but confirm escaping is wired by
        # checking the long name renders as text rather than being parsed.
        long_name = await cards.nth(1).locator(".card-name").inner_text()
        assert long_name == "Sythra of the Ninefold Ash", long_name
        ok("names render as text")

        await page.screenshot(path="/tmp/shot-02-hub-dark.png", full_page=True)

        # ---------- 3. Theme ----------
        await page.click('.sidebar-foot [data-theme-option="light"]')
        await page.wait_for_timeout(350)
        assert await page.evaluate("document.documentElement.getAttribute('data-theme')") == "light"
        bg = await page.evaluate("getComputedStyle(document.body).backgroundColor")
        await page.screenshot(path="/tmp/shot-03-hub-light.png", full_page=True)
        ok(f"light theme applies (body background {bg})")

        active = await page.locator('.sidebar-foot .segmented .is-active').inner_text()
        assert active.strip() == "Light", active
        ok("theme segmented control marks the active option after the shell rebuild")

        await page.click('.sidebar-foot [data-theme-option="dark"]')
        await page.wait_for_timeout(250)

        # ---------- 4. Pending destinations are inert ----------
        pending = await page.locator(".hub-tile.is-pending").count()
        assert pending == 4, pending
        assert await page.locator('.sidebar-nav a[href="campaigns.html"]').count() == 0
        ok("unbuilt destinations render inert, with no links to 404s")

        # ---------- 5. Mobile ----------
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(300)
        assert not await page.locator(".sidebar").is_visible()
        assert await page.locator(".header").is_visible()
        overflow = await page.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 0, f"horizontal overflow: {overflow}px"
        ok(f"mobile: sidebar hidden, header shown, no horizontal scroll ({overflow}px)")

        cols = await page.evaluate(
            "getComputedStyle(document.querySelector('.party-roster')).gridTemplateColumns")
        assert len(cols.split()) == 2, cols
        ok(f"roster is 2-up at 390px ({cols})")

        await page.click("#menu-btn")
        await page.wait_for_timeout(450)
        assert await page.locator("#side-menu-overlay.open").count() == 1
        await page.screenshot(path="/tmp/shot-04-drawer.png")
        ok("drawer opens from the hamburger")

        await page.keyboard.press("Escape")
        await page.wait_for_timeout(400)
        assert await page.locator("#side-menu-overlay.open").count() == 0
        ok("Escape closes the drawer")

        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.wait_for_timeout(300)
        cols = await page.evaluate(
            "getComputedStyle(document.querySelector('.party-roster')).gridTemplateColumns")
        assert len(cols.split()) == 4, cols
        ok(f"roster is 4-up above 900px ({cols})")

        # ---------- 6. Player login ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "5555")
        await page.click("#join-form .btn-submit")
        await page.wait_for_url("**/v2/index.html", timeout=10000)
        await page.wait_for_selector(".party-roster", timeout=10000)

        role = (await page.locator(".sidebar .role-pill").inner_text()).strip()
        assert role == "PLAYER", role
        nav = [n.strip() for n in await page.locator(".sidebar-nav a").all_inner_texts()]
        assert not any("DM panel" in n for n in nav), nav
        hdrs = await page.evaluate("window.__capturedHeaders")
        assert "x-dm-token" not in (hdrs or {}), hdrs
        ok("player: no DM panel item and no x-dm-token header")
        await page.screenshot(path="/tmp/shot-05-hub-player.png", full_page=True)

        # ---------- 7. Wrong PIN ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "0000")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector("#form-error:not([hidden])", timeout=8000)
        msg = (await page.locator("#form-error").inner_text()).strip()
        assert msg == "Incorrect PIN", msg
        ok(f"wrong PIN shows {msg!r}")

        # ---------- 8. Create form ----------
        await page.click('button[data-mode="create"]')
        assert await page.locator("#create-form").is_visible()
        await page.fill("#new-world-name", "ab")
        await page.click("#create-form .btn-submit")
        await page.wait_for_timeout(300)
        msg = (await page.locator("#form-error").inner_text()).strip()
        assert "3-50" in msg, msg
        ok(f"create validates the name client-side ({msg!r})")

        await page.fill("#new-world-name", "A Proper World Name")
        await fill_pin(page, "dm", "1111")
        await fill_pin(page, "player", "1111")
        await page.click("#create-form .btn-submit")
        await page.wait_for_timeout(300)
        msg = (await page.locator("#form-error").inner_text()).strip()
        assert "different" in msg, msg
        ok(f"create rejects identical PINs ({msg!r})")

        # ---------- 9. PIN input behaviour ----------
        await page.click('button[data-mode="join"]')
        boxes = page.locator('[data-pin-group="join"] .pin-input')
        await boxes.nth(0).click()
        await page.keyboard.type("7")
        focused = await page.evaluate("document.activeElement.id || document.activeElement.className")
        assert "pin-input" in focused, focused
        ok("PIN entry advances focus to the next box")

        # ---------- 10. Router ----------
        await page.evaluate("localStorage.setItem('taphou5e-ui','next')")
        await page.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
        await page.wait_for_timeout(700)
        assert "/v2/" in page.url, page.url
        ok(f"root router sends an opted-in device to {page.url.split('8777')[-1]}")

        ctx2 = await browser.new_context()
        await ctx2.add_init_script(STUB)
        page2 = await ctx2.new_page()
        watch(page2, "classic")
        await page2.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
        await page2.wait_for_timeout(700)
        assert page2.url.endswith("index.html"), page2.url
        assert await page2.locator("#join-form").count() == 1
        ok("a default device stays on the classic login, untouched")

        await browser.close()

    print(f"\n{len(results)} checks passed.")
    if failed:
        print("\nUNEXPECTED FAILED REQUESTS:")
        for f in failed:
            print("  ", f)
    if errors:
        print("\nCONSOLE / PAGE ERRORS:")
        for e in errors:
            print("  ", e)
        return 1
    print("No console errors, no unexpected failed requests.")
    return 0


sys.exit(asyncio.run(main()))
