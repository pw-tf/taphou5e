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
ABILITY_CODES = ["str", "dex", "con", "int", "wis", "cha"]

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
                     "damage_type": "bludgeoning", "properties": "Versatile (1d8)", "equipped": False}],
        "inventory_items": [
            {"id": "it1", "name": "Spellbook", "description": "Water damaged.",
             "quantity": 1, "weight": 3, "equipped": False, "attuned": False,
             "item_type": "Gear"},
            # Carried and equipped: this is an action. Its damage is not stored
            # anywhere -- inventory_items has no such column -- so it has to be
            # resolved from the SRD by name.
            {"id": "it2", "name": "Longsword", "description": "", "quantity": 1,
             "weight": 3, "equipped": True, "attuned": False, "item_type": "Weapon"},
            # Carried but not equipped: not an action.
            {"id": "it3", "name": "Dagger", "description": "", "quantity": 2,
             "weight": 1, "equipped": False, "attuned": False, "item_type": "Weapon"}],
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
    "chapters": [{"id": "st1", "campaign_id": "cam1", "game_world_id": "w1",
                    "title": "The Toll Keeper", "player_summary": "Someone is taxing the ford.",
                    "status": "active",
                    "is_revealed": True, "sort_order": 0}],
    "chapter_beats": [
        {"id": "b1", "chapter_id": "st1", "game_world_id": "w1", "title": "The first crossing",
         "read_aloud": "Mist hangs over the water.", "status": "in_progress",
         "is_revealed": True, "sort_order": 0},
        {"id": "b2", "chapter_id": "st1", "game_world_id": "w1", "title": "Who pays the toll",
         "read_aloud": "", "status": "pending",
         "is_revealed": False, "sort_order": 1}],
    "campaign_checks": [{"id": "ck1", "campaign_id": "cam1", "game_world_id": "w1",
                         "chapter_beat_id": "b1", "label": "Spot the tripwire",
                         "check_type": "skill_check", "ability": None, "skill_name": "Perception",
                         "dc": 14, "is_secret": True, "is_group_check": False,
                         "success_text": "They spot the wire and step over it.",
                         "failure_text": "The darts fire: 2d4 piercing.",
                         "sort_order": 0}],
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
    # A Barbarian levelling 4 -> 6: level 5 has features, level 6 is an ASI
    # level for nobody (Barbarians take theirs at 4, 8, 12...), and neither
    # level has spellcasting, so the spell step must skip itself.
    "srd_equipment": {"count": 3, "results": [
        {"index": "longsword", "name": "Longsword", "url": "/api/equipment/longsword"},
        {"index": "dagger", "name": "Dagger", "url": "/api/equipment/dagger"},
        {"index": "rope-hempen", "name": "Rope, Hempen (50 feet)", "url": "/api/equipment/rope-hempen"}]},
    "srd_equipment_dagger": {
        "index": "dagger", "name": "Dagger", "weight": 1,
        "equipment_category": {"name": "Weapon"},
        "damage": {"damage_dice": "1d4", "damage_type": {"name": "Piercing"}},
        "properties": [{"name": "Finesse"}], "desc": ["A simple dagger."]},
    "srd_equipment_longsword": {
        "index": "longsword", "name": "Longsword", "weight": 3,
        "equipment_category": {"name": "Weapon"},
        "damage": {"damage_dice": "1d8", "damage_type": {"name": "Slashing"}},
        "properties": [{"name": "Versatile"}],
        "desc": ["A versatile martial weapon."]},
    "srd_features_index": {"count": 1, "results": [
        {"index": "action-surge-1-use", "name": "Action Surge (1 use)",
         "url": "/api/features/action-surge-1-use"}]},
    "srd_feature_action_surge": {
        "index": "action-surge-1-use", "name": "Action Surge (1 use)", "level": 2,
        "class": {"name": "Fighter"},
        "desc": ["You can push yourself beyond your normal limits for a moment."]},
    "srd_class_levels": {
        "barbarian": {
            "5": {"level": 5, "features": [
                     {"index": "barbarian-extra-attack", "name": "Extra Attack"},
                     {"index": "barbarian-fast-movement", "name": "Fast Movement"}]},
            "6": {"level": 6, "features": [
                     {"index": "barbarian-path-feature", "name": "Path Feature"}]},
        },
        "wizard": {
            "6": {"level": 6, "features": [{"index": "wizard-arcane-tradition", "name": "Arcane Tradition"}],
                  "spellcasting": {"spells_known_at_level": 4,
                                   "spell_slots_level": {"1": 4, "2": 3, "3": 3}}},
        },
        "fighter": {
            "4": {"level": 4, "features": [{"index": "fighter-asi", "name": "Ability Score Improvement"}]},
        },
    },
    "srd_subclasses": {"results": [
        {"index": "berserker", "name": "Berserker", "url": "/api/subclasses/berserker"}]},
    "srd_subclass_levels": {
        "berserker-5": {"features": [{"index": "berserker-mindless-rage", "name": "Mindless Rage"}]}},
    "encounters_single": {"id": "e1", "campaign_id": "cam1", "game_world_id": "w1",
                          "name": "Ambush at the Ford", "status": "planned", "round": 0,
                          "active_combatant_id": None, "hide_monster_hp": True,
                          "read_aloud": "Mist hangs over the water.", "area_id": None,
                          "chapter_beat_id": None},
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
    "dm_notes": [
        {"id": "dn1", "game_world_id": "w1", "campaign_id": "cam1", "area_id": None,
         "chapter_id": None, "chapter_beat_id": None, "npc_id": None,
         "encounter_id": None, "campaign_session_id": None,
         "body": "Vell is the villain."},
        # Chapter and beat prose moved here out of their own tables, where a
        # revealed row handed it to players.
        {"id": "dn2", "game_world_id": "w1", "campaign_id": None, "area_id": None,
         "chapter_id": "st1", "chapter_beat_id": None, "npc_id": None,
         "encounter_id": None, "campaign_session_id": None,
         "body": "It is the harbourmaster."},
        {"id": "dn3", "game_world_id": "w1", "campaign_id": None, "area_id": None,
         "chapter_id": None, "chapter_beat_id": "b1", "npc_id": None,
         "encounter_id": None, "campaign_session_id": None,
         "body": "The toll keeper is already dead."}],
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
    // The level-up wizard uses maybeSingle for "is this already saved?" reads,
    // which must resolve to null rather than the first fixture row.
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
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
      w.maybeSingle = () => Promise.resolve({ data: null, error: null });
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
    if (/\/api\/equipment$/.test(url))         return json(FIXTURES.srd_equipment);
    if (/\/api\/features$/.test(url))          return json(FIXTURES.srd_features_index);
    if (/\/api\/equipment\/longsword$/.test(url)) return json(FIXTURES.srd_equipment_longsword);
    if (/\/api\/equipment\/dagger$/.test(url)) return json(FIXTURES.srd_equipment_dagger);
    if (/\/api\/features\/action-surge-1-use$/.test(url)) return json(FIXTURES.srd_feature_action_surge);
    if (/\/api\/monsters\/goblin$/.test(url)) return json(FIXTURES.srd_monster_goblin);
    if (/\/api\/spells\/fireball$/.test(url)) return json(FIXTURES.srd_spell_fireball);
    // Class levels drive the level-up wizard's feature and spell steps.
    const lvl = url.match(/\/api\/classes\/([a-z]+)\/levels\/(\d+)$/);
    if (lvl) {
      const table = FIXTURES.srd_class_levels[lvl[1]] || {};
      return table[lvl[2]] ? json(table[lvl[2]])
                           : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    }
    if (/\/api\/classes\/[a-z]+\/subclasses$/.test(url)) return json(FIXTURES.srd_subclasses);
    const feat = url.match(/\/api\/features\/([a-z0-9-]+)$/);
    if (feat) return json({ name: feat[1], desc: ['Fixture text for ' + feat[1] + '.'] });
    const sub = url.match(/\/api\/subclasses\/([a-z-]+)\/levels\/(\d+)$/);
    if (sub) return json(FIXTURES.srd_subclass_levels[sub[1] + '-' + sub[2]] || { features: [] });
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };

  window.supabase = {
    createClient(url, key, opts) {
      window.__capturedHeaders = (opts && opts.global && opts.global.headers) || {};
      return {
        // The classic app opens realtime channels on its home screen. v2 does
        // not, but the invite prompt is tested on a classic page, so these
        // have to exist for app.js to reach that screen at all.
        channel: () => {
          const ch = {};
          ['on', 'off'].forEach(m => { ch[m] = () => ch; });
          ch.subscribe = (cb) => { if (cb) cb('SUBSCRIBED'); return ch; };
          ch.unsubscribe = () => Promise.resolve('ok');
          return ch;
        },
        removeChannel: () => Promise.resolve('ok'),
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
"""


def stub_with(**overrides):
    """The stub with some fixture tables replaced.

    The stub embeds its fixtures at injection time and returns the same
    `<table>_single` row whatever id the page asked for, so a test that needs
    a different character on the sheet injects its own stub in a fresh context
    rather than trying to steer the query.
    """
    data = dict(FIXTURES)
    data.update(overrides)
    return STUB_SRC.replace("__FIXTURES__", json.dumps(data))


STUB_SRC = STUB
STUB = STUB.replace("__FIXTURES__", json.dumps(FIXTURES))

# Korr, for the level-up wizard. The DM panel raises `level` and records the
# level before the grant; the wizard then walks the levels in between. So a
# 4 -> 6 grant looks like this: level already 6, preGrantLevel 4, and the hit
# points still those of a level 4 Barbarian until the wizard adds them.
KORR = {
    "id": "c3", "game_world_id": "w1", "name": "Korr", "player_name": "Sam",
    "race": "Goliath", "class": "Barbarian", "subclass": None, "level": 6,
    "armor_class": 15, "speed": 40, "initiative_bonus": 1, "proficiency_bonus": 2,
    "current_hit_points": 22, "hit_point_maximum": 52, "temporary_hit_points": 0,
    "hit_dice_total": "4d12", "hit_dice_remaining": 4,
    "death_save_successes": 0, "death_save_failures": 0,
    "active_conditions": [], "pending_level_up": True, "experience_points": 6000,
    "notes": "",
    "ability_scores": {"strength": 18, "dexterity": 12, "constitution": 10,
                       "intelligence": 8, "wisdom": 10, "charisma": 11},
    "saving_throws": [], "skills": [], "weapons": [], "inventory_items": [],
    "spells": [], "spell_slots": [], "features_traits": [],
    "currency": {"copper": 0, "silver": 0, "electrum": 0, "gold": 0, "platinum": 0},
    "character_details": {},
}

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


TOUCH_HOLD_JS = """({ x, y, ms }) => new Promise(resolve => {
  const target = document.elementFromPoint(x, y);
  const touch = new Touch({ identifier: 1, target, clientX: x, clientY: y });
  const opts = { touches: [touch], targetTouches: [touch], changedTouches: [touch],
                 bubbles: true, cancelable: true };
  target.dispatchEvent(new TouchEvent('touchstart', opts));
  setTimeout(() => {
    target.dispatchEvent(new TouchEvent('touchend', opts));
    // The browser synthesises a click after a touch; the page has to swallow
    // it, so firing it here is part of what makes this a real test.
    target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    resolve();
  }, ms);
})"""

TOUCH_SCROLL_JS = """({ x, y }) => new Promise(resolve => {
  const target = document.elementFromPoint(x, y);
  const at = (cx, cy) => {
    const touch = new Touch({ identifier: 2, target, clientX: cx, clientY: cy });
    return { touches: [touch], targetTouches: [touch], changedTouches: [touch],
             bubbles: true, cancelable: true };
  };
  target.dispatchEvent(new TouchEvent('touchstart', at(x, y)));
  // Past the slop threshold well before the hold would fire.
  setTimeout(() => target.dispatchEvent(new TouchEvent('touchmove', at(x, y - 60))), 80);
  setTimeout(() => { target.dispatchEvent(new TouchEvent('touchend', at(x, y - 60))); resolve(); }, 800);
})"""

MENU_SHAPE_JS = """() => {
  const menu = document.querySelector('.fab-menu');
  const items = Array.from(menu.querySelectorAll('.fab-item'));
  const style = getComputedStyle(menu);
  return {
    menu: Math.round(menu.getBoundingClientRect().width),
    items: items.map(i => Math.round(i.getBoundingClientRect().width)),
    bordered: parseFloat(style.borderTopWidth) > 0
  };
}"""


async def act(page, label):
    """Trigger a page action by label, through whichever control is showing.

    The topbar carries the actions on a wide screen, but a page with more than
    three of them collapses into the + menu at every width, and below 900px
    every page does. So look for a visible topbar button first and fall back
    to opening the menu.
    """
    button = page.locator(f'.topbar-actions:not(.is-collapsed) button:has-text("{label}"), '
                          f'.topbar-actions:not(.is-collapsed) a:has-text("{label}")')
    if await button.count() and await button.first.is_visible():
        await button.first.click()
        return
    wrap = page.locator("#fab-wrap")
    if not await wrap.locator(".fab-wrap.open").count():
        await page.click("#fab-toggle")
        await page.wait_for_timeout(200)
    await page.click(f'.fab-item:has-text("{label}")')


async def fill_pin(page, group, digits):
    boxes = page.locator(f'[data-pin-group="{group}"] .pin-input')
    for i, d in enumerate(digits):
        await boxes.nth(i).fill(d)


def check_rules_parity():
    """v2/js/rules.js copies its rules constants out of v1's app.js.

    They are copies on purpose -- app.js is 5,000 lines with side effects and
    cannot be loaded by a v2 page -- but a copy that silently drifts is a rules
    bug in both versions at once. This compares the text of each one.
    """
    import re

    app = open("/home/user/taphou5e/app.js").read()
    rules = open("/home/user/taphou5e/v2/js/rules.js").read()

    def block_of(src, name):
        """The declaration's text, from `const NAME =` to its balanced close.

        Brace counting rather than line matching, because these range from a
        one-line array to a forty-line object and both forms appear in each
        file.
        """
        start = src.index(f"const {name} = ")
        depth, i, seen = 0, src.index("=", start) + 1, False
        while i < len(src):
            ch = src[i]
            if ch in "[{":
                depth += 1
                seen = True
            elif ch in "]}":
                depth -= 1
                if seen and depth == 0:
                    i += 1
                    break
            i += 1
        # Normalise whitespace so indentation differences are not drift.
        return re.sub(r"\s+", " ", src[start:i])

    for name in ("SKILLS", "ABILITIES", "ABILITY_FULL", "HIT_DICE", "ASI_LEVELS",
                 "SUBCLASSES", "FEATS"):
        try:
            a, b = block_of(app, name), block_of(rules, name)
        except ValueError:
            raise AssertionError(f"{name} is missing from one of the two files")
        assert a == b, f"{name} has drifted between app.js and v2/js/rules.js"
    ok(f"the rules constants v2 copies still match v1's ({7} of them)")

    # These are expressions, not blocks, so compare them literally.
    for line in ("const getModifier = score => Math.floor((score - 10) / 2);",
                 "const getProfBonus = level => Math.ceil(level / 4) + 1;"):
        assert line in app and line in rules, line
    assert "const SUBCLASS_LEVEL = 3;" in app and "const SUBCLASS_LEVEL = 3;" in rules
    ok("the modifier, proficiency and subclass-level rules match v1 exactly")


async def main():
    check_rules_parity()

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
        # The switch has to swap the forms, not just reveal one. `.login-card`
        # sets display:flex, which beats the UA's `[hidden] { display: none }`
        # on specificity, so both forms rendered at once and the segmented
        # control appeared to do nothing.
        assert await page.locator("#join-form").is_visible()
        assert not await page.locator("#create-form").is_visible(), \
            "only the join form should show on load"
        ok("the login page opens on the join form alone")

        await page.click('button[data-mode="create"]')
        assert await page.locator("#create-form").is_visible()
        assert not await page.locator("#join-form").is_visible(), \
            "switching to create must hide join, not just show create"
        active = (await page.locator(".segmented .is-active").first.inner_text()).strip()
        assert "Create" in active, active
        ok("the switch swaps the forms and marks the active side")

        # And back again, including via the link under the join form.
        await page.click('button[data-mode="join"]')
        assert await page.locator("#join-form").is_visible()
        assert not await page.locator("#create-form").is_visible()
        await page.click('a[data-mode="create"]')
        assert await page.locator("#create-form").is_visible()
        assert not await page.locator("#join-form").is_visible()
        ok("the switch works both ways, and so does the 'create one' link")
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

        # ---------- 21. Chapters, checks, areas ----------
        await page.click('.campaign-tabs button:has-text("Chapters")')
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
        await act(page, "Roll initiative")
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        rolled = [w for w in writes if w["table"] == "encounter_combatants"
                  and "initiative" in (w["payload"] or {})]
        assert len(rolled) == 1, "only the combatant without an initiative should be rolled"
        assert 1 <= rolled[-1]["payload"]["initiative"] <= 20, rolled[-1]
        ok("rolling initiative only fills the blanks")

        await act(page, "Start encounter")
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
        # Initiative for the blanks is rolled, so naming a combatant here is a
        # coin toss -- what the tracker guarantees is the ordering itself.
        rolls = await page.evaluate("""() => Array.from(document.querySelectorAll('.init-row'))
            .map(r => {
              const input = r.querySelector('.init-input');
              return Number(input ? input.value : r.querySelector('.init-value b').textContent);
            })""")
        assert len(rolls) == len(running_order), (rolls, running_order)
        assert rolls == sorted(rolls, reverse=True), rolls
        ok(f"a running encounter shows one flat initiative order, highest first ({rolls})")

        # Advancing past the last live combatant wraps and increments the round.
        # The downed one must never take a turn.
        live = await page.locator(".init-row:not(.is-dead)").count()
        seen = []
        for _ in range(live):
            await act(page, "Next turn")
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

        # ...unless there are too many to sit in a row. The tracker had ten
        # buttons across the top of a desktop screen; they belong in the menu.
        await mp.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await mp.wait_for_selector(".init-row", timeout=10000)
        assert await mp.locator("#fab-toggle").is_visible(), "a crowded topbar keeps the FAB on desktop"
        showing = await mp.locator(".topbar-actions:not(.is-collapsed) .btn").count()
        assert showing == 0, showing
        ok("a page with more than three actions keeps the + menu on desktop and empties the topbar")

        await mp.click("#fab-toggle")
        await mp.wait_for_timeout(250)
        labels = [t.strip() for t in await mp.locator(".fab-item").all_inner_texts()]
        assert len(labels) > 3, labels
        ok(f"the desktop menu carries all {len(labels)} tracker actions")

        # One panel, not a stack of pills: every row the same width, inside a
        # single bordered box.
        shape = await mp.evaluate(MENU_SHAPE_JS)
        assert len(set(shape["items"])) == 1, shape
        assert shape["items"][0] < shape["menu"], shape
        assert shape["bordered"], "the menu itself should be the bordered surface"
        ok(f"menu rows are one width inside one panel ({shape['items'][0]}px in {shape['menu']}px)")

        # A page under the limit still uses the topbar on desktop.
        await mp.goto(f"{BASE}/v2/campaigns.html", wait_until="domcontentloaded")
        await mp.wait_for_selector(".topbar", timeout=10000)
        assert not await mp.locator("#fab-toggle").is_visible()
        assert await mp.locator(".topbar-actions:not(.is-collapsed) .btn").count() >= 1
        ok("a page under the limit still shows its actions in the topbar")

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
        await act(page, "Add monsters")
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
        await page.click('.campaign-tabs button:has-text("Chapters")')
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
        assert p_["chapter_beat_id"] and p_.get("area_id") is None, p_
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

        # Areas can carry a check too -- a trap needs no chapter beat.
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
        assert area_check["payload"].get("chapter_beat_id") is None, area_check
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
        await act(page, "Add monsters")
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
        await act(page, "Roll initiative")
        await page.wait_for_timeout(500)
        await act(page, "Start encounter")
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
        await act(page, "Delete campaign")
        await page.wait_for_selector(".modal", timeout=5000)
        message = await page.locator(".modal-body .prose").inner_text()
        assert "chapter" in message and "NPC" in message and "encounter" in message, message
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
        await act(page, "Delete encounter")
        await page.wait_for_selector(".modal", timeout=5000)
        message = await page.locator(".modal-body .prose").inner_text()
        assert "combatant" in message and "roster" in message, message
        ok("deleting an encounter says the campaign roster is left alone")
        await page.click("#modal-close")
        await page.wait_for_timeout(300)

        # Linking an encounter to the moment in the story it belongs to.
        await act(page, "Link to a beat")
        await page.wait_for_selector(".modal", timeout=5000)
        options = [t.strip() for t in await page.locator("#mf-chapter_beat_id option").all_inner_texts()]
        assert any("The first crossing" in o for o in options), options
        assert any("The Toll Keeper" in o for o in options), "beats show their chapter"
        ok(f"the beat picker offers this campaign's beats, named by chapter")

        await page.select_option("#mf-chapter_beat_id", label=[o for o in options if "first crossing" in o][0])
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        link = [w for w in writes if w["table"] == "encounters"][-1]
        assert link["payload"]["chapter_beat_id"] == "b1", link
        ok("linking writes chapter_beat_id")
        assert "The first crossing" in await page.locator(".story-link").inner_text()
        ok("the encounter shows which beat it belongs to")

        # ---------- 40. Encounter sharing ----------
        await page.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await page.wait_for_selector(".init-row", timeout=10000)
        await act(page, "Share encounter")
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
        await page.wait_for_selector("#fab-toggle, .topbar-actions button", timeout=10000)
        await page.evaluate("window.__resetWrites()")
        await act(page, "Add a shared encounter")
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

        # ---------- 42. Character creation ----------
        await page.goto(f"{BASE}/v2/character-new.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".wizard", timeout=10000)

        # The wizard says what is missing rather than a dead Next button.
        assert await page.locator("#wz-next").is_disabled()
        assert "name" in (await page.locator(".wizard-blocker").inner_text()).lower()
        ok("the wizard names what is blocking it instead of only disabling Next")

        await page.fill("#wz-name", "Ysolde Marr")
        await page.fill("#wz-player", "Kim")
        await page.select_option("#wz-race", "Half-Orc")
        await page.select_option("#wz-class", "Barbarian")
        await page.wait_for_timeout(250)

        hint = await page.locator("#wz-race-hint").inner_text()
        assert "STR +2" in hint and "CON +1" in hint, hint
        ok(f"the race hint shows the bonuses before anything is saved ({hint})")

        assert "d12" in await page.locator("#wz-class-hint").inner_text()
        ok("the class hint shows its hit die")

        await page.click("#wz-next")
        await page.wait_for_selector(".method-grid", timeout=5000)

        # Standard array: six numbers, each used once.
        await page.click('[data-method="standard"]')
        await page.wait_for_timeout(200)
        assert await page.locator("#wz-next").is_disabled()
        ok("the array step blocks until all six numbers are assigned")

        for ability, index in [("str", "0"), ("con", "1"), ("dex", "2"),
                               ("wis", "3"), ("cha", "4"), ("int", "5")]:
            await page.select_option(f'[data-array="{ability}"]', index)
            await page.wait_for_timeout(120)

        # 15 was taken by STR, so nobody else can be given it.
        dex_options = page.locator('[data-array="dex"] option')
        disabled = await dex_options.nth(1).is_disabled()
        assert disabled, "a number already assigned elsewhere should be disabled"
        ok("a number assigned to one ability cannot be assigned to another")

        row = page.locator('.ability-assign-row:has([data-array="str"]) .score-readout')
        text = await row.inner_text()
        # 15 from the array, +2 from Half-Orc, so the sheet stores 17 (+3).
        assert "+2" in text and "17" in text and "+3" in text, text
        ok(f"the racial bonus is shown on the score before saving ({text.split()})")

        assert not await page.locator("#wz-next").is_disabled()
        await page.click("#wz-next")
        await page.wait_for_selector(".review-scores", timeout=5000)

        review = await page.locator(".review-grid").inner_text()
        # Barbarian d12, CON 13+1 = 14 (+2): 12 + 2 = 14 hit points at level 1.
        assert "14" in review, review
        ok("review shows the hit points the engine will store")

        # ---------- 43. Point buy ----------
        await page.click("#wz-back")
        await page.wait_for_selector(".method-grid", timeout=5000)
        await page.click('[data-method="pointbuy"]')
        await page.wait_for_timeout(250)

        budget = await page.locator(".budget").inner_text()
        assert "27" in budget, budget
        ok("point buy starts with the full 27 point budget")

        # Every score starts at 8, so nothing can go lower.
        assert await page.locator('[data-buy="str"][data-delta="-1"]').is_disabled()
        ok("point buy will not take a score below 8")

        # 8 -> 15 costs 9 points; do it three times and the budget is spent.
        for ability in ("str", "con", "dex"):
            for _ in range(7):
                await page.click(f'[data-buy="{ability}"][data-delta="1"]')
                await page.wait_for_timeout(60)

        budget = await page.locator(".budget").inner_text()
        assert "0 points left" in budget, budget
        ok("three 15s spend exactly the 27 point budget")

        # 14 -> 15 costs two points, not one, which is the whole point of the
        # table -- so with nothing left, no score can rise.
        for ability in ABILITY_CODES:
            assert await page.locator(f'[data-buy="{ability}"][data-delta="1"]').is_disabled(), ability
        ok("with the budget spent, no score can be raised")

        await page.click('[data-buy="str"][data-delta="-1"]')
        await page.wait_for_timeout(200)
        budget = await page.locator(".budget").inner_text()
        assert "2 points left" in budget, budget
        ok("stepping 15 back down to 14 refunds two points, not one")

        # ---------- 44. Half-Elf, and what creation writes ----------
        await page.click("#wz-back")
        await page.wait_for_selector("#wz-race", timeout=5000)
        await page.select_option("#wz-race", "Half-Elf")
        await page.wait_for_timeout(250)
        await page.click("#wz-next")
        await page.wait_for_selector(".method-grid", timeout=5000)

        assert await page.locator('[data-halfelf]').count() == 5, "Charisma is excluded"
        ok("a Half-Elf is offered the five abilities other than Charisma")

        assert await page.locator("#wz-next").is_disabled()
        assert "Half-Elf" in await page.locator(".wizard-blocker").inner_text()
        ok("the wizard blocks until the Half-Elf choice is made")

        await page.click('[data-halfelf="strength"]')
        await page.click('[data-halfelf="constitution"]')
        await page.wait_for_timeout(200)
        assert not await page.locator("#wz-next").is_disabled()
        ok("choosing two abilities unblocks the step")

        await page.evaluate("window.__resetWrites()")
        await page.click("#wz-next")
        await page.wait_for_selector(".review-scores", timeout=5000)
        await page.click("#wz-next")
        await page.wait_for_timeout(1200)

        writes = await page.evaluate("window.__writes")
        made = [w for w in writes if w["table"] == "characters" and w["verb"] == "insert"]
        assert made, [w["table"] for w in writes]
        char = made[-1]["payload"]
        assert char["name"] == "Ysolde Marr" and char["player_name"] == "Kim", char
        assert char["race"] == "Half-Elf" and char["class"] == "Barbarian", char
        assert char["game_world_id"] == "w1", char
        ok("creation writes the character to this world")

        tables = [w["table"] for w in writes if w["verb"] == "insert"]
        for scaffold in ("ability_scores", "skills", "saving_throws", "currency", "character_details"):
            assert scaffold in tables, (scaffold, tables)
        ok("the five scaffolding tables v1 seeds are seeded here too")

        skills = [w for w in writes if w["table"] == "skills" and w["verb"] == "insert"][-1]
        assert isinstance(skills["payload"], list) and len(skills["payload"]) == 18, skills
        ok("all eighteen skills are written in one insert")

        # The engine keys scores by their LONG names. Handing it short keys
        # silently misses every bonus and then writes undefined over all six,
        # so this asserts the shape, not just that the call happened.
        effects = [w for w in writes if w["table"] == "character_effects" and w["verb"] == "insert"]
        assert effects, "the engine should record racial effects"
        targets = sorted(e["target"] for e in effects[-1]["payload"])
        assert "charisma" in targets, targets
        assert "strength" in targets and "constitution" in targets, targets
        ok(f"the shared engine ran and recorded the racial effects ({targets})")

        scores_write = [w for w in writes if w["table"] == "ability_scores" and w["verb"] == "update"]
        assert scores_write, "the engine should write the adjusted scores"
        adjusted = scores_write[-1]["payload"]
        assert all(isinstance(v, int) for v in adjusted.values()), adjusted
        ok(f"the adjusted scores are numbers, not undefined ({sorted(adjusted)[:3]}...)")

        # ---------- 45. Level-up wizard ----------
        # Korr is a level 4 Barbarian owed a level, granted from 4 to 6. The
        # sheet stub serves one character whatever the id, so this needs its
        # own context carrying Korr as the single character.
        luctx = await browser.new_context()
        await luctx.add_init_script(stub_with(characters_single=KORR))
        await luctx.add_init_script("""
            try {
              localStorage.setItem('dnd-session', JSON.stringify({
                gameWorldId: 'w1', gameWorldName: 'Thornfell Reach', role: 'dm',
                dmToken: 'tok_' + 'a'.repeat(60), dmTokenIssued: Date.now(),
                timestamp: Date.now() }));
              localStorage.setItem('preGrantLevel_c3', '4');
              localStorage.setItem('targetLevel_c3', '6');
            } catch (e) {}
        """)
        lu = await luctx.new_page()
        watch(lu, "levelup")

        await lu.goto(f"{BASE}/v2/character-sheet.html?id=c3", wait_until="domcontentloaded")
        await lu.wait_for_selector(".sheet-header", timeout=10000)

        assert await lu.locator(".levelup-banner").count() == 1
        ok("a character owed a level gets a banner on their sheet")

        await lu.click(".levelup-banner")
        await lu.wait_for_selector(".wizard-steps", timeout=10000)
        await lu.wait_for_timeout(900)

        title = await lu.locator(".modal-head h2").inner_text()
        assert "4" in title and "6" in title, title
        ok(f"a multi-level grant opens as one run across the range ({title})")

        # Two levels gained means two hit point choices, not one repeated.
        rows = await lu.locator(".hp-choice-row").count()
        assert rows == 2, rows
        ok("each level gained gets its own hit point choice")

        steps = [t.strip() for t in await lu.locator(".wizard-steps li .label").all_inner_texts()]
        # Barbarians take ASIs at 4, 8, 12 -- neither 5 nor 6 is one. The class
        # has no spellcasting either, so both steps must skip themselves.
        assert "ASI" not in steps, steps
        assert "Spells" not in steps, steps
        assert "Subclass" in steps, steps
        ok(f"steps that do not apply skip themselves ({steps})")

        await lu.click("#lu-avg-all")
        await lu.wait_for_timeout(300)
        total = await lu.locator(".wizard-body .hint").last.inner_text()
        # d12 Barbarian, CON 10 (+0): average is 7 a level, so 14 for two.
        assert "+14" in total, total
        ok(f"taking the average for all fills every level ({total.strip()})")

        await lu.click("#lu-next")
        await lu.wait_for_selector(".pick-list", timeout=5000)
        assert await lu.locator('[data-subclass]').count() >= 7
        assert await lu.locator("#lu-next").is_disabled()
        ok("the subclass step blocks until one is chosen")

        await lu.click('[data-subclass="Path of the Berserker"]')
        await lu.wait_for_timeout(200)
        await lu.click("#lu-next")
        await lu.wait_for_selector(".review-grid", timeout=5000)

        summary = await lu.locator(".review-grid").inner_text()
        # Level 6 proficiency is +3, hit dice become 6d12.
        assert "+3" in summary and "6d12" in summary, summary
        ok(f"the summary shows the level 6 proficiency and hit dice")

        features = await lu.locator(".pick-list").inner_text()
        assert "Extra Attack" in features and "Path Feature" in features, features
        ok("features from every level in the range are listed, not just the last")

        await lu.evaluate("window.__resetWrites()")
        await lu.click("#lu-next")
        await lu.wait_for_timeout(1500)

        writes = await lu.evaluate("window.__writes")
        updates = [w for w in writes if w["table"] == "characters" and w["verb"] == "update"]
        assert updates, [w["table"] for w in writes]
        final = updates[-1]["payload"]
        assert final["level"] == 6, final
        assert final["proficiency_bonus"] == 3, final
        assert final["hit_dice_total"] == "6d12", final
        assert final["pending_level_up"] is False, final
        ok("finishing writes the target level, proficiency, hit dice and clears the flag")

        hp = [w for w in updates if "hit_point_maximum" in w["payload"]]
        assert hp, [w["payload"] for w in updates]
        # Korr was 52/22; +14 across two levels.
        assert hp[-1]["payload"]["hit_point_maximum"] == 66, hp[-1]
        assert hp[-1]["payload"]["current_hit_points"] == 36, hp[-1]
        ok("the hit point gain is added to both maximum and current")

        saved_features = [w for w in writes if w["table"] == "features_traits" and w["verb"] == "insert"]
        names = [w["payload"]["name"] for w in saved_features]
        assert "Extra Attack" in names, names
        assert "Mindless Rage" in names, "subclass features should be saved too"
        ok(f"class and subclass features are both saved ({len(names)} rows)")

        left = await lu.evaluate("localStorage.getItem('preGrantLevel_c3')")
        assert left is None, left
        ok("the wizard clears the level markers it consumed")

        await luctx.close()

        # ---------- 46. Press-and-hold card menus ----------
        # The gesture has to survive three things: a scroll that starts on a
        # card, the click the browser fires afterwards, and a redraw.
        hold = await browser.new_context(
            viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        await hold.add_init_script(STUB)
        hp = await hold.new_page()
        watch(hp, "hold")

        await hp.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await hp.fill("#world-name", "Thornfell Reach")
        await fill_pin(hp, "join", "1379")
        await hp.click("#join-form .btn-submit")
        await hp.wait_for_selector(".party-roster", timeout=10000)

        await hp.goto(f"{BASE}/v2/campaigns.html", wait_until="domcontentloaded")
        await hp.wait_for_selector(".campaign-card", timeout=10000)

        box = await hp.locator(".campaign-card").first.bounding_box()
        cx, cy = box["x"] + box["width"] / 2, box["y"] + 24

        # A short tap must still follow the link, not open a menu.
        await hp.touchscreen.tap(cx, cy)
        await hp.wait_for_timeout(600)
        assert "campaign.html" in hp.url, hp.url
        ok("a normal tap still opens the card")

        await hp.go_back(wait_until="domcontentloaded")
        await hp.wait_for_selector(".campaign-card", timeout=10000)

        async def press_hold(page, x, y, ms=700):
            await page.evaluate(TOUCH_HOLD_JS, {"x": x, "y": y, "ms": ms})

        await press_hold(hp, cx, cy)
        await hp.wait_for_selector(".card-menu", timeout=5000)
        ok("holding a campaign card opens its menu")

        labels = [t.strip().split("\n")[0] for t in await hp.locator(".card-menu-item .label").all_inner_texts()]
        assert "Delete" in labels and "Edit" in labels, labels
        ok(f"the menu offers the actions that had no home before ({labels})")

        # The menu must not have let the card's own link fire underneath it.
        assert "campaigns.html" in hp.url, hp.url
        ok("the click that follows a hold does not open the card behind the menu")

        await hp.click("#modal-close")
        await hp.wait_for_timeout(300)

        # A hold that turns into a scroll is a trap, so movement cancels it.
        await hp.evaluate(TOUCH_SCROLL_JS, {"x": cx, "y": cy})
        await hp.wait_for_timeout(900)
        assert await hp.locator(".card-menu").count() == 0, "a scroll must not open the menu"
        ok("a hold that moves is a scroll, and opens nothing")

        # Deleting through the menu writes the delete.
        await press_hold(hp, cx, cy)
        await hp.wait_for_selector(".card-menu", timeout=5000)
        await hp.click('.card-menu-item:has-text("Delete")')
        await hp.wait_for_selector(".modal-body", timeout=5000)
        message = await hp.locator(".modal-body").inner_text()
        assert "chapters" in message and "stay in the world" in message, message
        ok("deleting from the menu says what cascades and that characters survive")

        await hp.evaluate("window.__resetWrites()")
        await hp.click('.modal-actions button[type="submit"]')
        await hp.wait_for_timeout(700)
        writes = await hp.evaluate("window.__writes")
        assert [w for w in writes if w["table"] == "campaigns" and w["verb"] == "delete"], writes
        ok("the campaign delete is written from the card menu")

        # ---------- 47. Deleting a character needs the name typed ----------
        await hp.goto(f"{BASE}/v2/characters.html", wait_until="domcontentloaded")
        await hp.wait_for_selector(".character-card", timeout=10000)
        cbox = await hp.locator(".character-card").first.bounding_box()
        await press_hold(hp, cbox["x"] + cbox["width"] / 2, cbox["y"] + 24)
        await hp.wait_for_selector(".card-menu", timeout=5000)

        title = await hp.locator(".modal-head h2").inner_text()
        await hp.click('.card-menu-item:has-text("Delete")')
        await hp.wait_for_selector("#mf-typed", timeout=5000)
        ok(f"a character's menu offers delete ({title})")

        await hp.evaluate("window.__resetWrites()")
        await hp.fill("#mf-typed", "something else")
        await hp.click('.modal-actions button[type="submit"]')
        await hp.wait_for_timeout(500)
        assert "not the name" in await hp.locator(".modal-error").inner_text()
        writes = await hp.evaluate("window.__writes")
        assert not [w for w in writes if w["verb"] == "delete"], writes
        ok("a character is not deleted unless the name is typed exactly")

        await hp.fill("#mf-typed", f"  {title.replace('Delete ', '')}  ")
        await hp.click('.modal-actions button[type="submit"]')
        await hp.wait_for_timeout(700)
        writes = await hp.evaluate("window.__writes")
        assert [w for w in writes if w["table"] == "characters" and w["verb"] == "delete"], writes
        ok("the typed name is matched ignoring case and surrounding spaces")

        # ---------- 48. The campaign detail resolver ----------
        # Every tab's rows share one gesture and one resolver, switching on the
        # kind the row declares, so each kind needs to actually resolve.
        await hp.goto(f"{BASE}/v2/campaign.html?id=cam1", wait_until="domcontentloaded")
        await hp.wait_for_selector(".campaign-tabs", timeout=10000)

        async def hold_first(selector):
            await hp.wait_for_selector(selector, timeout=5000)
            b = await hp.locator(selector).first.bounding_box()
            await press_hold(hp, b["x"] + min(b["width"] / 2, 120), b["y"] + 18)
            await hp.wait_for_selector(".card-menu", timeout=5000)
            out = [t.strip() for t in await hp.locator(".card-menu-item .label").all_inner_texts()]
            head = await hp.locator(".modal-head h2").inner_text()
            await hp.click("#modal-close")
            await hp.wait_for_timeout(250)
            return head, out

        await hp.click('.campaign-tabs button:has-text("Chapters")')
        title, labels = await hold_first('[data-kind="chapter"]')
        assert "Delete" in labels and any("beat" in l.lower() for l in labels), labels
        ok(f"a chapter resolves ({title}: {labels})")

        await hp.click('.campaign-tabs button:has-text("NPCs")')
        title, labels = await hold_first('[data-kind="npc"]')
        assert labels[0] == "Edit" and "Delete" in labels, labels
        ok(f"an NPC resolves, and can now be edited at all ({title})")

        await hp.click('.campaign-tabs button:has-text("Monsters")')
        title, labels = await hold_first('[data-kind="monster"]')
        assert labels == ["Remove from roster"], labels
        ok(f"a roster monster can be removed, which it could not before ({title})")

        await hp.click('.campaign-tabs button:has-text("Party")')
        title, labels = await hold_first('[data-kind="party"]')
        assert "Open sheet" in labels, labels
        assert any("campaign" in l for l in labels), labels
        ok(f"a party member resolves ({title}: {labels})")

        # ---------- 49. Combatant rows ----------
        await hp.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await hp.wait_for_selector(".init-row", timeout=10000)
        # Target the party row: initiative order decides which row is first,
        # and the "stays in the world" wording is specific to a character.
        b = await hp.locator(".init-row.is-party").first.bounding_box()
        await press_hold(hp, b["x"] + 120, b["y"] + 18)
        await hp.wait_for_selector(".card-menu", timeout=5000)
        labels = [t.strip() for t in await hp.locator(".card-menu-item .label").all_inner_texts()]
        assert "Set colour" in labels and "Edit note" in labels, labels
        ok(f"a combatant row reaches everything the inline buttons had no room for ({len(labels)} actions)")

        # A character is in the encounter, not owned by it.
        hint = await hp.locator('.card-menu-item:has-text("Remove") .hint').inner_text()
        assert "stay in the world" in hint, hint
        ok("removing a character from an encounter says they stay in the world")

        await hp.click("#modal-close")
        await hp.wait_for_timeout(250)

        # setColor applies the colour it is given, so the menu needs a picker.
        await press_hold(hp, b["x"] + 120, b["y"] + 18)
        await hp.wait_for_selector(".card-menu", timeout=5000)
        await hp.click('.card-menu-item:has-text("Set colour")')
        await hp.wait_for_selector(".swatches", timeout=5000)
        assert await hp.locator("[data-pick]").count() == 8, "no colour, plus the seven in the palette"
        await hp.evaluate("window.__resetWrites()")
        await hp.click('[data-pick="#7fa65c"]')
        await hp.wait_for_timeout(600)
        writes = await hp.evaluate("window.__writes")
        coloured = [w for w in writes if w["table"] == "encounter_combatants"
                    and (w["payload"] or {}).get("color") == "#7fa65c"]
        assert coloured, writes
        ok("the colour picker writes the chosen colour")

        await hold.close()

        # ---------- 50. The sheet can be written to ----------
        # It was read-only everywhere but hit points, conditions, proficiency
        # toggles and rests, so a player had to open the classic version to
        # record a spell they had just learned.
        await page.goto(f"{BASE}/v2/character-sheet.html?id=c2", wait_until="domcontentloaded")
        await page.wait_for_selector(".sheet-header", timeout=10000)

        await click_tab(page, "Spells")
        await page.wait_for_selector(".slot-chip", timeout=5000)

        # Slots: tap to spend. The fixture has 4 level-1 slots with 1 used.
        first = page.locator('.slot-chip:has-text("L1")')
        assert "3/4" in await first.inner_text(), await first.inner_text()
        await page.evaluate("window.__resetWrites()")
        await first.click()
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        spent = [w for w in writes if w["table"] == "spell_slots"][-1]
        assert spent["payload"]["used"] == 2, spent
        assert "2/4" in await page.locator('.slot-chip:has-text("L1")').inner_text()
        ok("tapping a spell slot spends it")

        # Holding gives it back.
        b = await page.locator('.slot-chip:has-text("L1")').bounding_box()
        await page.evaluate(TOUCH_HOLD_JS, {"x": b["x"] + b["width"] / 2, "y": b["y"] + b["height"] / 2, "ms": 700})
        await page.wait_for_selector(".card-menu", timeout=5000)
        await page.click('.card-menu-item:has-text("Restore one")')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        restored = [w for w in writes if w["table"] == "spell_slots"][-1]
        assert restored["payload"]["used"] == 1, restored
        ok("holding a spell slot restores one")

        # Prepared toggles without opening the spell.
        await page.evaluate("window.__resetWrites()")
        await page.click('.list-row:has-text("Fire Bolt") .prep-toggle')
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        prep = [w for w in writes if w["table"] == "spells"][-1]
        assert prep["payload"]["prepared"] is False, prep
        assert await page.locator(".pane").count() == 0, "toggling must not open the detail pane"
        ok("the prepared toggle writes without opening the spell")

        # Adding a spell, through the SRD search.
        await page.click('.section-head:has-text("Spells") button:has-text("Add")')
        await page.wait_for_selector("#srd-lookup", timeout=5000)
        await page.fill("#srd-lookup", "fire")
        await page.wait_for_selector(".srd-hit", timeout=5000)
        await page.click('.srd-hit:has-text("Fireball")')
        await page.wait_for_timeout(600)

        assert await page.input_value("#mf-name") == "Fireball"
        assert await page.input_value("#mf-level") == "3"
        assert "Evocation" in await page.input_value("#mf-school")
        assert "V, S, M" in await page.input_value("#mf-components")
        ok("picking an SRD spell fills the form from the API")

        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        added = [w for w in writes if w["table"] == "spells" and w["verb"] == "insert"][-1]
        assert added["payload"]["name"] == "Fireball", added
        assert added["payload"]["level"] == 3, added
        assert added["payload"]["api_index"] == "fireball", added
        assert added["payload"]["character_id"] == "c2", added
        ok("adding a spell writes it against this character")

        # A spell level outside 0-9 is refused before it reaches the database.
        await page.click('.section-head:has-text("Spells") button:has-text("Add")')
        await page.wait_for_selector("#mf-level", timeout=5000)
        await page.fill("#mf-name", "Wish Harder")
        await page.fill("#mf-level", "12")
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(400)
        assert "between 0 and 9" in await page.locator(".modal-error").inner_text()
        writes = await page.evaluate("window.__writes")
        assert not [w for w in writes if w["table"] == "spells"], writes
        ok("a spell level out of range is refused before it reaches the database")
        await page.click("#modal-close")

        # ---------- 51. Inventory and currency ----------
        await click_tab(page, "Inventory")
        await page.wait_for_selector(".qty", timeout=5000)

        await page.evaluate("window.__resetWrites()")
        await page.click('.list-row:has-text("Spellbook") .qty button:has-text("+")')
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        qty = [w for w in writes if w["table"] == "inventory_items"][-1]
        assert qty["payload"]["quantity"] == 2, qty
        assert await page.locator(".pane").count() == 0, "the stepper must not open the detail pane"
        ok("item quantity steps up without opening the item")

        # Down to zero drops the item rather than leaving a row saying 0.
        await page.evaluate("window.__resetWrites()")
        await page.click('.list-row:has-text("Spellbook") .qty button:has-text("\u2212")')
        await page.wait_for_timeout(400)
        await page.click('.list-row:has-text("Spellbook") .qty button:has-text("\u2212")')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        assert [w for w in writes if w["table"] == "inventory_items" and w["verb"] == "delete"], writes
        ok("taking the last one drops the item instead of leaving a zero")

        await page.click('.section-head:has-text("Currency") button:has-text("Add")')
        await page.wait_for_selector("#mf-gold", timeout=5000)
        assert await page.input_value("#mf-gold") == "137"
        await page.fill("#mf-gold", "-5")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(400)
        assert "zero or more" in await page.locator(".modal-error").inner_text()
        ok("currency cannot go negative")

        await page.fill("#mf-gold", "200")
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        purse = [w for w in writes if w["table"] == "currency"][-1]
        assert purse["payload"]["gold"] == 200 and purse["payload"]["copper"] == 12, purse
        ok("currency saves every coin type, not just the one changed")

        # ---------- 52. Weapons, features and notes ----------
        await click_tab(page, "Actions")
        await page.wait_for_selector('.section-head:has-text("Weapons")', timeout=5000)
        await page.click('.section-head:has-text("Weapons") button:has-text("Add")')
        await page.wait_for_selector("#srd-lookup", timeout=5000)
        await page.fill("#srd-lookup", "longsw")
        await page.wait_for_selector(".srd-hit", timeout=5000)
        await page.click('.srd-hit:has-text("Longsword")')
        await page.wait_for_timeout(600)
        assert await page.input_value("#mf-damage") == "1d8"
        assert await page.input_value("#mf-damage_type") == "Slashing"
        ok("an SRD weapon fills its damage and type")
        await page.click("#modal-close")

        # Arcane Recovery is already spent in the fixture (0 of 1), so tapping
        # it must write nothing rather than going negative.
        assert "0/1" in await page.locator(".charge").inner_text()
        await page.evaluate("window.__resetWrites()")
        await page.click(".charge")
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        assert not [w for w in writes if w["table"] == "features_traits"], writes
        ok("spending a feature that has no uses left writes nothing")

        # Holding gives one back, which is the only way to correct a mis-tap
        # between rests.
        b = await page.locator('.list-row:has-text("Arcane Recovery")').bounding_box()
        await page.evaluate(TOUCH_HOLD_JS, {"x": b["x"] + 80, "y": b["y"] + 18, "ms": 700})
        await page.wait_for_selector(".card-menu", timeout=5000)
        await page.evaluate("window.__resetWrites()")
        await page.click('.card-menu-item:has-text("Restore one use")')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        restored = [w for w in writes if w["table"] == "features_traits"][-1]
        assert restored["payload"]["uses_remaining"] == 1, restored
        ok("holding a feature restores a use")

        # And now it can be spent, without opening the feature's detail pane.
        await page.evaluate("window.__resetWrites()")
        await page.click(".charge")
        await page.wait_for_timeout(500)
        writes = await page.evaluate("window.__writes")
        used = [w for w in writes if w["table"] == "features_traits"][-1]
        assert used["payload"]["uses_remaining"] == 0, used
        assert await page.locator(".pane").count() == 0, "the charge must not open the feature"
        ok("a feature's charges can be spent from the row")

        # ---------- 52b. Equipped carried weapons are actions ----------
        # The two tabs read two different tables, so a weapon in inventory had
        # no path to Actions at all. Equipping it is now that path.
        await click_tab(page, "Actions")
        await page.wait_for_selector('.section-head:has-text("Weapons")', timeout=5000)
        await page.wait_for_timeout(900)   # the SRD lookup redraws once it lands

        names = [t.strip() for t in await page.locator(".stack .list-row .name").all_inner_texts()]
        assert any("Longsword" in n for n in names), names
        ok("an equipped weapon from the inventory shows as an action")

        assert not any("Dagger" in n for n in names), names
        ok("an unequipped one does not")

        # inventory_items has no damage column, so this can only have come
        # from the SRD lookup.
        row = page.locator('.list-row:has-text("Longsword")')
        meta = await row.locator(".meta").inner_text()
        assert "1d8" in meta and "Slashing" in meta, meta
        ok(f"its damage is resolved from the SRD by name ({meta.strip()})")

        # Equipped sorts to the top, and nothing is hidden for being unequipped.
        first = (await page.locator(".stack .list-row .name").first.inner_text()).strip()
        assert "EQUIPPED" in first and "Longsword" in first, first
        assert any("Quarterstaff" in n for n in names), "unequipped weapons stay listed"
        ok(f"equipped sorts first without hiding the rest ({len(names)} actions)")

        # Unequipping takes it straight back off the tab.
        b = await page.locator('.list-row:has-text("Longsword")').bounding_box()
        await page.evaluate(TOUCH_HOLD_JS, {"x": b["x"] + 80, "y": b["y"] + 18, "ms": 700})
        await page.wait_for_selector(".card-menu", timeout=5000)
        hint = await page.locator('.card-menu-item:has-text("Unequip") .hint').inner_text()
        assert "off your actions" in hint, hint
        await page.evaluate("window.__resetWrites()")
        await page.click('.card-menu-item:has-text("Unequip")')
        await page.wait_for_timeout(700)

        writes = await page.evaluate("window.__writes")
        off = [w for w in writes if w["table"] == "inventory_items"][-1]
        assert off["payload"]["equipped"] is False, off
        names = [t.strip() for t in await page.locator(".stack .list-row .name").all_inner_texts()]
        assert not any("Longsword" in n for n in names), names
        ok("unequipping it takes it back off the actions tab")

        # A weapon proper can now be equipped at all, which nothing could do.
        b = await page.locator('.list-row:has-text("Quarterstaff")').bounding_box()
        await page.evaluate(TOUCH_HOLD_JS, {"x": b["x"] + 80, "y": b["y"] + 18, "ms": 700})
        await page.wait_for_selector(".card-menu", timeout=5000)
        await page.evaluate("window.__resetWrites()")
        await page.click('.card-menu-item .label:text-is("Equip")')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        equipped = [w for w in writes if w["table"] == "weapons"][-1]
        assert equipped["payload"]["equipped"] is True, equipped
        ok("a weapon's equipped flag can be set, which neither version could do before")

        await click_tab(page, "Notes")
        await page.wait_for_selector('.section-head:has-text("Backstory")', timeout=5000)
        body = await page.locator(".sheet-scroll").inner_text()
        assert "classic version" not in body, "the notes tab should no longer send people to v1"
        ok("the notes tab no longer tells people to go and use the classic version")

        await page.click('.section-head:has-text("Backstory") button:has-text("Add")')
        await page.wait_for_selector("#mf-value", timeout=5000)
        assert "Raised by the Ash" in await page.input_value("#mf-value")
        await page.fill("#mf-value", "Raised by the Ash, and in its debt.")
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(600)
        writes = await page.evaluate("window.__writes")
        saved = [w for w in writes if w["table"] == "character_details"][-1]
        assert saved["payload"]["backstory"] == "Raised by the Ash, and in its debt.", saved
        ok("a details field can be edited from the sheet")

        # ---------- 55. Typing into a number field ----------
        # Two ways a number field can fight the person using it, both of which
        # shipped: a redraw on keystroke that destroys the field (and closes
        # the keyboard on a phone), and a pre-filled value that the new digits
        # append to instead of replacing.
        typing = await browser.new_context(
            viewport={"width": 390, "height": 844}, has_touch=True, is_mobile=True)
        await typing.add_init_script(STUB)
        tp = await typing.new_page()
        watch(tp, "typing")

        await tp.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await tp.fill("#world-name", "Thornfell Reach")
        await fill_pin(tp, "join", "1379")
        await tp.click("#join-form .btn-submit")
        await tp.wait_for_selector(".party-roster", timeout=10000)

        await tp.goto(f"{BASE}/v2/character-new.html", wait_until="domcontentloaded")
        await tp.wait_for_selector("#wz-level", timeout=10000)

        level = tp.locator("#wz-level")
        await level.click()
        for digit in "12":
            await tp.keyboard.type(digit)
            await tp.wait_for_timeout(150)
            focused = await level.evaluate("el => document.activeElement === el")
            assert focused, f"the level field lost focus after typing {digit!r}"
        ok("typing a level keeps the field focused, so the keyboard stays up")

        assert await level.input_value() == "12", await level.input_value()
        ok("a two-digit level can actually be typed")

        # Out of range is caught on the way out, not on every keystroke --
        # clamping as you type makes the field impossible to clear and retype.
        # Blur first: the field is still focused from above, and clicking a
        # focused element fires no focusin, so it would not re-select.
        await tp.evaluate("() => document.activeElement && document.activeElement.blur()")
        await tp.wait_for_timeout(120)
        await level.click()
        await tp.keyboard.type("99")
        assert await level.input_value() == "99", "no clamping mid-word"
        await tp.locator("#wz-name").click()
        await tp.wait_for_timeout(200)
        assert await level.input_value() == "20", await level.input_value()
        ok("a level out of range is tidied on the way out, not mid-word")

        # While the field is empty mid-edit the step is blocked, and the block
        # says so without a redraw -- a redraw here is what closed the keyboard.
        await tp.fill("#wz-name", "Ysolde")
        await tp.fill("#wz-player", "Kim")
        await tp.evaluate("() => document.activeElement && document.activeElement.blur()")
        await tp.wait_for_timeout(120)
        await level.click()
        await tp.keyboard.press("Control+a")
        await tp.keyboard.press("Backspace")
        await tp.wait_for_timeout(200)
        assert await level.evaluate("el => document.activeElement === el"), \
            "clearing the field must not cost focus either"
        blocker = (await tp.locator(".wizard-blocker").inner_text()).lower()
        assert "level" in blocker, blocker
        assert await tp.locator("#wz-next").is_disabled()
        ok("an empty level blocks the step, in place, without a redraw")

        # Leaving it settles to a real level rather than writing null, and a
        # redraw from elsewhere must never print the string "null" into it.
        await tp.select_option("#wz-race", "Dwarf")
        await tp.wait_for_timeout(300)
        settled = await tp.locator("#wz-level").input_value()
        assert settled == "1", settled
        assert settled != "null"
        ok(f"an emptied level settles to {settled}, never to 'null'")

        # ---------- 56. Number fields replace, text fields do not ----------
        async def retype(page, selector, text):
            # Clicking an already-focused element fires no focusin, so the
            # blur is what makes this measure anything at all.
            await page.evaluate("() => document.activeElement && document.activeElement.blur()")
            await page.wait_for_timeout(120)
            el = page.locator(selector).first
            await el.click()
            await page.wait_for_timeout(150)
            await page.keyboard.type(text, delay=40)
            await page.wait_for_timeout(150)
            return await el.input_value()

        await tp.goto(f"{BASE}/v2/character-sheet.html?id=c2", wait_until="domcontentloaded")
        await tp.wait_for_selector(".sheet-header", timeout=10000)
        await tp.click('.tab-btn:has-text("Inventory")')
        await tp.wait_for_selector('.section-head:has-text("Currency")', timeout=5000)
        await tp.click('.section-head:has-text("Currency") button')
        await tp.wait_for_selector("#mf-gold", timeout=5000)

        assert await tp.locator("#mf-gold").input_value() == "137"
        value = await retype(tp, "#mf-gold", "250")
        assert value == "250", f"tapping a gold field showing 137 and typing 250 gave {value!r}"
        ok("a pre-filled number field replaces rather than appends")
        await tp.click("#modal-close")
        await tp.wait_for_timeout(300)

        # Text is deliberately left alone: selecting a name on focus would
        # destroy it the moment someone tapped in to fix one word.
        await tp.click('.tab-btn:has-text("Notes")')
        await tp.wait_for_selector('.section-head:has-text("Backstory")', timeout=5000)
        await tp.click('.section-head:has-text("Backstory") button')
        await tp.wait_for_selector("#mf-value", timeout=5000)
        before = await tp.locator("#mf-value").input_value()
        after = await retype(tp, "#mf-value", "X")
        assert after != "X" and before in after, (before, after)
        ok("a text field is not selected on focus, so tapping in does not wipe it")
        await typing.close()

        # ---------- 57. Chapters: what is collected is shown ----------
        await page.goto(f"{BASE}/v2/campaign.html?id=cam1", wait_until="domcontentloaded")
        await page.wait_for_selector(".campaign-tabs", timeout=10000)
        await page.click('.campaign-tabs button:has-text("Chapters")')
        await page.wait_for_selector(".campaign-card", timeout=5000)

        body = await page.locator(".campaign-tab-body").inner_text()
        # A check's outcomes were collected by the form, stored, and never
        # rendered -- which is the only reason anyone writes one down.
        assert "They spot the wire" in body, body
        assert "The darts fire" in body, body
        ok("a check shows what happens on a success and on a failure")

        # DM prose now comes from dm_notes, which players cannot read at all,
        # rather than a column any revealed row would hand over.
        assert "It is the harbourmaster" in body, "the chapter's note should show"
        assert "The toll keeper is already dead" in body, "the beat's note should show"
        ok("chapter and beat notes render, from the table players cannot reach")

        # The summary is prose, not a two-line teaser with an ellipsis.
        clamp = await page.evaluate("""() => {
            const el = document.querySelector('.campaign-card .prose');
            const s = getComputedStyle(el);
            return { clamp: s.webkitLineClamp, overflow: s.overflow };
        }""")
        assert clamp["clamp"] in ("none", "", None), clamp
        ok("the chapter summary is shown in full, not clamped to two lines")

        # ---------- 58. Editing chapters, beats and checks ----------
        async def menu_for(kind, ident):
            b = await page.locator(f'[data-kind="{kind}"][data-id="{ident}"]').first.bounding_box()
            await page.evaluate(TOUCH_HOLD_JS, {"x": b["x"] + 80, "y": b["y"] + 16, "ms": 700})
            await page.wait_for_selector(".card-menu", timeout=5000)
            labels = [t.strip() for t in await page.locator(".card-menu-item .label").all_inner_texts()]
            return labels

        labels = await menu_for("chapter", "st1")
        assert "Edit" in labels, labels
        await page.click('.card-menu-item .label:text-is("Edit")')
        await page.wait_for_selector("#mf-title", timeout=5000)
        assert await page.input_value("#mf-title") == "The Toll Keeper"
        # The body field is gone: that prose belongs to the DM note now.
        assert await page.locator("#mf-body").count() == 0, "chapters no longer carry a body column"
        await page.fill("#mf-title", "The Toll Keeper's Price")
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        saved = [w for w in writes if w["table"] == "chapters" and w["verb"] == "update"][-1]
        assert saved["payload"]["title"] == "The Toll Keeper's Price", saved
        assert "body" not in saved["payload"], saved
        ok("a chapter can be edited, and no longer writes a body column")

        labels = await menu_for("beat", "b1")
        assert "Edit" in labels, labels
        await page.click('.card-menu-item .label:text-is("Edit")')
        await page.wait_for_selector("#mf-read_aloud", timeout=5000)
        assert "Mist hangs" in await page.input_value("#mf-read_aloud")
        await page.click("#modal-close")
        await page.wait_for_timeout(300)
        ok("a beat can be edited")

        await page.click('.check-row button:has-text("Edit")')
        await page.wait_for_selector("#mf-success_text", timeout=5000)
        assert "spot the wire" in (await page.input_value("#mf-success_text")).lower()
        assert await page.input_value("#mf-dc") == "14"
        await page.fill("#mf-dc", "16")
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        edited = [w for w in writes if w["table"] == "campaign_checks" and w["verb"] == "update"][-1]
        assert edited["payload"]["dc"] == 16, edited
        assert edited["payload"]["success_text"], edited
        ok("a check can be edited, keeping its outcomes")

        # ---------- 59. The roster, and the way out on desktop ----------
        await page.click('.campaign-tabs button:has-text("Monsters")')
        await page.wait_for_timeout(400)
        body = await page.locator(".campaign-tab-body").inner_text()
        assert "not built yet" not in body, body
        ok("the monsters tab no longer claims the compendium does not exist")

        await page.click('.section-head:has-text("Roster") button:has-text("Add")')
        await page.wait_for_selector("#srd-lookup", timeout=5000)
        await page.fill("#srd-lookup", "gob")
        await page.wait_for_selector(".srd-hit", timeout=5000)
        await page.click('.srd-hit:has-text("Goblin")')
        await page.wait_for_timeout(600)
        assert await page.input_value("#mf-name") == "Goblin"
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        added = [w for w in writes if w["table"] == "campaign_monsters" and w["verb"] == "insert"][-1]
        assert added["payload"]["source"] == "srd_api", added
        assert added["payload"]["api_index"] == "goblin", added
        ok("a monster can be put on the roster from the campaign itself")

        # Logout and the switch back lived only in the mobile drawer, which is
        # hidden above the breakpoint -- a desktop had no way out.
        assert await page.locator("#sb-logout").is_visible()
        assert await page.locator("#sb-classic").is_visible()
        ok("the desktop sidebar carries logout and the switch to classic")

        # ---------- 60. Items in the compendium ----------
        await page.goto(f"{BASE}/v2/compendium.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".compendium-controls", timeout=10000)
        await page.click('.segmented button:has-text("Items")')
        await page.wait_for_timeout(600)
        await page.fill("#srd-search", "longsw")
        await page.wait_for_timeout(400)
        await page.click('.list-row:has-text("Longsword")')
        await page.wait_for_selector(".statblock", timeout=5000)
        detail = await page.locator(".statblock").inner_text()
        assert "1d8" in detail and "Slashing" in detail, detail
        ok("an item's stat block shows its damage")

        await page.click('button:has-text("Add to a character")')
        await page.wait_for_selector("#mf-character_id", timeout=5000)
        await page.evaluate("window.__resetWrites()")
        await page.click('.modal-actions button[type="submit"]')
        await page.wait_for_timeout(700)
        writes = await page.evaluate("window.__writes")
        item = [w for w in writes if w["table"] == "inventory_items" and w["verb"] == "insert"][-1]
        assert item["payload"]["name"] == "Longsword", item
        assert item["payload"]["item_type"] == "Weapon", item
        ok("an item from the compendium lands in a character's inventory")

        # ---------- 61. Selecting text must not close the dialog ----------
        # A click fires on the nearest common ancestor of where the press began
        # and where it ended. Select a number inside a dialog, drag past its
        # edge, let go -- the click lands on the backdrop, and a bare target
        # test threw the dialog away mid-edit.
        await page.goto(f"{BASE}/v2/campaign.html?id=cam1", wait_until="domcontentloaded")
        await page.wait_for_selector(".campaign-tabs", timeout=10000)
        await page.click('.campaign-tabs button:has-text("Chapters")')
        await page.wait_for_selector(".check-row", timeout=5000)
        await page.click('.check-row button:has-text("Edit")')
        await page.wait_for_selector("#mf-dc", timeout=5000)

        dc = await page.locator("#mf-dc").bounding_box()
        host = await page.locator("#modal-host").bounding_box()
        # Press on the DC field, drag out past the dialog, release on the
        # backdrop -- exactly the gesture that highlights a number.
        await page.mouse.move(dc["x"] + 6, dc["y"] + dc["height"] / 2)
        await page.mouse.down()
        await page.mouse.move(host["x"] + 12, dc["y"] + dc["height"] / 2, steps=12)
        await page.mouse.up()
        await page.wait_for_timeout(300)
        assert await page.locator("#modal-host").count() == 1, \
            "selecting text out of the dialog must not close it"
        ok("dragging a selection out of a dialog leaves it open")

        # A real press on the backdrop still dismisses, or there would be no
        # way to tap away from it.
        await page.mouse.move(host["x"] + 12, host["y"] + 12)
        await page.mouse.down()
        await page.mouse.up()
        await page.wait_for_timeout(300)
        assert await page.locator("#modal-host").count() == 0, "a backdrop press should still dismiss"
        ok("a press that starts and ends on the backdrop still dismisses")

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

        # ---------- 53. The invite to try v2 ----------
        # A device that has never chosen gets asked, once, on the classic
        # login. The router above proves an opted-in device never gets here.
        await page2.wait_for_selector("#v2-invite", timeout=5000)
        body = await page2.locator("#v2-invite .modal-content").inner_text()
        assert "TAPHOU5E V2.0 now available!" in body, body
        assert "nothing is copied" in body, body
        bullets = await page2.locator(".v2-invite-list li").count()
        assert bullets >= 4, bullets
        for word in ("Campaigns", "tracker", "sheet", "phone"):
            assert word in body, (word, body)
        ok(f"the prompt leads with the version and lists {bullets} things that are new")

        # Dismissing without the checkbox is "not now", not "never".
        await page2.click("#v2-invite-no")
        await page2.wait_for_timeout(300)
        assert await page2.locator("#v2-invite").count() == 0
        stored = await page2.evaluate("localStorage.getItem('taphou5e-invite')")
        assert stored and stored != "never", stored
        assert await page2.evaluate("localStorage.getItem('taphou5e-ui')") is None, \
            "dismissing must not count as choosing classic"
        ok("'Not now' records when we asked, and chooses nothing")

        await page2.reload(wait_until="domcontentloaded")
        await page2.wait_for_timeout(800)
        assert await page2.locator("#v2-invite").count() == 0, "it must not ask again straight away"
        ok("the prompt does not come back on the next load")

        # ...but it does after the snooze runs out.
        await page2.evaluate("""() => {
            const eightDays = Date.now() - 8 * 24 * 60 * 60 * 1000;
            localStorage.setItem('taphou5e-invite', String(eightDays));
        }""")
        await page2.reload(wait_until="domcontentloaded")
        await page2.wait_for_selector("#v2-invite", timeout=5000)
        ok("a week later it asks again")

        # The checkbox is the way to stop it for good.
        await page2.check("#v2-invite-never")
        await page2.click("#v2-invite-no")
        await page2.wait_for_timeout(300)
        assert await page2.evaluate("localStorage.getItem('taphou5e-invite')") == "never"
        await page2.reload(wait_until="domcontentloaded")
        await page2.wait_for_timeout(800)
        assert await page2.locator("#v2-invite").count() == 0
        ok("'don't show again' stops it permanently")

        # Taking the offer opts the device in, which is also what stops the
        # asking -- the router takes over from here.
        await page2.evaluate("localStorage.removeItem('taphou5e-invite')")
        await page2.reload(wait_until="domcontentloaded")
        await page2.wait_for_selector("#v2-invite", timeout=5000)
        await page2.click("#v2-invite-yes")
        await page2.wait_for_url("**/v2/**", timeout=10000)
        assert await page2.evaluate("localStorage.getItem('taphou5e-ui')") == "next"
        ok(f"'Try it' opts the device in and lands on {page2.url.split('8777')[-1]}")

        # And once opted in, the classic login is never reached to ask again.
        await page2.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
        await page2.wait_for_timeout(800)
        assert "/v2/" in page2.url, page2.url
        ok("an opted-in device is routed away before the prompt could appear")
        await ctx2.close()

        # ---------- 54. The invite on the classic home screen ----------
        # Someone already signed in never sees the login page, so the offer has
        # to reach them where they land.
        ctx3 = await browser.new_context()
        await ctx3.add_init_script(STUB)
        await ctx3.add_init_script("""
            try {
              localStorage.setItem('dnd-session', JSON.stringify({
                gameWorldId: 'w1', gameWorldName: 'Thornfell Reach',
                role: 'dm', timestamp: Date.now() }));
            } catch (e) {}
        """)
        page3 = await ctx3.new_page()
        watch(page3, "classic-home")
        await page3.goto(f"{BASE}/characters.html", wait_until="domcontentloaded")
        await page3.wait_for_selector("#v2-invite", timeout=10000)
        assert not await page3.locator("#home-page").evaluate("el => el.classList.contains('hidden')"), \
            "the prompt must wait for the home screen"
        ok("an already-signed-in device is asked on the classic home screen")

        # ---------- 54b. The deliberate switches ----------
        # Someone who dismissed the prompt, or ticked the box, still needs a
        # way across. The sidebar carries one; so does the login page.
        # Signed in, and the prompt already turned off -- so the switch is the
        # only way across, which is the whole reason it exists.
        ctx5 = await browser.new_context()
        await ctx5.add_init_script(STUB)
        await ctx5.add_init_script("""
            try {
              localStorage.setItem('dnd-session', JSON.stringify({
                gameWorldId: 'w1', gameWorldName: 'Thornfell Reach',
                role: 'dm', timestamp: Date.now() }));
              localStorage.setItem('taphou5e-invite', 'never');
            } catch (e) {}
        """)
        page5 = await ctx5.new_page()
        watch(page5, "classic-switch")
        await page5.goto(f"{BASE}/characters.html", wait_until="domcontentloaded")
        await page5.wait_for_selector("#sm-try-v2", timeout=10000)
        assert await page5.locator("#v2-invite").count() == 0, "the prompt was turned off"
        label = (await page5.locator("#sm-try-v2").inner_text()).strip()
        assert "V2" in label, label
        ok(f"the classic sidebar carries a switch ({label!r})")

        # The drawer slides in on a transform, so the item is in the DOM but
        # not clickable until the hamburger opens it.
        await page5.click("#menu-btn")
        await page5.wait_for_selector("#side-menu-overlay.open", timeout=5000)
        await page5.click("#sm-try-v2")
        await page5.wait_for_url("**/v2/**", timeout=10000)
        assert await page5.evaluate("localStorage.getItem('taphou5e-ui')") == "next"
        ok("the sidebar switch opts in even after the prompt was turned off")
        await ctx5.close()

        ctx6 = await browser.new_context()
        await ctx6.add_init_script(STUB)
        await ctx6.add_init_script("""
            try { localStorage.setItem('taphou5e-invite', 'never'); } catch (e) {}
        """)
        page6 = await ctx6.new_page()
        watch(page6, "classic-login-switch")
        await page6.goto(f"{BASE}/index.html", wait_until="domcontentloaded")
        await page6.wait_for_selector("#try-v2-btn", timeout=10000)
        assert await page6.locator("#v2-invite").count() == 0, "the prompt was turned off"
        ok("the classic login shows the switch even with the prompt turned off")

        await page6.click("#try-v2-btn")
        await page6.wait_for_url("**/v2/**", timeout=10000)
        assert await page6.evaluate("localStorage.getItem('taphou5e-ui')") == "next"
        ok("the login button opts in and crosses over")
        await ctx6.close()

        # ---------- 54c. The logo ----------
        ctx7 = await browser.new_context()
        await ctx7.add_init_script(STUB)
        page7 = await ctx7.new_page()
        watch(page7, "logo")
        await page7.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page7.wait_for_selector(".login-logo", timeout=5000)

        # A broken <img> still has a box, so assert the bitmap actually decoded.
        loaded = await page7.evaluate("""() => {
            const img = document.querySelector('.login-logo');
            return { done: img.complete, w: img.naturalWidth, h: img.naturalHeight };
        }""")
        assert loaded["done"] and loaded["w"] > 0, loaded
        ok(f"the login screen shows the logo ({loaded['w']}x{loaded['h']})")

        # The watermark is a pseudo-element on body, so it survives renderShell
        # replacing the body's contents on every draw.
        await page7.fill("#world-name", "Thornfell Reach")
        await fill_pin(page7, "join", "1379")
        await page7.click("#join-form .btn-submit")
        await page7.wait_for_selector(".party-roster", timeout=10000)
        # The mark rides beside the wordmark in the drawer, and nothing is
        # painted behind the page.
        await page7.wait_for_selector(".brand-logo", timeout=5000)
        brand = await page7.evaluate("""() => {
            const img = document.querySelector('.brand-logo');
            const wordmark = img.closest('.brand');
            return { w: img.naturalWidth,
                     text: wordmark.textContent.trim(),
                     first: wordmark.firstElementChild === img };
        }""")
        assert brand["w"] > 0, brand
        assert brand["text"] == "TAPHOU5E", brand
        assert brand["first"], "the mark goes before the title"
        ok("the sidebar wordmark is preceded by the logo")

        clean = await page7.evaluate("""() => {
            const shell = getComputedStyle(document.querySelector('.app-shell'));
            const body = getComputedStyle(document.body, '::before');
            return { shell: shell.backgroundImage, body: body.backgroundImage };
        }""")
        assert "taphou5e" not in clean["shell"], clean
        assert "taphou5e" not in clean["body"], clean
        ok("no page carries a background image behind it")
        await ctx7.close()

        # Without a session the character page redirects to the login, so the
        # prompt must not fire over that.
        ctx4 = await browser.new_context()
        await ctx4.add_init_script(STUB)
        page4 = await ctx4.new_page()
        watch(page4, "classic-nosession")
        await page4.goto(f"{BASE}/characters.html", wait_until="domcontentloaded")
        await page4.wait_for_timeout(1200)
        assert page4.url.endswith("index.html"), page4.url
        ok("with no session the character page still just redirects to the login")
        await ctx4.close()
        await ctx3.close()

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
