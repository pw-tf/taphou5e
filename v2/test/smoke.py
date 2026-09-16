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
         "active_conditions": [], "pending_level_up": False, "race": "Human",
         "experience_points": 14000,
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
         "active_conditions": [], "pending_level_up": True, "race": "Goliath",
         "experience_points": 6000,
         "ability_scores": {"dexterity": 12, "wisdom": 10}},
        {"id": "c4", "name": "Wisp", "player_name": "Alex", "class": "Rogue",
         "subclass": None, "level": 5, "armor_class": 16, "speed": 30,
         "initiative_bonus": 4, "proficiency_bonus": 3,
         "current_hit_points": 0, "hit_point_maximum": 33, "temporary_hit_points": 0,
         "active_conditions": [], "pending_level_up": False,
         "ability_scores": {"dexterity": 18, "wisdom": 13}},
    ],
    "campaigns": [{"id": "cam1", "name": "The Drowned Road", "status": "active", "is_default": True}],
    "game_worlds_single": {"id": "w1", "name": "Thornfell Reach", "leveling_mode": "milestone"},
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
    "campaigns_single": {"id": "cam1", "game_world_id": "w1", "name": "The Drowned Road",
                         "summary": "Something is stopping the barges.", "status": "active",
                         "is_default": True, "sort_order": 0},
    "campaign_characters": [
        {"id": "mem1", "campaign_id": "cam1", "character_id": "c1", "game_world_id": "w1",
         "status": "active", "left_at": None},
        {"id": "mem2", "campaign_id": "cam1", "character_id": "c2", "game_world_id": "w1",
         "status": "inactive", "left_at": "2026-08-01T00:00:00Z"}],
    "storylines": [{"id": "st1", "campaign_id": "cam1", "game_world_id": "w1",
                    "title": "The Toll Keeper", "player_summary": "Someone is taxing the ford.",
                    "body": "It is the harbourmaster.", "status": "active",
                    "is_revealed": True, "sort_order": 0}],
    "storyline_beats": [
        {"id": "b1", "storyline_id": "st1", "game_world_id": "w1", "title": "The first crossing",
         "read_aloud": "Mist hangs over the water.", "body": "", "status": "in_progress",
         "is_revealed": True, "sort_order": 0},
        {"id": "b2", "storyline_id": "st1", "game_world_id": "w1", "title": "Who pays the toll",
         "read_aloud": "", "body": "The truth.", "status": "pending",
         "is_revealed": False, "sort_order": 1}],
    "campaign_checks": [{"id": "ck1", "campaign_id": "cam1", "game_world_id": "w1",
                         "storyline_beat_id": "b1", "label": "Spot the tripwire",
                         "check_type": "skill_check", "ability": None, "skill_name": "Perception",
                         "dc": 14, "is_secret": True, "sort_order": 0}],
    "areas": [
        {"id": "a1", "campaign_id": "cam1", "game_world_id": "w1", "parent_area_id": None,
         "name": "The Drowned Road", "area_type": "region", "description": "Flooded lowland.",
         "is_discovered": True, "sort_order": 0},
        {"id": "a2", "campaign_id": "cam1", "game_world_id": "w1", "parent_area_id": "a1",
         "name": "Sel", "area_type": "settlement", "description": "A barge town.",
         "is_discovered": False, "sort_order": 1}],
    "npcs": [{"id": "n1", "campaign_id": "cam1", "game_world_id": "w1", "area_id": "a2",
              "monster_id": None, "name": "Harbourmaster Vell", "title": "Harbourmaster of Sel",
              "faction": "The Guild", "description": "Weathered and watchful.",
              "disposition": "neutral", "status": "alive", "is_known_to_players": False,
              "sort_order": 0}],
    "campaign_monsters": [
        {"id": "m1", "campaign_id": "cam1", "game_world_id": "w1",
         "name": "Bog Lurker", "source": "homebrew", "api_index": None,
         "challenge_rating": 2, "armor_class": 13, "max_hit_points": 44},
        {"id": "m2", "campaign_id": "cam1", "game_world_id": "w1",
         "name": "Gargoyle", "source": "srd_api", "api_index": "gargoyle",
         "challenge_rating": 2, "armor_class": 15, "max_hit_points": 52}],
    "campaign_sessions": [{"id": "sess1", "campaign_id": "cam1", "game_world_id": "w1",
                           "session_number": 4, "title": "The bridge at dusk",
                           "played_on": "2026-09-01", "recap": "They met Vell.",
                           "is_published": True}],
    "srd_monsters": {"count": 3, "results": [
        {"index": "goblin", "name": "Goblin", "url": "/api/monsters/goblin"},
        {"index": "gargoyle", "name": "Gargoyle", "url": "/api/monsters/gargoyle"},
        {"index": "ancient-red-dragon", "name": "Ancient Red Dragon",
         "url": "/api/monsters/ancient-red-dragon"}]},
    "srd_monster_goblin": {
        "index": "goblin", "name": "Goblin", "size": "Small", "type": "humanoid",
        "alignment": "neutral evil", "armor_class": [{"type": "armor", "value": 15}],
        "hit_points": 7, "hit_dice": "2d6", "challenge_rating": 0.25,
        "strength": 8, "dexterity": 14, "constitution": 10,
        "intelligence": 10, "wisdom": 8, "charisma": 8,
        "speed": {"walk": "30 ft."},
        "special_abilities": [{"name": "Nimble Escape", "desc": "Disengage as a bonus action."}],
        "actions": [{"name": "Scimitar", "desc": "Melee weapon attack."}]},
    "srd_spells": {"count": 2, "results": [
        {"index": "fireball", "name": "Fireball", "url": "/api/spells/fireball"},
        {"index": "mage-hand", "name": "Mage Hand", "url": "/api/spells/mage-hand"}]},
    "srd_spell_fireball": {
        "index": "fireball", "name": "Fireball", "level": 3,
        "school": {"name": "Evocation"}, "casting_time": "1 action", "range": "150 feet",
        "components": ["V", "S", "M"], "material": "a tiny ball of bat guano",
        "duration": "Instantaneous", "desc": ["A bright streak flashes."],
        "higher_level": ["Damage increases by 1d6."]},
    "encounters_single": {"id": "e1", "campaign_id": "cam1", "game_world_id": "w1",
                          "name": "Ambush at the Ford", "status": "planned", "round": 0,
                          "active_combatant_id": None, "hide_monster_hp": True,
                          "read_aloud": "Mist hangs over the water.", "area_id": None,
                          "storyline_beat_id": None},
    "encounter_combatants": [
        {"id": "cb1", "encounter_id": "e1", "game_world_id": "w1", "combatant_type": "character",
         "character_id": "c2", "campaign_monster_id": None, "npc_id": None,
         "display_name": "Sythra of the Ninefold Ash", "initiative": 17, "armor_class": 12,
         "max_hit_points": None, "current_hit_points": None, "temporary_hit_points": None,
         "conditions": [], "is_defeated": False, "has_acted": False, "sort_order": 0},
        {"id": "cb2", "encounter_id": "e1", "game_world_id": "w1", "combatant_type": "monster",
         "character_id": None, "campaign_monster_id": "m2", "npc_id": None,
         "display_name": "Gargoyle 1", "initiative": 12, "armor_class": 15,
         "max_hit_points": 52, "current_hit_points": 52, "temporary_hit_points": 0,
         "conditions": [], "is_defeated": False, "has_acted": False, "sort_order": 1},
        {"id": "cb3", "encounter_id": "e1", "game_world_id": "w1", "combatant_type": "monster",
         "character_id": None, "campaign_monster_id": "m1", "npc_id": None,
         "display_name": "Bog Lurker", "initiative": None, "armor_class": 13,
         "max_hit_points": 44, "current_hit_points": 44, "temporary_hit_points": 0,
         "conditions": [], "is_defeated": False, "has_acted": False, "sort_order": 2},
        {"id": "cb4", "encounter_id": "e1", "game_world_id": "w1", "combatant_type": "monster",
         "character_id": None, "campaign_monster_id": "m2", "npc_id": None,
         "display_name": "Gargoyle 2", "initiative": 8, "armor_class": 15,
         "max_hit_points": 48, "current_hit_points": 30, "temporary_hit_points": 0,
         "conditions": [], "is_defeated": False, "has_acted": False, "sort_order": 3,
         "color": "#3d5a72", "group_label": "Wave 2", "notes": "Holds the far bank."},
        {"id": "cb5", "encounter_id": "e1", "game_world_id": "w1", "combatant_type": "monster",
         "character_id": None, "campaign_monster_id": "m2", "npc_id": None,
         "display_name": "Gargoyle 3", "initiative": 7, "armor_class": 15,
         "max_hit_points": 48, "current_hit_points": 48, "temporary_hit_points": 0,
         "conditions": [], "is_defeated": False, "has_acted": False, "sort_order": 4,
         "color": "#3d5a72", "group_label": "Wave 2"}],
    "dm_notes": [{"id": "dn1", "game_world_id": "w1", "campaign_id": "cam1", "area_id": None,
                  "storyline_id": None, "storyline_beat_id": None, "npc_id": None,
                  "encounter_id": None, "campaign_session_id": None,
                  "body": "Vell is the villain."}],
}

