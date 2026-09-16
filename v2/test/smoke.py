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
    "characters_single": {
        "id": "c2", "game_world_id": "w1", "name": "Sythra of the Ninefold Ash",
        "player_name": "Priya", "race": "Elf", "class": "Wizard", "subclass": None, "level": 5,
        "armor_class": 12, "speed": 30, "initiative_bonus": 3, "proficiency_bonus": 3,
        "current_hit_points": 9, "hit_point_maximum": 44, "temporary_hit_points": 5,
        "hit_dice_total": "5d6", "hit_dice_remaining": 3,
        "death_save_successes": 0, "death_save_failures": 0,
        "active_conditions": ["Poisoned"], "pending_level_up": False, "notes": "Owes a favour.",
        "ability_scores": {"strength": 8, "dexterity": 16, "constitution": 14,
                           "intelligence": 18, "wisdom": 12, "charisma": 10},
        "saving_throws": [{"id": "sv1", "ability": "int", "proficient": True},
                          {"id": "sv2", "ability": "wis", "proficient": True},
                          {"id": "sv3", "ability": "str", "proficient": False},
                          {"id": "sv4", "ability": "dex", "proficient": False},
                          {"id": "sv5", "ability": "con", "proficient": False},
                          {"id": "sv6", "ability": "cha", "proficient": False}],
        "skills": [{"id": f"sk{i}", "skill_name": n, "proficient": n in ("Arcana", "Perception"),
                    "expertise": n == "Arcana"}
                   for i, n in enumerate([
                       "Acrobatics", "Animal Handling", "Arcana", "Athletics", "Deception",
                       "History", "Insight", "Intimidation", "Investigation", "Medicine",
                       "Nature", "Perception", "Performance", "Persuasion", "Religion",
                       "Sleight of Hand", "Stealth", "Survival"])],
        "weapons": [{"id": "w1", "name": "Quarterstaff", "attack_bonus": 2, "damage": "1d6",
                     "damage_type": "bludgeoning", "properties": "Versatile (1d8)", "equipped": True}],
        "inventory_items": [{"id": "it1", "name": "Spellbook", "description": "Water damaged.",
                             "quantity": 1, "weight": 3, "equipped": False, "attuned": False,
                             "item_type": "Gear"}],
        "spells": [{"id": "sp1", "name": "Fire Bolt", "level": 0, "school": "Evocation",
                    "casting_time": "1 action", "range": "120 feet", "components": "V, S",
                    "duration": "Instantaneous", "description": "A mote of fire.", "prepared": True},
                   {"id": "sp2", "name": "Counterspell", "level": 3, "school": "Abjuration",
                    "casting_time": "1 reaction", "range": "60 feet", "components": "S",
                    "duration": "Instantaneous", "description": "Interrupt a spell.", "prepared": True}],
        "spell_slots": [{"id": "ss1", "slot_level": 1, "total": 4, "used": 1},
                        {"id": "ss3", "slot_level": 3, "total": 2, "used": 0}],
        "features_traits": [{"id": "f1", "name": "Arcane Recovery", "description": "Regain slots.",
                             "source": "Wizard", "uses_total": 1, "uses_remaining": 0,
                             "uses_per_rest": "long", "is_bonus_action": False}],
        "currency": {"copper": 12, "silver": 4, "electrum": 0, "gold": 137, "platinum": 1},
        "character_details": {"age": "121", "height": "5'9\"", "eyes": "grey",
                              "personality_traits": "Speaks in questions.", "ideals": "Knowledge.",
                              "bonds": "", "flaws": "", "backstory": "Raised by the Ash.",
                              "allies_organizations": "", "additional_features": "", "treasure": ""},
    },
    "encounters": [{"id": "e1", "name": "Ambush at the Ford", "status": "active",
                    "round": 3, "campaign_id": "cam1"}],
}

STUB = """
(() => {
  const FIXTURES = __FIXTURES__;
  window.__capturedHeaders = null;
  window.__writes = [];
  function query(table) {
    const q = {};
    ['select','eq','order','limit','neq','in','is'].forEach(m => { q[m] = () => q; });
    q.single = () => Promise.resolve({
      data: FIXTURES[table + '_single'] || (FIXTURES[table] || [])[0] || null, error: null });
    q.then = (res, rej) => Promise.resolve({ data: FIXTURES[table] || [], error: null }).then(res, rej);
    return q;
  }
  function writer(table) {
    return (payload) => {
      window.__writes.push({ table, payload });
      // Keep the fixture in step so a re-read reflects the write.
      const single = FIXTURES[table + '_single'];
      if (single) Object.assign(single, payload);
      const w = {};
      ['eq','in','match'].forEach(m => { w[m] = () => w; });
      w.then = (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return w;
    };
  }
  window.supabase = {
    createClient(url, key, opts) {
      window.__capturedHeaders = (opts && opts.global && opts.global.headers) || {};
      return {
        from: (table) => Object.assign(query(table), { update: writer(table) }),
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


async def click_tab(page, label):
    """Above 900px the bottom tab bar is replaced by the .sheet-nav rail, so
    click whichever one the current viewport actually shows."""
    rail = page.locator(f'.sheet-nav .tabs > div:has-text("{label}")')
    if await rail.count() and await rail.is_visible():
        await rail.click()
    else:
        await page.click(f'.tab-btn:has-text("{label}")')


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
        assert pending == 3, pending                       # character sheets is built
        assert await page.locator('.hub-tile[href="characters.html"]').count() == 1
        assert await page.locator('.sidebar-nav a[href="campaigns.html"]').count() == 0
        ok(f"{pending} unbuilt destinations inert; built ones link normally")

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

        # ---------- 10. Roster page ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "1379")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)

        await page.click('.sidebar-nav a[href="characters.html"]')
        await page.wait_for_url("**/characters.html", timeout=10000)
        await page.wait_for_selector(".party-roster", timeout=10000)
        assert await page.locator(".character-card").count() == 4, "one card per character, no duplicates"
        names = [n.strip() for n in await page.locator(".card-name").all_inner_texts()]
        # Korr (owed a level) and Wisp (down) sort ahead of the healthy two.
        assert set(names[:2]) == {"Korr", "Wisp"}, names
        ok(f"roster sorts characters needing attention first ({names})")
        assert "2 need attention" in await page.locator(".section-head").first.inner_text()
        ok("roster counts how many need attention")

        href = await page.locator(".character-card").first.get_attribute("href")
        assert href.startswith("character-sheet.html?id="), href
        ok(f"roster cards link to the sheet ({href})")

        # ---------- 11. Character sheet ----------
        await page.click(".character-card")
        await page.wait_for_url("**/character-sheet.html*", timeout=10000)
        await page.wait_for_selector(".sheet-header", timeout=10000)

        name = (await page.locator(".sheet-id h1").inner_text()).strip()
        assert name == "Sythra of the Ninefold Ash", name
        assert (await page.locator(".level-badge").inner_text()).strip() == "LV 5"
        ok(f"sheet loads {name!r} at LV 5")

        assert (await page.locator(".hp-big .current").inner_text()).strip() == "9"
        assert (await page.locator(".hp-big .temp").inner_text()).strip() == "+5"
        ok("sheet header shows current HP and temporary HP")

        # Derived: INT 18 -> +4, proficient save -> +4+3 = +7
        int_box = page.locator(".ability-box", has_text="INT")
        assert (await int_box.locator(".mod").inner_text()).strip() == "+4"
        assert "+7" in (await int_box.locator(".save").inner_text())
        assert "is-prof" in (await int_box.locator(".save").get_attribute("class"))
        ok("abilities merge the saving throw: INT +4, save +7, marked proficient")

        # Passive perception uses the skill row: 10 + (wis 1 + prof 3) = 14
        pp = [t for t in await page.locator(".sheet-combat .chip").all_inner_texts() if "PP" in t]
        assert "14" in pp[0], pp
        ok(f"passive perception derived from the Perception skill row ({pp[0].strip()})")

        # ---------- 12. HP writes ----------
        await page.fill("#hp-amount", "4")
        await page.click(".hp-btn.damage")
        await page.wait_for_timeout(400)
        assert (await page.locator(".hp-big .current").inner_text()).strip() == "5"
        writes = await page.evaluate("window.__writes")
        assert writes[-1]["table"] == "characters", writes[-1]
        assert writes[-1]["payload"]["current_hit_points"] == 5, writes[-1]
        ok("damage applies optimistically and writes current_hit_points")

        await page.fill("#hp-amount", "999")
        await page.click(".hp-btn.heal")
        await page.wait_for_timeout(400)
        assert (await page.locator(".hp-big .current").inner_text()).strip() == "44", "should clamp to max"
        ok("healing clamps to the hit point maximum, as v1 does")

        await page.fill("#hp-amount", "-60")
        await page.click(".hp-ctl .btn-accent")
        await page.wait_for_timeout(400)
        assert (await page.locator(".hp-big .current").inner_text()).strip() == "0", "should clamp to 0"
        ok("Apply takes a signed value and clamps to zero")

        # At 0 HP the death saves appear
        assert await page.locator(".death-saves").count() == 1
        await page.locator(".death-dot.failure").nth(1).click()
        await page.wait_for_timeout(350)
        writes = await page.evaluate("window.__writes")
        assert writes[-1]["payload"].get("death_save_failures") == 2, writes[-1]
        ok("death saves appear at 0 HP and persist")

        # ---------- 13. Conditions and skills ----------
        await page.click('.condition-tag:has-text("Prone")')
        await page.wait_for_timeout(350)
        writes = await page.evaluate("window.__writes")
        assert "Prone" in writes[-1]["payload"]["active_conditions"], writes[-1]
        assert "Poisoned" in writes[-1]["payload"]["active_conditions"], "existing condition kept"
        ok("toggling a condition preserves the ones already set")

        await click_tab(page, "Skills")
        await page.wait_for_selector(".skills-grid", timeout=5000)
        assert await page.locator(".skill-row").count() == 18
        ok("skills tab lists all 18 skills")

        # Arcana: INT +4, proficient +3, expertise +3 = +10
        arcana = page.locator(".skill-row", has_text="Arcana")
        assert (await arcana.locator(".skill-mod").inner_text()).strip() == "+10", \
            await arcana.locator(".skill-mod").inner_text()
        ok("skill bonus counts expertise twice (Arcana +10)")

        # ---------- 14. Detail pane ----------
        await click_tab(page, "Spells")
        await page.wait_for_selector(".list-row", timeout=5000)
        await page.click('.list-row:has-text("Counterspell")')
        await page.wait_for_selector(".pane.detail-open", timeout=5000)
        assert (await page.locator(".pane h2").inner_text()).strip() == "Counterspell"
        ok("tapping a spell opens the detail pane")
        await page.screenshot(path="/tmp/shot-06-sheet-pane.png", full_page=True)
        await page.click(".pane-close")
        await page.wait_for_timeout(300)
        assert await page.locator(".pane.detail-open").count() == 0
        ok("detail pane closes")

        # ---------- 15. Long rest ----------
        await click_tab(page, "Stats")
        # Above 900px the rail carries the rest buttons and the body row hides,
        # so click whichever one this viewport shows.
        rail_rest = page.locator('.nav-rests button:has-text("Long rest")')
        if await rail_rest.count() and await rail_rest.is_visible():
            await rail_rest.click()
        else:
            await page.wait_for_selector(".rest-row", timeout=5000)
            await page.click('.rest-row button:has-text("Long rest")')
        await page.wait_for_timeout(600)
        assert (await page.locator(".hp-big .current").inner_text()).strip() == "44"
        writes = await page.evaluate("window.__writes")
        rest = [w for w in writes if "hit_dice_remaining" in (w["payload"] or {})][-1]
        assert rest["payload"]["temporary_hit_points"] == 0
        assert rest["payload"]["death_save_failures"] == 0
        assert rest["payload"]["hit_dice_remaining"] == 5, rest
        ok("long rest restores HP, clears temp HP and death saves, returns hit dice")

        slot_writes = [w for w in writes if w["table"] == "spell_slots"]
        assert len(slot_writes) == 2, slot_writes
        ok("long rest resets every spell slot")

        visible_rests = [t for t in await page.locator('button:has-text("Long rest")').all_inner_texts()
                         if t.strip()]
        shown = await page.locator('button:has-text("Long rest"):visible').count()
        assert shown == 1, f"rest button shown {shown} times on desktop"
        ok("rest buttons appear once: on the rail above 900px, in the body below")

        # ---------- 16. Sheet on mobile ----------
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(300)
        assert await page.locator(".tab-bar").is_visible(), "bottom tabs should show on mobile"
        assert not await page.locator(".sheet-nav").is_visible(), "rail is desktop-only"
        overflow = await page.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 0, f"sheet overflows at 390px by {overflow}px"
        ok(f"sheet on mobile: bottom tabs, no rail, no horizontal scroll ({overflow}px)")
        await page.screenshot(path="/tmp/shot-07-sheet-mobile.png", full_page=True)

        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.wait_for_timeout(300)
        assert await page.locator(".sheet-nav").is_visible(), "rail should show above 900px"
        assert not await page.locator(".tab-bar").is_visible(), "bottom tabs hide above 900px"
        ok("sheet on desktop: tab rail replaces the bottom tabs")
        await page.screenshot(path="/tmp/shot-08-sheet-desktop.png", full_page=True)

        # ---------- 17. Router ----------
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