STUB = """
(() => {
  const FIXTURES = __FIXTURES__;
  window.__capturedHeaders = null;
  // Writes survive a navigation. Import redirects to the new encounter on
  // success, so an in-memory list would be wiped before the test could read
  // what was created.
  const WRITE_KEY = '__smoke_writes';
  try { window.__writes = JSON.parse(sessionStorage.getItem(WRITE_KEY) || '[]'); }
  catch (e) { window.__writes = []; }
  function recordWrite(entry) {
    window.__writes.push(entry);
    try { sessionStorage.setItem(WRITE_KEY, JSON.stringify(window.__writes)); } catch (e) {}
  }
  window.__resetWrites = () => {
    window.__writes = [];
    try { sessionStorage.removeItem(WRITE_KEY); } catch (e) {}
  };
  function query(table) {
    const q = {};
    ['select','eq','order','limit','neq','in','is'].forEach(m => { q[m] = () => q; });
    q.single = () => Promise.resolve({
      data: FIXTURES[table + '_single'] || (FIXTURES[table] || [])[0] || null, error: null });
    q.then = (res, rej) => Promise.resolve({ data: FIXTURES[table] || [], error: null }).then(res, rej);
    return q;
  }
  function writer(table, verb) {
    return (payload) => {
      recordWrite({ table, verb, payload: payload || null });
      const single = FIXTURES[table + '_single'];
      if (verb === 'update' && single) Object.assign(single, payload);
      // Mirror an update onto the list fixture too, so a re-read reflects it.
      if (verb === 'update' && Array.isArray(FIXTURES[table]) && window.__lastEq) {
        const row = FIXTURES[table].find(r => r.id === window.__lastEq);
        if (row) Object.assign(row, payload);
      }
      const w = {};
      ['in','match'].forEach(m => { w[m] = () => w; });
      w.eq = (_col, val) => { window.__lastEq = val;
        if (verb === 'update' && Array.isArray(FIXTURES[table])) {
          const row = FIXTURES[table].find(r => r.id === val);
          if (row) Object.assign(row, payload);
        }
        return w; };
      w.select = () => w;
      w.single = () => Promise.resolve({ data: { id: 'new-id' }, error: null });
      w.then = (res, rej) => Promise.resolve({ data: null, error: null }).then(res, rej);
      return w;
    };
  }
  // dnd5eapi.co is blocked in this sandbox, so serve the SRD from fixtures.
  const realFetch = window.fetch.bind(window);
  window.__srdCalls = [];
  window.fetch = (input, init) => {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    if (url.indexOf('dnd5eapi.co') === -1) return realFetch(input, init);
    window.__srdCalls.push(url);
    const json = (body) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    if (/\/api\/monsters$/.test(url))          return json(FIXTURES.srd_monsters);
    if (/\/api\/spells$/.test(url))            return json(FIXTURES.srd_spells);
    if (/\/api\/monsters\/goblin$/.test(url)) return json(FIXTURES.srd_monster_goblin);
    if (/\/api\/spells\/fireball$/.test(url)) return json(FIXTURES.srd_spell_fireball);
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };

  window.supabase = {
    createClient(url, key, opts) {
      window.__capturedHeaders = (opts && opts.global && opts.global.headers) || {};
      return {
        from: (table) => Object.assign(query(table), {
          update: writer(table, 'update'),
          insert: writer(table, 'insert'),
          delete: () => writer(table, 'delete')()
        }),
        rpc(fn, params) {
          if (fn === 'world_login') {
            if (params.p_pin === '0000') return Promise.resolve({ data: { ok:false, error:'bad_pin' }, error:null });
            const dm = params.p_pin === '1379';
            return Promise.resolve({ data: { ok:true, role: dm ? 'dm' : 'player',
              game_world_id:'w1', game_world_name: params.p_world_name,
              leveling_mode:'milestone', dm_token: dm ? 'tok_'+'a'.repeat(60) : null }, error:null });
          }
          if (fn === 'encounter_share_create') {
            window.__sharedFrom = params.p_encounter_id;
            return Promise.resolve({ data: { ok:true, code:'K7PQR2MWXJ', count:2 }, error:null });
          }
          if (fn === 'encounter_share_get') {
            const code = String(params.p_code || '').trim().toUpperCase();
            if (code !== 'K7PQR2MWXJ') {
              return Promise.resolve({ data: { ok:false, error:'not_found' }, error:null });
            }
            return Promise.resolve({ data: { ok:true, name:'Ambush at the Ford', payload: {
              name: 'Ambush at the Ford', read_aloud: 'Mist hangs over the water.',
              combatants: [
                { name:'Goblin 1', api:'goblin', hp:9, ac:15, color:'#c4452f', group:'Wave 1' },
                { name:'Goblin 2', api:'goblin', hp:6, ac:15, color:'#c4452f', group:'Wave 1' }
              ] } }, error:null });
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
        assert (await cards.nth(2).locator(".hp-state").inner_text()).strip() == "BLOODIED"
        assert (await cards.nth(0).locator(".hp-state").inner_text()).strip() == "HEALTHY"
        assert (await cards.nth(3).locator(".hp-state").inner_text()).strip() == "DOWN"
        ok("HP labels match the classic tracker's five tiers (HEALTHY/INJURED/BLOODIED/CRITICAL/DOWN)")

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
        assert pending == 0, pending                       # every hub tile now links somewhere
        assert await page.locator('.hub-tile[href="characters.html"]').count() == 1
        assert await page.locator('.sidebar-nav a[href="monster-tracker.html"]').count() == 1
        ok("every hub tile and nav item links to a real page")

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

        # ---------- 17. Campaigns list ----------
        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.goto(f"{BASE}/v2/campaigns.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".campaign-grid", timeout=10000)
        assert await page.locator(".campaign-card").count() == 1
        assert "The Drowned Road" in await page.locator(".campaign-card h3").inner_text()
        ok("campaigns list renders the world's campaigns")

        assert await page.locator('button:has-text("New campaign")').count() >= 1
        ok("DM sees the create-campaign action")

        stats = await page.locator(".campaign-card .stats").inner_text()
        assert "PARTY" in stats and "NPCS" in stats, stats
        ok("campaign cards carry per-section counts")

        # ---------- 18. Campaign detail ----------
        await page.click(".campaign-card")
        await page.wait_for_url("**/campaign.html*", timeout=10000)
        await page.wait_for_selector(".campaign-tabs", timeout=10000)
        tabs = [t.strip() for t in await page.locator(".campaign-tabs button").all_inner_texts()]
        assert len(tabs) == 7, tabs
        ok(f"campaign detail shows seven tabs ({[t.split(chr(10))[0] for t in tabs]})")

        assert "Vell is the villain." in await page.locator(".dm-note").inner_text()
        ok("DM note renders on the overview, read from the protected table")

        # ---------- 19. Party: pull from world ----------
        await page.click('.campaign-tabs button:has-text("Party")')
        await page.wait_for_timeout(400)
        assert await page.locator('.list-row:has-text("Brannor Hale")').count() == 1
        assert await page.locator('.section-head:has-text("Former members")').count() == 1
        ok("party splits active members from former ones")

        await page.click('button:has-text("Add from world")')
        await page.wait_for_selector(".modal", timeout=5000)
        options = await page.locator("#mf-character_id option").all_inner_texts()
        # c1 is already active, so only the other three are offered.
        assert len(options) == 3, options
        assert not any("Brannor" in o for o in options), options
        ok(f"pull-from-world offers only characters not already in the campaign ({len(options)})")

        await page.select_option("#mf-character_id", label=[o for o in options if "Korr" in o][0])
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        membership = [w for w in writes if w["table"] == "campaign_characters"][-1]
        assert membership["verb"] == "insert", membership
        assert membership["payload"]["game_world_id"] == "w1", membership
        assert membership["payload"]["campaign_id"] == "cam1", membership
        ok("adding a character writes a membership row carrying game_world_id")

        # Re-adding someone who left must reactivate, not insert: the
        # (campaign_id, character_id) pair is unique.
        await page.click('button:has-text("Re-add")')
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        rejoin = [w for w in writes if w["table"] == "campaign_characters"][-1]
        assert rejoin["verb"] == "update", rejoin
        assert rejoin["payload"]["status"] == "active" and rejoin["payload"]["left_at"] is None, rejoin
        ok("re-adding a former member updates their row rather than inserting a duplicate")

        # ---------- 20. Reveal toggles ----------
        await page.click('.campaign-tabs button:has-text("NPCs")')
        await page.wait_for_timeout(400)
        pill = page.locator('.list-row:has-text("Harbourmaster Vell") .status-pill:has-text("Unknown")')
        assert await pill.count() == 1, "hidden NPC should be marked Unknown to the DM"
        ok("DM sees which NPCs are still hidden from players")

        await pill.click()
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        reveal = [w for w in writes if w["table"] == "npcs"][-1]
        assert reveal["payload"]["is_known_to_players"] is True, reveal
        ok("toggling visibility writes the reveal flag")

        # ---------- 21. Storylines, checks, areas ----------
        await page.click('.campaign-tabs button:has-text("Storylines")')
        await page.wait_for_timeout(400)
        check = await page.locator(".check-row").inner_text()
        assert "DC 14" in check and "Perception" in check, check
        assert await page.locator('.check-row .hidden-pill:has-text("secret")').count() == 1
        ok(f"beat checks render with their DC and secret marker ({check.split(chr(10))[0].strip()})")

        assert await page.locator('.beat-list .status-pill:has-text("Hidden")').count() == 1
        ok("an unrevealed beat is marked hidden for the DM")

        await page.click('.campaign-tabs button:has-text("Areas")')
        await page.wait_for_timeout(400)
        assert await page.locator(".tree-child").count() >= 1, "Sel nests inside The Drowned Road"
        ok("areas nest inside their parent")

        await page.screenshot(path="/tmp/shot-09-campaign.png", full_page=True)

        # ---------- 22. Player view of a campaign ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "5555")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)
        await page.goto(f"{BASE}/v2/campaign.html?id=cam1", wait_until="domcontentloaded")
        await page.wait_for_selector(".campaign-tabs", timeout=10000)

        assert await page.locator(".dm-note").count() == 0, "players must not see DM notes"
        assert await page.locator(".dm-note-block").count() == 0
        ok("a player sees no DM note block at all")

        assert await page.locator('button:has-text("Edit campaign")').count() == 0
        await page.click('.campaign-tabs button:has-text("Party")')
        await page.wait_for_timeout(400)
        assert await page.locator('button:has-text("Add from world")').count() == 0
        assert await page.locator('button:has-text("Remove")').count() == 0
        ok("a player gets no campaign editing actions")

        await page.click('.campaign-tabs button:has-text("NPCs")')
        await page.wait_for_timeout(400)
        assert await page.locator('.status-pill:has-text("Unknown")').count() == 0
        assert await page.locator('.status-pill:has-text("Known")').count() == 0
        ok("reveal toggles are DM-only")

        # ---------- 23. Compendium ----------
        # Back to the DM session.
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "1379")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)

        await page.click('.sidebar-nav a[href="compendium.html"]')
        await page.wait_for_url("**/compendium.html", timeout=10000)
        await page.wait_for_selector(".srd-list .list-row", timeout=10000)
        assert await page.locator(".srd-list .list-row").count() == 3
        ok("compendium lists SRD monsters")

        # A monster already on the roster is marked, so a DM does not add it twice.
        assert await page.locator('.list-row:has-text("Gargoyle") .hidden-pill:has-text("in roster")').count() == 1
        assert await page.locator('.list-row:has-text("Goblin") .hidden-pill').count() == 0
        ok("monsters already in the campaign roster are marked")

        await page.fill("#srd-search", "drag")
        await page.wait_for_timeout(300)
        rows = await page.locator(".srd-list .list-row").count()
        assert rows == 1, rows
        assert "Ancient Red Dragon" in await page.locator(".srd-list .list-row").inner_text()
        ok("search filters the SRD index")

        await page.fill("#srd-search", "")
        await page.wait_for_timeout(250)
        await page.click('.srd-list .list-row:has-text("Goblin")')
        await page.wait_for_selector(".srd-detail .statblock h2", timeout=8000)
        assert (await page.locator(".srd-detail h2").inner_text()).strip() == "Goblin"
        trio = await page.locator(".srd-detail .stat-trio").inner_text()
        # armor_class arrives as [{type,value}] and must normalise to 15;
        # challenge_rating 0.25 must render as 1/4, not 0.25.
        assert "15" in trio and "7" in trio and "1/4" in trio, trio
        ok(f"stat block normalises array armor class and fractional CR ({trio.split()[0]}/{trio.split()[-1]})")

        assert "Nimble Escape" in await page.locator(".srd-detail").inner_text()
        ok("traits and actions render in the stat block")

        # The index is fetched once and cached for the tab session.
        calls = await page.evaluate("window.__srdCalls")
        assert len([c for c in calls if c.endswith("/api/monsters")]) == 1, calls
        ok("the SRD index is fetched once, not per keystroke")

        # ---------- 24. Add to roster ----------
        await page.click('button:has-text("Add to a campaign")')
        await page.wait_for_selector(".modal", timeout=5000)
        assert (await page.input_value("#mf-name")) == "Goblin"
        assert (await page.input_value("#mf-max_hit_points")) == "7"
        assert (await page.input_value("#mf-armor_class")) == "15"
        ok("add-to-roster prefills from the SRD entry")

        # Rename and buff it: only the deltas should be stored as overrides.
        await page.fill("#mf-name", "Goblin Bloodcaller")
        await page.fill("#mf-max_hit_points", "18")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)

        writes = await page.evaluate("window.__writes")
        added = [w for w in writes if w["table"] == "campaign_monsters" and w["verb"] == "insert"][-1]
        p_ = added["payload"]
        assert p_["source"] == "srd_api" and p_["api_index"] == "goblin", p_
        assert p_["game_world_id"] == "w1" and p_["campaign_id"] == "cam1", p_
        assert p_["max_hit_points"] == 18 and p_["armor_class"] == 15, p_
        assert p_["challenge_rating"] == 0.25 and p_["size"] == "Small", p_
        ok("adding an SRD monster stores a reference, not a copy of the stat block")

        assert set(p_["statblock"].keys()) == {"name", "hit_points"}, p_["statblock"]
        ok(f"only the changed fields are stored as overrides ({sorted(p_['statblock'])})")

        # ---------- 25. Homebrew ----------
        await page.click('button:has-text("New homebrew monster")')
        await page.wait_for_selector(".modal", timeout=5000)
        await page.fill("#mf-name", "Bog Lurker")
        await page.fill("#mf-max_hit_points", "44")
        await page.fill("#mf-description", "Drags the unwary under.")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)

        writes = await page.evaluate("window.__writes")
        brew = [w for w in writes if w["table"] == "campaign_monsters" and w["verb"] == "insert"][-1]
        assert brew["payload"]["source"] == "homebrew", brew
        # The source check constraint requires a stat block for homebrew rows.
        assert brew["payload"]["statblock"] is not None, brew
        assert brew["payload"].get("api_index") is None, brew   # homebrew has no SRD reference
        ok("homebrew writes a stat block, satisfying the source check constraint")

        # ---------- 26. Spells ----------
        await page.click('button:has-text("Spells")')
        await page.wait_for_selector('.srd-list .list-row:has-text("Fireball")', timeout=8000)
        assert await page.locator(".srd-list .list-row").count() == 2
        await page.click('.srd-list .list-row:has-text("Fireball")')
        await page.wait_for_selector(".srd-detail h2", timeout=8000)
        body = await page.locator(".srd-detail").inner_text()
        assert "Level 3" in body and "Evocation" in body, body
        assert "Damage increases by 1d6." in body, "higher-level text should render"
        assert "reference only" in body
        ok("spells render, including higher-level text, and say they are reference only")

        await page.screenshot(path="/tmp/shot-10-compendium.png", full_page=True)

        # ---------- 27. Player view ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "5555")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)
        await page.goto(f"{BASE}/v2/compendium.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".srd-list .list-row", timeout=10000)
        assert await page.locator('button:has-text("New homebrew monster")').count() == 0
        await page.click('.srd-list .list-row:has-text("Goblin")')
        await page.wait_for_selector(".srd-detail h2", timeout=8000)
        assert await page.locator('button:has-text("Add to a campaign")').count() == 0
        ok("players can browse the SRD but not write to a roster")

        # ---------- 28. Tracker ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "1379")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)

        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)
        assert await page.locator(".init-row").count() == 5
        ok("tracker renders every combatant")

        # Sorted by initiative descending; the one with none sorts last.
        # While an encounter is being prepared, grouped rows sit under their
        # heading and ungrouped rows follow, sorted by initiative within each.
        ungrouped = [n.strip() for n in
                     await page.locator(".enc-group:not(:has(h2)) .init-name").all_inner_texts()]
        assert ungrouped[0].startswith("Sythra") and ungrouped[1] == "Gargoyle 1", ungrouped
        assert ungrouped[-1] == "Bog Lurker", ungrouped
        ok(f"combatants sort by initiative, unrolled last ({[n[:9] for n in ungrouped]})")

        assert await page.locator(".init-row.is-party").count() == 1
        ok("the party member is marked")

        # --- Decision 1: a PC's HP comes from the character record ---
        pc = page.locator('.init-row:has-text("Sythra")')
        assert (await pc.locator(".hp-value b").inner_text()) == "9", "PC HP must read from characters"
        assert (await pc.locator(".hp-value .temp").inner_text()) == "+5"
        ok("a player character's HP is read from their character record, not the combatant row")

        await pc.locator("#amt-cb1").fill("4")
        await pc.locator(".hp-btn.damage").click()
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        hit = writes[-1]
        assert hit["table"] == "characters", f"PC damage must write to characters, got {hit}"
        assert hit["payload"]["current_hit_points"] == 5, hit
        ok("damaging a player character writes through to characters.current_hit_points")

        assert (await pc.locator(".hp-value b").inner_text()) == "5"
        ok("the tracker reflects the character record immediately")

        # --- A monster's HP lives on the combatant row ---
        mob = page.locator('.init-row:has-text("Gargoyle 1")')
        await mob.locator("#amt-cb2").fill("60")
        await mob.locator(".hp-btn.damage").click()
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        hit = writes[-1]
        assert hit["table"] == "encounter_combatants", hit
        assert hit["payload"]["current_hit_points"] == 0, hit      # clamped, not negative
        assert hit["payload"]["is_defeated"] is True, hit
        ok("monster damage writes to the combatant row, clamps at zero and marks it down")

        assert await page.locator(".init-row.is-dead").count() == 1
        ok("a downed combatant dims rather than disappearing")

        # ---------- 29. Turn order ----------
        await page.click('.topbar button:has-text("Roll initiative")')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        rolled = [w for w in writes if w["table"] == "encounter_combatants"
                  and "initiative" in (w["payload"] or {})]
        assert len(rolled) == 1, "only the combatant without an initiative should be rolled"
        assert 1 <= rolled[-1]["payload"]["initiative"] <= 20, rolled[-1]
        ok("rolling initiative only fills the blanks")

        await page.click('.topbar button:has-text("Start encounter")')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        started = [w for w in writes if w["table"] == "encounters"][-1]
        assert started["payload"]["status"] == "active" and started["payload"]["round"] == 1, started
        assert started["payload"]["active_combatant_id"], started
        ok("starting an encounter sets round 1 and the first turn")

        assert await page.locator(".init-row.is-active").count() == 1
        assert "ROUND 1" in await page.locator(".round-pill").inner_text()
        ok("the active combatant is highlighted and the round shows")

        # Turn order is global, so a running encounter drops the group headings
        # rather than sending the highlight jumping between them.
        assert await page.locator(".enc-group h2").count() == 0, "groups are a planning view"
        running_order = [n.strip() for n in await page.locator(".init-name").all_inner_texts()]
        assert running_order[0].startswith("Sythra"), running_order
        ok(f"a running encounter shows one flat initiative order ({running_order[0][:9]} first)")

        # Advancing past the last live combatant wraps and increments the round.
        # The downed one must never take a turn.
        live = await page.locator(".init-row:not(.is-dead)").count()
        seen = []
        for _ in range(live):
            await page.click('.topbar button:has-text("Next turn")')
            await page.wait_for_timeout(400)
            seen.append(await page.locator(".init-row.is-active .init-name").inner_text())
        writes = await page.evaluate("window.__writes")
        turn = [w for w in writes if w["table"] == "encounters"][-1]
        assert turn["payload"]["round"] == 2, turn
        assert not any("Gargoyle 1" in n for n in seen), f"downed combatant took a turn: {seen}"
        ok(f"the turn order skips the downed combatant and wraps into round 2 after {live} turns")

        # ---------- 30. Conditions ----------
        await page.locator('.init-row:has-text("Sythra") .init-name').click()
        await page.wait_for_selector(".init-detail", timeout=5000)
        await page.click('.init-detail .condition-tag:has-text("Prone")')
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        cond = [w for w in writes if w["table"] == "encounter_combatants"][-1]
        assert cond["payload"]["conditions"] == ["Prone"], cond
        ok("conditions persist to the combatant row")

        await page.screenshot(path="/tmp/shot-11-tracker.png", full_page=True)

        # ---------- 31. Mobile ----------
        await page.set_viewport_size({"width": 390, "height": 844})
        await page.wait_for_timeout(400)
        overflow = await page.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 0, f"tracker overflows at 390px by {overflow}px"
        ok(f"tracker has no horizontal scroll at 390px ({overflow}px)")
        await page.screenshot(path="/tmp/shot-12-tracker-mobile.png", full_page=True)
        await page.set_viewport_size({"width": 1280, "height": 900})

        # ---------- 32. Player view: hidden monster HP ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "5555")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)
        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)

        # hide_monster_hp is on, so a player sees the order but not monster HP --
        # and still sees their own party's, which is never hidden.
        mob = page.locator('.init-row:has-text("Gargoyle 1")')
        assert await mob.locator(".hp-value").count() == 0, "monster HP must be hidden from players"
        assert "hidden" in (await mob.locator(".init-hp").inner_text()).lower()
        pc = page.locator('.init-row:has-text("Sythra")')
        assert await pc.locator(".hp-value").count() == 1, "party HP stays visible"
        ok("players see the initiative order and party HP, but not monster HP")

        assert await page.locator(".hp-btn").count() == 0
        assert await page.locator('button:has-text("Next turn")').count() == 0
        ok("players get no combat controls")

        # ---------- 33. Review fixes ----------
        mob = await browser.new_context(viewport={"width": 390, "height": 844})
        await mob.add_init_script(STUB)
        mp = await mob.new_page()
        watch(mp, "mobile")

        # (4) The login page overflowed at phone width and was never asserted:
        # an <input> carries an intrinsic size="20" width and a flex item's
        # min-width is auto, so the PIN boxes refused to shrink.
        await mp.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await mp.wait_for_timeout(500)
        overflow = await mp.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 0, f"login overflows at 390px by {overflow}px"
        widths = await mp.evaluate(
            "Array.from(document.querySelectorAll('.pin-input')).map(e => Math.round(e.getBoundingClientRect().width))")
        assert all(w < 100 for w in widths), widths
        ok(f"login fits at 390px; PIN boxes shrink to {widths[0]}px each")

        await mp.fill("#world-name", "Thornfell Reach")
        await fill_pin(mp, "join", "1379")
        await mp.click("#join-form .btn-submit")
        await mp.wait_for_selector(".character-card", timeout=10000)

        # (1) A block-level <a> inherits ember.css's a:hover underline, and on
        # touch the hover state sticks after a tap.
        await mp.locator(".character-card").first.hover()
        await mp.wait_for_timeout(200)
        decorations = await mp.evaluate("""() => {
            const card = document.querySelector('.character-card');
            return [card, card.querySelector('.card-name'), card.querySelector('.card-meta')]
                .map(el => getComputedStyle(el).textDecorationLine);
        }""")
        assert all(d == "none" for d in decorations), decorations
        ok("hovering a character card underlines nothing")

        # (2) Topbar actions are desktop-only, so the FAB carries them on mobile.
        await mp.goto(f"{BASE}/v2/campaigns.html", wait_until="domcontentloaded")
        await mp.wait_for_selector(".campaign-grid", timeout=10000)
        assert not await mp.locator(".topbar").is_visible(), "topbar is desktop-only"
        assert await mp.locator("#fab-toggle").is_visible(), "no way to add a campaign on mobile"
        assert not await mp.locator(".fab-item").first.is_visible(), "menu starts closed"
        await mp.click("#fab-toggle")
        await mp.wait_for_timeout(400)
        labels = [t.strip() for t in await mp.locator(".fab-item").all_inner_texts()]
        assert "New campaign" in labels, labels
        ok(f"mobile reaches topbar actions through the FAB ({labels})")

        await mp.click('.fab-item:has-text("New campaign")')
        await mp.wait_for_selector(".modal", timeout=5000)
        ok("the FAB action opens the new-campaign form")
        await mp.click("#modal-cancel")
        await mp.wait_for_timeout(300)

        # (5) The tracker had seven buttons in a row; they move into the FAB.
        await mp.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await mp.wait_for_selector(".init-row", timeout=10000)
        assert await mp.locator(".tracker-controls").count() == 0, "the crowded row is gone"
        await mp.click("#fab-toggle")
        await mp.wait_for_timeout(400)
        labels = [t.strip() for t in await mp.locator(".fab-item").all_inner_texts()]
        for expected in ("Roll initiative", "Add party", "Add monsters", "Add NPC"):
            assert expected in labels, (expected, labels)
        ok(f"tracker actions live in the flip-up menu ({len(labels)} of them)")

        overflow = await mp.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 0, f"tracker overflows at 390px by {overflow}px"
        ok("tracker still fits at 390px with the FAB")
        await mp.screenshot(path="/tmp/shot-13-fab.png")
        await mp.keyboard.press("Escape")

        # (3) The compendium detail sat under a 150-row list, so picking
        # something looked like nothing happened.
        await mp.goto(f"{BASE}/v2/compendium.html", wait_until="domcontentloaded")
        await mp.wait_for_selector(".srd-list .list-row", timeout=10000)
        assert not await mp.locator(".srd-detail").is_visible(), "no detail before picking"
        await mp.click('.srd-list .list-row:has-text("Goblin")')
        await mp.wait_for_selector(".srd-detail.has-detail", timeout=8000)
        assert await mp.locator(".srd-detail").is_visible()
        box = await mp.locator(".srd-detail").bounding_box()
        assert box["y"] + box["height"] <= 850, f"detail should sit at the bottom of the screen: {box}"
        assert "Nimble Escape" in await mp.locator(".srd-detail").inner_text()
        ok("compendium detail opens as a bottom sheet on mobile, description readable")

        await mp.click(".srd-close")
        await mp.wait_for_timeout(300)
        assert not await mp.locator(".srd-detail").is_visible()
        ok("the compendium bottom sheet dismisses")

        # The FAB must not appear above the breakpoint, where the topbar shows.
        await mp.set_viewport_size({"width": 1280, "height": 900})
        await mp.wait_for_timeout(400)
        assert not await mp.locator("#fab-toggle").is_visible(), "FAB should hide on desktop"
        assert await mp.locator(".topbar .btn").count() >= 1, "topbar should carry the actions"
        ok("above 900px the FAB hides and the topbar carries the actions")

        await mob.close()

        # ---------- 34. Tracker parity with the classic version ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "1379")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)
        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)

        # Adding a monster must not require a trip to the Compendium first.
        await page.click('.topbar button:has-text("Add monsters")')
        await page.wait_for_selector("#add-search", timeout=5000)
        await page.fill("#add-search", "gob")
        await page.wait_for_timeout(400)
        suggestions = [t.strip() for t in await page.locator(".add-suggestion").all_inner_texts()]
        assert any("Goblin" in t for t in suggestions), suggestions
        ok("the tracker searches the SRD directly, no Compendium round-trip")

        await page.click('.add-suggestion:has-text("Goblin")')
        await page.wait_for_selector("#add-config:not(.hidden)", timeout=5000)
        assert await page.locator(".add-hp-row").count() == 1
        ok("picking a monster reveals the count, colour and hit point fields")

        # Bulk: four goblins, each with its own rolled hit points.
        await page.fill("#add-count", "4")
        await page.wait_for_timeout(300)
        rows = await page.locator(".add-hp-row").count()
        assert rows == 4, rows
        values = await page.evaluate(
            "Array.from(document.querySelectorAll('.add-hp')).map(i => Number(i.value))")
        assert all(2 <= v <= 12 for v in values), f"2d6 should roll 2-12: {values}"
        ok(f"bulk add rolls hit points per creature from hit dice ({values})")

        labels = [t.strip() for t in await page.locator(".add-hp-row label").all_inner_texts()]
        assert labels == ["Goblin 1", "Goblin 2", "Goblin 3", "Goblin 4"], labels
        ok("each creature in the group is numbered")

        # Colour assignment.
        await page.fill("#add-group", "Wave 1")
        await page.locator("#add-swatches .swatch").nth(1).click()
        chosen = await page.locator("#add-swatches .swatch.is-active").get_attribute("data-color")
        assert chosen.startswith("#"), chosen
        await page.click("#add-confirm")
        await page.wait_for_timeout(900)

        writes = await page.evaluate("window.__writes")
        # The Goblin is not on this campaign's roster, so the roster row is
        # created silently rather than making the DM go and add it first.
        roster_write = [w for w in writes if w["table"] == "campaign_monsters" and w["verb"] == "insert"][-1]
        assert roster_write["payload"]["api_index"] == "goblin", roster_write
        assert roster_write["payload"]["source"] == "srd_api", roster_write
        ok("adding an unknown SRD monster creates its campaign roster row automatically")

        combat_write = [w for w in writes if w["table"] == "encounter_combatants"
                        and w["verb"] == "insert"][-1]
        payload = combat_write["payload"]
        assert isinstance(payload, list) and len(payload) == 4, payload
        assert payload[0]["color"] == chosen, payload[0]
        assert payload[0]["group_label"] == "Wave 1", payload[0]
        assert all(r["campaign_monster_id"] == "new-id" for r in payload), payload
        assert len({r["max_hit_points"] for r in payload}) >= 1, payload
        assert all(r["initiative"] is not None for r in payload), "auto initiative should roll"
        ok("four combatants inserted in one write, with colour, group and rolled initiative")

        # Initiative is d20 + DEX, not a flat d20. Goblin DEX 14 gives +2, so
        # the range is 3..22.
        inits = [r["initiative"] for r in payload]
        assert all(3 <= i <= 22 for i in inits), inits
        ok(f"initiative rolls include the dexterity modifier ({inits})")

        await page.screenshot(path="/tmp/shot-14-add.png", full_page=True)

        # ---------- 35. Groups, colour and notes ----------
        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)

        # Rows carrying a group label gather under a collapsible heading, with
        # ungrouped rows last, as the classic tracker does.
        head = page.locator('.enc-group h2:has-text("Wave 2")')
        assert await head.count() == 1, "grouped rows need a heading"
        assert "2/2" in await head.inner_text()
        ok("grouped combatants gather under a collapsible heading with a live count")

        await head.click()
        await page.wait_for_timeout(350)
        assert await page.locator('.init-row:has-text("Gargoyle 2")').count() == 0
        ok("a group collapses")
        await page.locator('.enc-group h2:has-text("Wave 2")').click()
        await page.wait_for_timeout(350)

        coloured = page.locator('.init-row:has-text("Gargoyle 2")')
        assert "has-color" in await coloured.get_attribute("class")
        # While preparing, the colour boxes the whole set rather than striping
        # each row -- see the dedicated block assertions further down.
        border = await page.locator(".colour-block").evaluate(
            "el => getComputedStyle(el).borderTopColor")
        assert border == "rgb(61, 90, 114)", border      # #3d5a72
        ok(f"an assigned colour renders on the block containing its set ({border})")

        assert "Holds the far bank." in await coloured.locator(".init-note").inner_text()
        ok("a combatant note renders on its row")

        # 30/48 is 62%, so the finer scale reads INJURED rather than a blunt
        # healthy/wounded split.
        assert (await coloured.locator(".init-sub .state-high, .init-sub .state-mid").inner_text()).strip() == "INJURED"
        ok("the five-tier status scale is in use on the tracker")

        await coloured.locator(".ac-edit").click()
        await page.wait_for_selector(".modal", timeout=5000)
        assert (await page.input_value("#mf-armor_class")) == "15"
        await page.fill("#mf-armor_class", "17")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        assert writes[-1]["payload"]["armor_class"] == 17, writes[-1]
        ok("armor class is editable inline, as in the classic tracker")

        await page.screenshot(path="/tmp/shot-15-groups.png", full_page=True)

        # ---------- 36. DM panel ----------
        await page.goto(f"{BASE}/v2/dm-panel.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".dm-row", timeout=10000)
        assert await page.locator(".dm-row").count() == 4
        ok("DM panel lists every character in the world")

        assert await page.locator('.dm-row:has-text("Korr") .tag-accent').count() == 1
        banner = await page.locator(".error-banner").inner_text()
        assert "level waiting" in banner and "classic version" in banner, banner
        ok("characters owed a level are flagged, and the panel says where levelling finishes")

        # Milestone: granting sets the level and the pending flag, and records
        # the pre-grant level for the classic wizard.
        await page.evaluate("localStorage.removeItem('preGrantLevel_c1')")
        await page.click('.dm-row:has-text("Brannor") button:has-text("Grant level")')
        await page.wait_for_selector(".modal", timeout=5000)
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)

        writes = await page.evaluate("window.__writes")
        grant = [w for w in writes if w["table"] == "characters"][-1]
        assert grant["payload"] == {"level": 6, "pending_level_up": True}, grant
        ok("a milestone grant writes level + 1 and the pending flag")

        pre = await page.evaluate("localStorage.getItem('preGrantLevel_c1')")
        assert pre == "5", pre
        ok("the pre-grant level is recorded for the classic level-up wizard")

        # Switching mode writes to the world, as the classic panel does.
        await page.click('button:has-text("EXP")')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        mode_write = [w for w in writes if w["table"] == "game_worlds"][-1]
        assert mode_write["payload"]["leveling_mode"] == "exp", mode_write
        ok("the levelling mode toggle writes to the world")

        await page.wait_for_selector(".dm-row-exp", timeout=5000)
        korr = page.locator('.dm-row:has-text("Korr")')
        assert "6,000 / 6,500 XP" in await korr.inner_text()
        ok("EXP mode shows progress toward the next threshold")

        # 6000 + 1000 crosses the level 5 threshold of 6500.
        await korr.locator("input").fill("1000")
        await korr.locator('button:has-text("Grant")').click()
        await page.wait_for_timeout(800)
        writes = await page.evaluate("window.__writes")
        exp_grant = [w for w in writes if w["table"] == "characters"][-1]
        assert exp_grant["payload"]["experience_points"] == 7000, exp_grant
        assert exp_grant["payload"]["level"] == 5, exp_grant
        assert exp_grant["payload"]["pending_level_up"] is True, exp_grant
        ok("granting EXP across a threshold levels the character and flags them")

        # Below a threshold, no level change and no flag.
        await page.evaluate("window.__resetWrites()")
        brannor = page.locator('.dm-row:has-text("Brannor")')
        await brannor.locator("input").fill("10")
        await brannor.locator('button:has-text("Grant")').click()
        await page.wait_for_timeout(800)
        writes = await page.evaluate("window.__writes")
        small = [w for w in writes if w["table"] == "characters"][-1]
        assert "level" not in small["payload"], small
        assert "pending_level_up" not in small["payload"], small
        ok("EXP short of a threshold changes nothing but the total")

        await page.screenshot(path="/tmp/shot-16-dm.png", full_page=True)

        # The page is reachable by URL, so it guards itself rather than relying
        # on the nav hiding it.
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "5555")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)
        await page.goto(f"{BASE}/v2/dm-panel.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".empty-state", timeout=8000)
        assert "DM only" in await page.locator(".empty-state").inner_text()
        assert await page.locator(".dm-row").count() == 0
        ok("a player reaching the DM panel by URL gets nothing to act on")

        # ---------- 37. Check authoring ----------
        await page.evaluate("localStorage.clear(); sessionStorage.clear();")
        await page.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page.fill("#world-name", "Thornfell Reach")
        await fill_pin(page, "join", "1379")
        await page.click("#join-form .btn-submit")
        await page.wait_for_selector(".party-roster", timeout=10000)
        await page.goto(f"{BASE}/v2/campaign.html?id=cam1", wait_until="domcontentloaded")
        await page.wait_for_selector(".campaign-tabs", timeout=10000)
        await page.click('.campaign-tabs button:has-text("Storylines")')
        await page.wait_for_timeout(400)

        await page.click('.beat-list button:has-text("Add check")')
        await page.wait_for_selector(".modal", timeout=5000)
        await page.fill("#mf-label", "Hear the bowstring")
        await page.fill("#mf-dc", "15")
        await page.check("#mf-is_secret")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(800)

        writes = await page.evaluate("window.__writes")
        check = [w for w in writes if w["table"] == "campaign_checks" and w["verb"] == "insert"][-1]
        p_ = check["payload"]
        # Only the one parent column is sent; the rest default to NULL.
        assert p_["storyline_beat_id"] and p_.get("area_id") is None, p_
        assert p_["label"] == "Hear the bowstring" and p_["dc"] == 15, p_
        assert p_["is_secret"] is True, p_
        ok("a check can be authored on a beat, attached to exactly one parent")

        # The shape constraint wants the field the type uses and nothing else.
        assert p_["check_type"] == "skill_check", p_
        assert p_["skill_name"] == "Perception" and p_["ability"] is None, p_
        ok("a skill check stores its skill and leaves the ability null")

        # Out-of-range DCs are caught before the insert, since the column has a
        # between-1-and-40 constraint.
        await page.click('.beat-list button:has-text("Add check")')
        await page.wait_for_selector(".modal", timeout=5000)
        await page.fill("#mf-label", "Impossible")
        await page.fill("#mf-dc", "99")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(400)
        assert not await page.locator(".modal-error").is_hidden()
        assert "between 1 and 40" in await page.locator(".modal-error").inner_text()
        ok("a DC outside the allowed range is refused before it reaches the database")
        await page.click("#modal-close")
        await page.wait_for_timeout(300)

        # Areas can carry a check too -- a trap needs no storyline beat.
        await page.click('.campaign-tabs button:has-text("Areas")')
        await page.wait_for_timeout(400)
        assert await page.locator('button:has-text("Add check")').count() >= 1
        await page.locator('button:has-text("Add check")').first.click()
        await page.wait_for_selector(".modal", timeout=5000)
        await page.fill("#mf-label", "Notice the flooding")
        await page.select_option("#mf-check_type", "saving_throw")
        await page.select_option("#mf-ability", "con")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(800)
        writes = await page.evaluate("window.__writes")
        area_check = [w for w in writes if w["table"] == "campaign_checks" and w["verb"] == "insert"][-1]
        assert area_check["payload"]["area_id"], area_check
        assert area_check["payload"].get("storyline_beat_id") is None, area_check
        assert area_check["payload"]["ability"] == "con", area_check
        assert area_check["payload"]["skill_name"] is None, area_check
        ok("a saving throw on an area stores its ability and leaves the skill null")

        # ---------- 38. Encounter quick fixes ----------
        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)

        # A colour marks a set, so the two Gargoyles sharing one sit inside a
        # single bordered block rather than each carrying its own stripe.
        block = page.locator(".colour-block")
        assert await block.count() == 1, await block.count()
        assert await block.locator(".init-row").count() == 2
        border = await block.evaluate("el => getComputedStyle(el).borderTopColor")
        assert border == "rgb(61, 90, 114)", border
        ok("combatants sharing a colour box together under one border")

        inner = await block.locator(".init-row").first.evaluate(
            "el => getComputedStyle(el).borderLeftWidth")
        assert inner == "1px", f"rows inside the block should drop their own stripe: {inner}"
        ok("rows inside a colour block drop their individual stripe")

        # Picking a suggestion must put the chosen name in the box, not leave
        # the fragment that was typed.
        await page.click('.topbar button:has-text("Add monsters")')
        await page.wait_for_selector("#add-search", timeout=5000)
        await page.fill("#add-search", "gob")
        await page.wait_for_timeout(400)
        await page.click('.add-suggestion:has-text("Goblin")')
        await page.wait_for_selector("#add-config:not(.hidden)", timeout=5000)
        assert (await page.input_value("#add-search")) == "Goblin", \
            await page.input_value("#add-search")
        ok("picking a suggestion fills the search box with the chosen name")

        # A single creature is not numbered; numbering starts at two.
        assert (await page.locator(".add-hp-row label").first.inner_text()).strip() == "Goblin"
        await page.fill("#add-count", "2")
        await page.wait_for_timeout(300)
        labels = [t.strip() for t in await page.locator(".add-hp-row label").all_inner_texts()]
        assert labels == ["Goblin 1", "Goblin 2"], labels
        ok("the hit point rows use the chosen name, numbered only when there are several")
        await page.click("#modal-close")
        await page.wait_for_timeout(300)

        # Once running, the list goes flat and the colour returns to a stripe,
        # so turn order is never reshuffled by a colour.
        await page.click('.topbar button:has-text("Roll initiative")')
        await page.wait_for_timeout(500)
        await page.click('.topbar button:has-text("Start encounter")')
        await page.wait_for_timeout(700)
        assert await page.locator(".colour-block").count() == 0, "colour blocks are a planning view"
        assert await page.locator(".init-row.has-color").count() == 2
        ok("a running encounter keeps flat initiative order with per-row colour stripes")

        await page.screenshot(path="/tmp/shot-17-colour.png", full_page=True)

        # ---------- 39. Row layout, deletes and story linking ----------
        mob2 = await browser.new_context(viewport={"width": 390, "height": 844})
        await mob2.add_init_script(STUB)
        m2 = await mob2.new_page()
        watch(m2, "mobile-2")

        await m2.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await m2.fill("#world-name", "Thornfell Reach")
        await fill_pin(m2, "join", "1379")
        await m2.click("#join-form .btn-submit")
        await m2.wait_for_selector(".party-roster", timeout=10000)
        await m2.goto(f"{BASE}/v2/campaign.html?id=cam1", wait_until="domcontentloaded")
        await m2.wait_for_selector(".campaign-tabs", timeout=10000)
        await m2.click('.campaign-tabs button:has-text("Party")')
        await m2.wait_for_selector(".party-row", timeout=5000)

        # The fixed columns either side of the identity block left it almost no
        # width, so a name broke across several lines.
        heights = await m2.evaluate("""() => Array.from(document.querySelectorAll('.party-row .name'))
            .map(el => Math.round(el.getBoundingClientRect().height))""")
        assert all(h < 30 for h in heights), f"names should stay on one line: {heights}"
        ok(f"party names stay on one line at 390px ({heights})")

        meta_heights = await m2.evaluate("""() => Array.from(document.querySelectorAll('.party-row .meta'))
            .map(el => Math.round(el.getBoundingClientRect().height))""")
        assert all(h < 26 for h in meta_heights), meta_heights
        ok(f"the class and player line stays on one line too ({meta_heights})")

        overflow = await m2.evaluate(
            "document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 0, overflow
        ok("the party tab has no horizontal scroll at 390px")
        await m2.screenshot(path="/tmp/shot-18-party-mobile.png", full_page=True)
        await mob2.close()

        # Deleting a campaign says what goes with it.
        await page.goto(f"{BASE}/v2/campaign.html?id=cam1", wait_until="domcontentloaded")
        await page.wait_for_selector(".campaign-tabs", timeout=10000)
        await page.click('.topbar button:has-text("Delete campaign")')
        await page.wait_for_selector(".modal", timeout=5000)
        message = await page.locator(".modal-body .prose").inner_text()
        assert "storyline" in message and "NPC" in message and "encounter" in message, message
        assert "stay in the world" in message, "characters must be said to survive"
        assert "cannot be undone" in message, message
        ok("deleting a campaign lists what cascades and says characters survive")

        # Confirming deletes and returns to the list.
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_url("**/campaigns.html", timeout=10000)
        ok("confirming deletes the campaign and returns to the list")

        # Recorded writes survive the redirect, so the delete itself is visible.
        writes = await page.evaluate("window.__writes")
        gone = [w for w in writes if w["table"] == "campaigns" and w["verb"] == "delete"]
        assert gone, [w["table"] for w in writes]
        ok("the campaign row is deleted, not just navigated away from")

        # Deleting an encounter is scoped to the encounter, not the roster.
        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)
        await page.click('.topbar button:has-text("Delete encounter")')
        await page.wait_for_selector(".modal", timeout=5000)
        message = await page.locator(".modal-body .prose").inner_text()
        assert "combatant" in message and "roster" in message, message
        ok("deleting an encounter says the campaign roster is left alone")
        await page.click("#modal-close")
        await page.wait_for_timeout(300)

        # Linking an encounter to the moment in the story it belongs to.
        await page.click('.topbar button:has-text("Link to a beat")')
        await page.wait_for_selector(".modal", timeout=5000)
        options = [t.strip() for t in await page.locator("#mf-storyline_beat_id option").all_inner_texts()]
        assert any("The first crossing" in o for o in options), options
        assert any("The Toll Keeper" in o for o in options), "beats show their storyline"
        ok(f"the beat picker offers this campaign's beats, named by storyline")

        await page.select_option("#mf-storyline_beat_id", label=[o for o in options if "first crossing" in o][0])
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        link = [w for w in writes if w["table"] == "encounters"][-1]
        assert link["payload"]["storyline_beat_id"] == "b1", link
        ok("linking writes storyline_beat_id")
        assert "The first crossing" in await page.locator(".story-link").inner_text()
        ok("the encounter shows which beat it belongs to")

        # ---------- 40. Encounter sharing ----------
        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)
        await page.click('.topbar button:has-text("Share encounter")')
        await page.wait_for_selector(".share-code", timeout=5000)

        code = (await page.locator(".share-code").inner_text()).strip()
        assert len(code) == 10, code
        # The whole point: a code you can read aloud, not a two-kilobyte URL.
        assert len(code) < 20, code
        ok(f"sharing produces a short code ({code})")

        body = await page.locator("#panel-body").inner_text()
        assert "not your party" in body and "full health" in body, body
        ok("the share dialog says what travels and what does not")
        await page.click("#modal-close")
        await page.wait_for_timeout(300)

        # Importing rebuilds the recipe in the chosen campaign.
        await page.goto(f"{BASE}/v2/monster-tracker.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".topbar button", timeout=10000)
        await page.evaluate("window.__resetWrites()")
        await page.click('.topbar button:has-text("Add a shared encounter")')
        await page.wait_for_selector(".modal", timeout=5000)

        # A wrong code is refused before anything is created.
        await page.fill("#mf-code", "NOPENOPE12")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(500)
        assert "No encounter with that code" in await page.locator(".modal-error").inner_text()
        writes = await page.evaluate("window.__writes")
        assert not [w for w in writes if w["table"] == "encounters"], "nothing should be created"
        ok("an unknown share code is refused and creates nothing")

        # Codes are typed, so case and stray spaces must not matter.
        await page.fill("#mf-code", "  k7pqr2mwxj ")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(900)

        writes = await page.evaluate("window.__writes")
        made = [w for w in writes if w["table"] == "encounters" and w["verb"] == "insert"][-1]
        assert made["payload"]["name"] == "Ambush at the Ford", made
        assert made["payload"]["game_world_id"] == "w1", made
        ok("a lower-case code with stray spaces still imports")

        # The Goblin is not on this campaign's roster, so importing creates it
        # rather than asking the recipient to set the roster up first.
        roster = [w for w in writes if w["table"] == "campaign_monsters" and w["verb"] == "insert"]
        assert roster, "the shared creature should be added to the roster"
        assert roster[-1]["payload"]["api_index"] == "goblin", roster[-1]
        # "Goblin 1" is an instance name; the roster entry is the creature.
        assert roster[-1]["payload"]["name"] == "Goblin", roster[-1]
        ok("importing creates any roster monsters the recipe needs, named without the instance number")

        combat = [w for w in writes if w["table"] == "encounter_combatants"
                  and w["verb"] == "insert"][-1]
        rows = combat["payload"]
        assert isinstance(rows, list) and len(rows) == 2, rows
        assert rows[0]["color"] == "#c4452f" and rows[0]["group_label"] == "Wave 1", rows[0]
        assert rows[0]["display_name"] == "Goblin 1", rows[0]
        # The recipe is a template: creatures arrive ready to fight.
        assert rows[0]["current_hit_points"] == rows[0]["max_hit_points"] == 9, rows[0]
        assert rows[1]["max_hit_points"] == 6, rows[1]
        ok("imported creatures keep their colour, group and rolled hit points, at full health")

        # ---------- 41. Router ----------
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
