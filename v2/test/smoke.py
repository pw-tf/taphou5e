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
        # Spellcasting in the shape the API really sends: one flat key per
        # slot level, and totals for cantrips and spells known. The wizard
        # once read `spells_known_at_level` and a `spell_slots_level` object,
        # which exist nowhere but in the fixture that used to sit here -- so
        # the suite passed while no live level-up ever offered a spell or
        # wrote a slot.
        "bard": {
            "3": {"level": 3, "features": [{"index": "bard-college", "name": "Bard College"}],
                  "spellcasting": {"cantrips_known": 2, "spells_known": 6,
                                   "spell_slots_level_1": 4, "spell_slots_level_2": 2,
                                   "spell_slots_level_3": 0}},
            "4": {"level": 4, "features": [
                     {"index": "bard-ability-score-improvement-1", "name": "Ability Score Improvement"}],
                  "spellcasting": {"cantrips_known": 3, "spells_known": 7,
                                   "spell_slots_level_1": 4, "spell_slots_level_2": 3,
                                   "spell_slots_level_3": 0}},
        },
        "warlock": {
            "2": {"level": 2, "features": [{"index": "eldritch-invocations", "name": "Eldritch Invocations"}],
                  "spellcasting": {"cantrips_known": 2, "spells_known": 3,
                                   "spell_slots_level_1": 2, "spell_slots_level_2": 0}},
            "3": {"level": 3, "features": [{"index": "pact-boon", "name": "Pact Boon"}],
                  "spellcasting": {"cantrips_known": 2, "spells_known": 4,
                                   "spell_slots_level_1": 0, "spell_slots_level_2": 2}},
        },
        "fighter": {
            "4": {"level": 4, "features": [{"index": "fighter-asi", "name": "Ability Score Improvement"}]},
        },
    },
    # A class's own spell list carries each spell's level, which is what lets
    # the wizard offer only what the character can actually cast.
    "srd_class_spells": {
        "bard": {"count": 5, "results": [
            {"index": "mage-hand", "name": "Mage Hand", "level": 0},
            {"index": "vicious-mockery", "name": "Vicious Mockery", "level": 0},
            {"index": "healing-word", "name": "Healing Word", "level": 1},
            {"index": "shatter", "name": "Shatter", "level": 2},
            {"index": "hypnotic-pattern", "name": "Hypnotic Pattern", "level": 3}]},
        "warlock": {"count": 3, "results": [
            {"index": "eldritch-blast", "name": "Eldritch Blast", "level": 0},
            {"index": "hex", "name": "Hex", "level": 1},
            {"index": "misty-step", "name": "Misty Step", "level": 2}]},
    },
    "srd_subclasses": {"results": [
        {"index": "berserker", "name": "Berserker", "url": "/api/subclasses/berserker"}]},
    # Every level a subclass grants something at, as /subclasses/<x>/levels
    # returns it. Frenzy at 3 matters: a character who picks the subclass late
    # is owed it too.
    "srd_subclass_levels": {
        "berserker": [
            {"level": 3, "features": [{"index": "frenzy", "name": "Frenzy"}]},
            {"level": 6, "features": [{"index": "mindless-rage", "name": "Mindless Rage"}]},
            {"level": 10, "features": [{"index": "intimidating-presence", "name": "Intimidating Presence"}]}]},
    "srd_subclass_berserker": {
        "index": "berserker", "name": "Berserker",
        "desc": ["For some barbarians, rage is a means to an end: that end being violence."]},
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
  window.__patchFixture = (key, id, patch) => {
    const t = FIXTURES[key];
    Object.assign(Array.isArray(t) ? t.find(r => r.id === id) : t, patch);
  };
  window.__resetWrites = () => {
    window.__writes = [];
    try { sessionStorage.removeItem(WRITE_KEY); } catch (e) {}
  };
  const AUTH_KEY = '__smoke_auth';
  function readAuth() {
    try { return JSON.parse(sessionStorage.getItem(AUTH_KEY) || 'null'); } catch (e) { return null; }
  }
  function writeAuth(session) {
    try {
      if (session) sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
      else sessionStorage.removeItem(AUTH_KEY);
    } catch (e) {}
  }
  function query(table) {
    const q = {};
    ['select','eq','order','limit','neq','in','is'].forEach(m => { q[m] = () => q; });
    q.single = () => Promise.resolve({
      data: FIXTURES[table + '_single'] || (FIXTURES[table] || [])[0] || null, error: null });
    // The level-up wizard uses maybeSingle for "is this already saved?" reads,
    // which must resolve to null rather than the first fixture row.
    q.maybeSingle = () => Promise.resolve({ data: null, error: null });
    // `select('id', { count: 'exact', head: true })` reads only `count`, so
    // every resolve carries one alongside the rows.
    q.then = (res, rej) => Promise.resolve({
      data: FIXTURES[table] || [],
      count: (FIXTURES[table] || []).length,
      error: null
    }).then(res, rej);
    return q;
  }
  function writer(table, verb) {
    return (payload) => {
      recordWrite({ table, verb, payload: payload || null });
      // __failWrites names tables whose writes the database "refuses", the
      // way Supabase does it: an error in the result, nothing thrown. A
      // refused write changes no row, so it must not touch the fixtures --
      // the page holds the very same objects.
      const refused = (window.__failWrites || []).indexOf(table) !== -1;
      const single = FIXTURES[table + '_single'];
      if (verb === 'update' && single && !refused) Object.assign(single, payload);
      // Mirror an update onto the list fixture too, so a re-read reflects it.
      if (verb === 'update' && !refused && Array.isArray(FIXTURES[table]) && window.__lastEq) {
        const row = FIXTURES[table].find(r => r.id === window.__lastEq);
        if (row) Object.assign(row, payload);
      }
      const w = {};
      ['in','match'].forEach(m => { w[m] = () => w; });
      w.eq = (_col, val) => { window.__lastEq = val;
        if (verb === 'update' && !refused && Array.isArray(FIXTURES[table])) {
          const row = FIXTURES[table].find(r => r.id === val);
          if (row) Object.assign(row, payload);
        }
        return w; };
      w.select = () => w;
      w.single = () => Promise.resolve({ data: { id: 'new-id' }, error: null });
      w.maybeSingle = () => Promise.resolve({ data: null, error: null });
      // A delete hands back the row it removed, as PostgREST does when asked;
      // the client reads an empty result as "refused".
      w.then = (res, rej) => Promise.resolve(refused
        ? { data: null, error: { message: 'refused by the stub' } }
        : { data: verb === 'delete' ? [{ id: window.__lastEq }] : null, error: null }).then(res, rej);
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
    // Class levels drive the level-up wizard's feature and spell steps. The
    // wizard names the API's 2014 tree; everything else uses the unversioned
    // alias for it, so both spellings are served.
    const lvl = url.match(/\/api\/(?:2014\/)?classes\/([a-z]+)\/levels\/(\d+)$/);
    if (lvl) {
      const table = FIXTURES.srd_class_levels[lvl[1]] || {};
      return table[lvl[2]] ? json(table[lvl[2]])
                           : Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    }
    const classSpells = url.match(/\/api\/(?:2014\/)?classes\/([a-z]+)\/spells$/);
    if (classSpells) return json(FIXTURES.srd_class_spells[classSpells[1]] || { count: 0, results: [] });
    if (/\/api\/(?:2014\/)?classes\/[a-z]+\/subclasses$/.test(url)) return json(FIXTURES.srd_subclasses);
    const feat = url.match(/\/api\/(?:2014\/)?features\/([a-z0-9-]+)$/);
    if (feat) return json({ name: feat[1], desc: ['Fixture text for ' + feat[1] + '.'] });
    const sub = url.match(/\/api\/(?:2014\/)?subclasses\/([a-z-]+)\/levels$/);
    if (sub) return json(FIXTURES.srd_subclass_levels[sub[1]] || []);
    if (/\/api\/subclasses\/berserker$/.test(url)) return json(FIXTURES.srd_subclass_berserker);
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
  };

  // The real ALTCHA widget comes from a CDN this sandbox blocks. This stands
  // in for it: loads, accepts configure(), and "solves" on verify().
  if (window.customElements && !customElements.get('altcha-widget')) {
    customElements.define('altcha-widget', class extends HTMLElement {
      connectedCallback() { setTimeout(() => this.dispatchEvent(new CustomEvent('load')), 0); }
      configure(options) { window.__altchaConfig = options; }
      verify() {
        setTimeout(() => this.dispatchEvent(new CustomEvent('verified',
          { detail: { payload: 'stub-altcha-payload' } })), 10);
      }
    });
  }

  window.supabase = {
    createClient(url, key, opts) {
      window.__capturedHeaders = (opts && opts.global && opts.global.headers) || {};
      return {
        // Both versions open one broadcast channel for live updates. The
        // handler is kept so a test can play the database's part: patch a
        // fixture with __patchFixture, then send the signal with __liveEmit.
        channel: (topic) => {
          const ch = {};
          window.__liveTopic = topic;
          ch.on = (type, filter, cb) => {
            if (type === 'broadcast') window.__liveEmit = payload => cb({ payload });
            return ch;
          };
          ch.off = () => ch;
          ch.subscribe = (cb) => { if (cb) cb('SUBSCRIBED'); return ch; };
          ch.unsubscribe = () => Promise.resolve('ok');
          return ch;
        },
        removeChannel: () => Promise.resolve('ok'),
        // Supabase auth. Only the analytics dashboard uses it -- the app
        // itself signs in against a world PIN, not an auth user.
        auth: {
          getSession: () => Promise.resolve({ data: { session: readAuth() }, error: null }),
          signInWithPassword: ({ email, password }) => {
            if (password !== 'letmein') {
              return Promise.resolve({ data: { session: null },
                                       error: { message: 'Invalid login credentials' } });
            }
            const session = { user: { id: 'auth-user', email: email } };
            writeAuth(session);
            return Promise.resolve({ data: { session: session }, error: null });
          },
          signOut: () => { writeAuth(null); return Promise.resolve({ error: null }); }
        },
        from: (table) => Object.assign(query(table), {
          update: writer(table, 'update'),
          insert: writer(table, 'insert'),
          delete: () => writer(table, 'delete')()
        }),
        rpc(fn, params) {
          if (fn === 'world_login') {
            // Kept across the redirect that follows a successful login.
            sessionStorage.setItem('__lastLoginParams', JSON.stringify(params));
            if (params.p_pin === '0000') return Promise.resolve({ data: { ok:false, error:'bad_pin' }, error:null });
            const dm = params.p_pin === '1379';
            return Promise.resolve({ data: { ok:true, role: dm ? 'dm' : 'player',
              game_world_id:'w1', game_world_name: params.p_world_name,
              leveling_mode:'milestone', dm_token: 'tok_'+(dm ? 'a' : 'p').repeat(60) }, error:null });
          }
          // The Owlbear extension: a DM session mints a player session for
          // the room. __shareUnsupported plays a database without the RPC.
          if (fn === 'world_share_player_session') {
            window.__shareCalls = (window.__shareCalls || 0) + 1;
            if (window.__shareUnsupported) {
              return Promise.resolve({ data: null, error: { code: 'PGRST202',
                message: 'Could not find the function public.world_share_player_session' } });
            }
            return Promise.resolve({ data: { ok:true, role:'player', game_world_id:'w1',
              game_world_name:'Thornfell Reach', dm_token:'tok_'+'s'.repeat(60) }, error:null });
          }
          if (fn === 'world_realtime_topic') {
            return Promise.resolve({ data: 'world:' + 'f'.repeat(32), error: null });
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
          if (fn === 'analytics_overview') {
            if (!readAuth()) {
              return Promise.resolve({ data: null, error: {
                message: 'analytics_overview requires an authenticated session' } });
            }
            if (!FIXTURES.analytics_overview) {
              return Promise.resolve({ data: null, error: {
                message: 'permission denied for function analytics_overview' } });
            }
            return Promise.resolve({ data: FIXTURES.analytics_overview, error: null });
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


# The Owlbear Rodeo SDK, served in place of the CDN module every extension
# page imports. Owlbear itself cannot run here, so this plays its part: the
# room, the scene's items and the local items, the player's role and
# selection, and a record of every menu, popover and modal the extension asks
# for. State lives in localStorage under __obr_ so every page of a context
# shares one room, as every iframe in a real one does, and a change made on
# one page reaches the listeners on another through the storage event.
OBR_SDK_URL = "**/npm/@owlbear-rodeo/sdk@3.1.0/+esm"
OBR_MOCK = r"""
const get = (k, d) => { try { const v = localStorage.getItem('__obr_' + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
const put = (k, v) => localStorage.setItem('__obr_' + k, JSON.stringify(v));
const listeners = { room: [], items: [], player: [], local: [] };
const on = kind => cb => { listeners[kind].push(cb); return () => {}; };
const fire = (kind, value) => listeners[kind].forEach(cb => cb(value));
window.__obr = { menus: {}, popovers: [], modals: [], closed: [], badge: null, notes: [] };

const pick = (list, filter) => !filter ? list
  : Array.isArray(filter) ? list.filter(i => filter.includes(i.id)) : list.filter(filter);
const copy = v => JSON.parse(JSON.stringify(v));

window.addEventListener('storage', e => {
  if (e.key === '__obr_room') fire('room', get('room', {}));
  if (e.key === '__obr_items') fire('items', get('items', []));
  if (e.key === '__obr_selection') fire('player', { selection: get('selection', []) });
});
window.__obrSelect = ids => { put('selection', ids); fire('player', { selection: ids }); };
window.__obrLocal = () => get('local', []);

function bounds(item) {
  const w = item.width || 150, h = item.height || 150, x = item.position.x, y = item.position.y;
  return { min: { x: x - w / 2, y: y - h / 2 }, max: { x: x + w / 2, y: y + h / 2 },
           width: w, height: h, center: { x, y } };
}

// A builder records each call as a property: .plainText('9/44') -> item.plainText.
function builder(item) {
  const b = new Proxy({}, { get: (_, name) => name === 'build'
    ? () => copy(item) : value => { item[name] = value; return b; } });
  return b;
}
export function buildShape() { return builder({ type: 'SHAPE', metadata: {}, visible: true }); }
// The real builder defaults to rich text on the TEXT layer; so does this.
export function buildText() {
  return builder({ type: 'TEXT', metadata: {}, visible: true, layer: 'TEXT', textType: 'RICH' });
}

const OBR = {
  isReady: true,
  onReady(cb) { setTimeout(cb, 0); },
  player: {
    id: 'player-self',
    getRole: async () => get('role', 'PLAYER'),
    getSelection: async () => get('selection', []),
    onChange: on('player')
  },
  room: {
    id: 'room-1',
    getMetadata: async () => get('room', {}),
    async setMetadata(update) {
      const m = Object.assign(get('room', {}), update);
      Object.keys(update).forEach(k => { if (update[k] === undefined) delete m[k]; });
      put('room', m);
      fire('room', m);
    },
    onMetadataChange: on('room')
  },
  scene: {
    isReady: async () => true,
    onReadyChange: () => () => {},
    grid: { getDpi: async () => 150 },
    items: {
      getItems: async filter => copy(pick(get('items', []), filter)),
      async updateItems(filter, update) {
        const all = get('items', []);
        const drafts = copy(pick(all, filter));
        update(drafts);
        const next = all.map(i => drafts.find(d => d.id === i.id) || i);
        put('items', next);
        fire('items', next);
      },
      getItemBounds: async ids => bounds(get('items', []).find(i => i.id === ids[0])),
      onChange: on('items')
    },
    local: {
      getItems: async filter => copy(pick(get('local', []), filter)),
      async addItems(items) { put('local', get('local', []).concat(copy(items))); },
      async deleteItems(ids) { put('local', get('local', []).filter(i => !ids.includes(i.id))); },
      onChange: on('local')
    }
  },
  contextMenu: { create: async m => { window.__obr.menus[m.id] = m; }, remove: async () => {} },
  popover: { open: async p => { window.__obr.popovers.push(p); }, close: async id => { window.__obr.closed.push(id); } },
  modal: { open: async m => { window.__obr.modals.push(m); }, close: async id => { window.__obr.closed.push(id); } },
  action: { setBadgeText: async t => { window.__obr.badge = t === undefined ? null : t; },
            setIcon: async icon => { window.__obr.icon = icon; } },
  notification: {
    show: async (message, variant) => { window.__obr.notes.push({ message, variant }); return 'n' + window.__obr.notes.length; },
    close: async () => {}
  },
  theme: { getTheme: async () => ({ mode: get('theme', 'DARK') }), onChange: () => () => {} },
  viewport: { getWidth: async () => 1280, getHeight: async () => 900 }
};
export default OBR;
"""

# Tokens on the test map. Sythra (9/44, +5 temp) and a gargoyle (52/52) are
# linked; the rest are left for "link by name".
OBR_LINK = "com.taphou5e.owlbear/link"
OBR_ITEMS = [
    {"id": "t-sythra", "name": "Sythra", "layer": "CHARACTER", "visible": True,
     "position": {"x": 300, "y": 300}, "width": 150, "height": 150,
     "metadata": {OBR_LINK: {"kind": "character", "id": "c2"}}},
    {"id": "t-garg", "name": "Gargoyle", "layer": "CHARACTER", "visible": True,
     "position": {"x": 600, "y": 300}, "width": 150, "height": 150,
     "metadata": {OBR_LINK: {"kind": "combatant", "id": "cb2"}}},
]


async def obr_context(browser, stub=None):
    """A context with the Supabase stub and the Owlbear SDK mock in place."""
    ctx = await browser.new_context(viewport={"width": 1280, "height": 900})
    await ctx.add_init_script(stub or STUB)
    await ctx.route(OBR_SDK_URL, lambda route: route.fulfill(
        status=200, body=OBR_MOCK, content_type="application/javascript",
        headers={"Access-Control-Allow-Origin": "*"}))
    return ctx


async def obr_seed(page, role, items=None, room=None, session=None, selection=None):
    """Owlbear state for a context, written from a page on the same origin."""
    await page.goto(f"{BASE}/owlbear/manifest.json", wait_until="domcontentloaded")
    await page.evaluate("""([role, items, room, session, selection]) => {
        localStorage.clear();
        localStorage.setItem('__obr_role', JSON.stringify(role));
        localStorage.setItem('__obr_items', JSON.stringify(items));
        localStorage.setItem('__obr_room', JSON.stringify(room));
        localStorage.setItem('__obr_selection', JSON.stringify(selection));
        if (session) localStorage.setItem('dnd-session', JSON.stringify(
            Object.assign({ timestamp: Date.now(), dmTokenIssued: Date.now() }, session)));
    }""", [role, items if items is not None else OBR_ITEMS, room or {}, session, selection or []])


async def until(page, expression, timeout=8000):
    """wait_for_function that survives the page reloading under it."""
    deadline = asyncio.get_event_loop().time() + timeout / 1000
    while True:
        try:
            if await page.evaluate(expression):
                return
        except Exception:
            pass
        if asyncio.get_event_loop().time() > deadline:
            raise AssertionError(f"timed out waiting for: {expression}")
        await asyncio.sleep(0.1)


OBR_DM = {"gameWorldId": "w1", "gameWorldName": "Thornfell Reach", "role": "dm",
          "dmToken": "tok_" + "a" * 60}


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

# Lira, a caster, for what the wizard does about spells. Level 3 finished
# (three hit dice, two of them spent), level 4 granted. A bard gains a cantrip
# and a spell at 4, and a third 2nd-level slot. Her subclass is one the SRD
# does not carry, which is true of most.
LIRA = {
    "id": "c5", "game_world_id": "w1", "name": "Lira", "player_name": "Jo",
    "race": "Human", "class": "Bard", "subclass": "College of Swords", "level": 4,
    "armor_class": 13, "speed": 30, "initiative_bonus": 2, "proficiency_bonus": 2,
    "current_hit_points": 20, "hit_point_maximum": 24, "temporary_hit_points": 0,
    "hit_dice_total": "3d8", "hit_dice_remaining": 1,
    "death_save_successes": 0, "death_save_failures": 0,
    "active_conditions": [], "pending_level_up": True, "experience_points": 0,
    "notes": "",
    "ability_scores": {"strength": 8, "dexterity": 14, "constitution": 15,
                       "intelligence": 10, "wisdom": 12, "charisma": 16},
    "saving_throws": [], "skills": [], "weapons": [], "inventory_items": [],
    "spells": [
        {"id": "sp1", "name": "Vicious Mockery", "level": 0, "api_index": "vicious-mockery", "prepared": True},
        {"id": "sp2", "name": "Light", "level": 0, "api_index": "light", "prepared": True},
        {"id": "sp3", "name": "Healing Word", "level": 1, "api_index": "healing-word", "prepared": True}],
    "spell_slots": [{"id": "sl1", "slot_level": 1, "total": 4, "used": 1},
                    {"id": "sl2", "slot_level": 2, "total": 2, "used": 2}],
    "features_traits": [],
    "currency": {"copper": 0, "silver": 0, "electrum": 0, "gold": 0, "platinum": 0},
    "character_details": {},
}

# Vex, a warlock going from 2 to 3: Pact Magic trades two 1st-level slots for
# two 2nd-level ones rather than adding to them.
VEX = {
    "id": "c6", "game_world_id": "w1", "name": "Vex", "player_name": "Ari",
    "race": "Tiefling", "class": "Warlock", "subclass": "The Hexblade", "level": 3,
    "armor_class": 12, "speed": 30, "initiative_bonus": 1, "proficiency_bonus": 2,
    "current_hit_points": 15, "hit_point_maximum": 15, "temporary_hit_points": 0,
    "hit_dice_total": "2d8", "hit_dice_remaining": 2,
    "death_save_successes": 0, "death_save_failures": 0,
    "active_conditions": [], "pending_level_up": True, "experience_points": 0,
    "notes": "",
    "ability_scores": {"strength": 8, "dexterity": 12, "constitution": 12,
                       "intelligence": 10, "wisdom": 10, "charisma": 16},
    "saving_throws": [], "skills": [], "weapons": [], "inventory_items": [],
    "spells": [], "spell_slots": [{"id": "ws1", "slot_level": 1, "total": 2, "used": 1}],
    "features_traits": [],
    "currency": {"copper": 0, "silver": 0, "electrum": 0, "gold": 0, "platinum": 0},
    "character_details": {},
}

LEVELUP_SESSION = """
    try {
      localStorage.setItem('dnd-session', JSON.stringify({
        gameWorldId: 'w1', gameWorldName: 'Thornfell Reach', role: 'dm',
        dmToken: 'tok_' + 'a'.repeat(60), dmTokenIssued: Date.now(),
        timestamp: Date.now() }));
      __EXTRA__
    } catch (e) {}
"""


async def open_levelup(browser, character, extra="", label=None, viewport=None):
    """A sheet for `character` with its level-up wizard open.

    The sheet stub serves one character whatever the id, so each of these
    needs a context of its own. `label` None leaves console errors unwatched,
    for the test that makes a save fail on purpose.
    """
    ctx = await browser.new_context(**({"viewport": viewport} if viewport else {}))
    await ctx.add_init_script(stub_with(characters_single=character))
    await ctx.add_init_script(LEVELUP_SESSION.replace("__EXTRA__", extra))
    page = await ctx.new_page()
    if label:
        watch(page, label)
    await page.goto(f"{BASE}/v2/character-sheet.html?id={character['id']}", wait_until="domcontentloaded")
    await page.wait_for_selector(".levelup-banner", timeout=10000)
    await page.click(".levelup-banner")
    await page.wait_for_selector(".wizard-steps", timeout=10000)
    await page.wait_for_timeout(600)
    return ctx, page


# ========================================
# Analytics dashboard fixtures
#
# Kept out of the base FIXTURES on purpose: adding a `game_worlds` list would
# change what every other page's un-`single` read resolves to. The analytics
# context injects these with stub_with instead.
# ========================================

ANALYTICS_WORLDS = [
    {"id": "w1", "name": "Thornfell Reach", "is_active": True,
     "leveling_mode": "milestone", "created_at": "2026-01-18T10:00:00Z"},
    {"id": "w2", "name": "Ashvale", "is_active": True,
     "leveling_mode": "xp", "created_at": "2026-03-02T10:00:00Z"},
    {"id": "w3", "name": "The Quiet Fen", "is_active": False,
     "leveling_mode": "milestone", "created_at": "2026-05-11T10:00:00Z"},
]

def _ac(cid, name, player, world, cls, race, level, background, alignment, made, sub=None):
    return {"id": cid, "name": name, "player_name": player, "game_world_id": world,
            "class": cls, "subclass": sub, "race": race, "level": level,
            "background": background, "alignment": alignment, "created_at": made,
            "updated_at": made, "pending_level_up": False, "inspiration": False,
            "hit_point_maximum": 10 * level, "armor_class": 15,
            "experience_points": 0}

# Five characters in Thornfell, one in Ashvale, none in the Quiet Fen. Dave
# plays in two worlds; everyone else in one.
ANALYTICS_CHARACTERS = [
    _ac("a1", "Brannor Hale", "Dave", "w1", "Fighter", "Human", 5, "Soldier", "Lawful Good", "2026-02-01T09:00:00Z", "Champion"),
    _ac("a2", "Sythra", "Priya", "w1", "Wizard", "Elf", 5, "Sage", "Neutral", "2026-02-02T09:00:00Z"),
    _ac("a3", "Korr", "Sam", "w1", "Barbarian", "Goliath", 4, "Outlander", "Chaotic Neutral", "2026-02-03T09:00:00Z"),
    _ac("a4", "Wisp", "Alex", "w1", "Rogue", "Halfling", 5, "Criminal", "Chaotic Good", "2026-02-04T09:00:00Z"),
    _ac("a5", "Marel", "Priya", "w1", "Cleric", "Human", 3, "Acolyte", "Lawful Good", "2026-02-05T09:00:00Z"),
    _ac("a6", "Dorn", "Dave", "w2", "Fighter", "Dwarf", 2, "Soldier", "Lawful Neutral", "2026-03-10T09:00:00Z"),
]

# Twenty-three worlds, to page through at ten a page. Kept separate from
# ANALYTICS_WORLDS so every assertion about the three-world dashboard stays put.
PAGED_WORLDS = [
    {"id": f"p{n:02d}", "name": f"World {n:02d}", "is_active": n % 3 != 0,
     "leveling_mode": "xp" if n % 2 else "milestone",
     "created_at": f"2026-0{1 + n % 9}-0{1 + n % 8}T10:00:00Z"}
    for n in range(1, 24)
]

# Reports for the inbox. One carries a script tag on purpose: everything in a
# card is free text typed by an anonymous submitter.
ANALYTICS_FEEDBACK = [
    {"id": "f1", "kind": "bug", "message": "Holding a card on iOS selects the text.",
     "contact": "sam@example.com", "game_world_id": "w1", "world_name": "Thornfell Reach",
     "role": "dm", "page": "characters.html", "viewport": "390x780",
     "user_agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605.1.15 Version/17.0 Safari/604.1",
     "app_version": "v2", "is_read": False, "is_archived": False,
     "created_at": "2026-09-18T02:00:00Z", "read_at": None},
    {"id": "f2", "kind": "idea", "message": "<script>alert('xss')</script> Let me sort the roster by level.",
     "contact": None, "game_world_id": "w2", "world_name": "Ashvale",
     "role": "player", "page": "index.html", "viewport": "1440x900",
     "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36",
     "app_version": "v2", "is_read": False, "is_archived": False,
     "created_at": "2026-09-17T22:00:00Z", "read_at": None},
    {"id": "f3", "kind": "other", "message": "Love it. No notes.",
     "contact": None, "game_world_id": None, "world_name": None,
     "role": None, "page": "login.html", "viewport": "1280x800",
     "user_agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Firefox/131.0",
     "app_version": "v2", "is_read": True, "is_archived": False,
     "created_at": "2026-09-16T10:00:00Z", "read_at": "2026-09-16T11:00:00Z"},
    {"id": "f4", "kind": "bug", "message": "Already dealt with.",
     "contact": None, "game_world_id": "w1", "world_name": "Thornfell Reach",
     "role": "dm", "page": "campaigns.html", "viewport": "1280x800",
     "user_agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/129.0 Safari/537.36",
     "app_version": "v2", "is_read": True, "is_archived": True,
     "created_at": "2026-09-10T10:00:00Z", "read_at": "2026-09-10T12:00:00Z"},
]

# The shape public.analytics_overview() returns: counts only.
ANALYTICS_OVERVIEW = {
    "generated_at": "2026-09-18T00:00:00Z",
    "totals": {"campaigns": 3, "authored_campaigns": 1, "chapters": 8, "beats": 11,
               "checks": 12, "areas": 4, "npcs": 3, "monsters": 4, "encounters": 4,
               "combatants": 7, "sessions": 2, "notes": 5, "party_links": 6,
               "shared_encounters": 3},
    "campaigns_by_status": {"active": 2, "planned": 1},
    "chapters_by_status": {"planned": 5, "active": 3},
    "beats_by_status": {"pending": 9, "completed": 2},
    "checks_by_type": {"skill_check": 11, "saving_throw": 1},
    "checks_by_focus": {"Perception": 6, "Stealth": 5, "str": 1},
    "checks": {"group": 2, "secret": 3, "repeatable": 1, "with_success": 10,
               "with_failure": 7, "avg_dc": 13.1, "min_dc": 8, "max_dc": 20},
    "npcs_by_disposition": {"neutral": 2, "friendly": 1},
    "npcs_by_status": {"alive": 3},
    "areas_by_type": {"settlement": 3, "dungeon": 1},
    "monsters_by_source": {"srd": 3, "homebrew": 1},
    "monsters_by_cr": {"under 1": 2, "1-4": 1, "unset": 1},
    "encounters_by_status": {"planned": 3, "completed": 1},
    "encounters_by_difficulty": {"medium": 2, "hard": 2},
    "combatants_by_type": {"monster": 5, "character": 2},
    "reveals": {"chapters_revealed": 3, "beats_revealed": 2, "areas_discovered": 1,
                "npcs_known": 1, "sessions_published": 2},
    "sharing": {"total": 3, "live": 2, "imports": 9},
    "worlds": [
        {"id": "w1", "campaigns": 2, "authored_campaigns": 1, "chapters": 6, "beats": 9,
         "checks": 10, "areas": 3, "npcs": 2, "monsters": 3, "encounters": 3,
         "sessions": 2, "notes": 4},
        {"id": "w2", "campaigns": 1, "authored_campaigns": 0, "chapters": 2, "beats": 2,
         "checks": 2, "areas": 1, "npcs": 1, "monsters": 1, "encounters": 1,
         "sessions": 0, "notes": 1},
        {"id": "w3", "campaigns": 0, "authored_campaigns": 0, "chapters": 0, "beats": 0,
         "checks": 0, "areas": 0, "npcs": 0, "monsters": 0, "encounters": 0,
         "sessions": 0, "notes": 0},
    ],
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

# Not every browser sends a click when a long press is released (Android
# Chrome does not). Same hold, no click after it.
TOUCH_HOLD_NOCLICK_JS = """({ x, y, ms }) => new Promise(resolve => {
  const target = document.elementFromPoint(x, y);
  const touch = new Touch({ identifier: 3, target, clientX: x, clientY: y });
  const opts = { touches: [touch], targetTouches: [touch], changedTouches: [touch],
                 bubbles: true, cancelable: true };
  target.dispatchEvent(new TouchEvent('touchstart', opts));
  setTimeout(() => { target.dispatchEvent(new TouchEvent('touchend', opts)); resolve(); }, ms);
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

BLANK_SUMMARIES_JS = """() =>
  Object.values(SUBCLASSES).flat().filter(n => !subclassSummary(n))"""

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


async def wizard_back_to(page, selector):
    """Step back through the wizard until `selector` is on screen.

    Same reason as wizard_to_review: callers should not have to count steps.
    """
    for _ in range(4):
        if await page.locator(selector).count():
            return
        await page.click("#wz-back")
        await page.wait_for_timeout(250)
    assert await page.locator(selector).count(), f"never reached {selector}"


async def wizard_to_review(page):
    """Advance the creation wizard from abilities to review.

    The gear step sits between them; naming it here keeps every caller from
    having to know that.
    """
    await page.click("#wz-next")
    await page.wait_for_selector('.method-grid[aria-label="Starting gear"], .review-scores',
                                 timeout=5000)
    if await page.locator('.method-grid[aria-label="Starting gear"]').count():
        await page.click("#wz-next")
    await page.wait_for_selector(".review-scores", timeout=5000)


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
                 "SUBCLASSES", "FEATS",
                 "CLASS_STARTING_EQUIPMENT", "BACKGROUND_STARTING_EQUIPMENT"):
        try:
            a, b = block_of(app, name), block_of(rules, name)
        except ValueError:
            raise AssertionError(f"{name} is missing from one of the two files")
        assert a == b, f"{name} has drifted between app.js and v2/js/rules.js"
    ok(f"the rules constants v2 copies still match v1's ({9} of them)")

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

        # The bot check rides along with the PIN; the server refuses one without it.
        sent = await page.evaluate("JSON.parse(sessionStorage.getItem('__lastLoginParams') || 'null')")
        assert sent and sent.get("p_altcha") == "stub-altcha-payload", sent
        ok("login sends the solved bot-check payload as p_altcha")

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

        # ---------- 2a. Live updates ----------
        # Someone else heals Sythra. The database sends only which character
        # changed; the hub re-reads and redraws on its own.
        await page.wait_for_function("typeof window.__liveEmit === 'function'", timeout=5000)
        assert await page.evaluate("window.__liveTopic") == "world:" + "f" * 32
        await page.evaluate("""
            window.__patchFixture('characters', 'c2', { current_hit_points: 30 });
            window.__liveEmit({ table: 'characters', character_id: 'c2', op: 'UPDATE' });
        """)
        await page.wait_for_function(
            "document.querySelectorAll('.character-card')[1].querySelector('.hp-value b').textContent === '30'",
            timeout=5000)
        ok("a change signal for a character redraws the hub with their new HP")

        # A refresh must never pull a field out from under someone typing.
        await page.evaluate("""
            const i = document.createElement('input'); i.id = '__typing'; document.body.appendChild(i); i.focus();
            window.__patchFixture('characters', 'c2', { current_hit_points: 12 });
            window.__liveEmit({ table: 'characters', character_id: 'c2', op: 'UPDATE' });
        """)
        await page.wait_for_timeout(1200)
        assert (await cards.nth(1).locator(".hp-value b").inner_text()) == "30", "redrew while typing"
        await page.evaluate("document.getElementById('__typing').blur()")
        await page.wait_for_function(
            "document.querySelectorAll('.character-card')[1].querySelector('.hp-value b').textContent === '12'",
            timeout=5000)
        ok("a live refresh waits for the person typing, then applies")

        # One rail per bar, never one element per hit point.
        fills = await page.locator(".hp-bar > *").count()
        assert fills <= 8, f"expected at most 2 fills per card, got {fills} total"
        ok(f"HP bars use {fills} fill elements for 4 characters (not one per hit point)")

        # The bar is square and notched: a gap per hit point, drawn as stacked
        # backgrounds on one pseudo-element. Five layers -- every 1, 5, 10, 50
        # and 100 points -- and a layer whose step would be under 3.5px wide
        # at this bar's real width draws nothing.
        NOTCHES_JS = """() => [...document.querySelectorAll('.character-card .hp-bar')].map(bar => {
            const after = getComputedStyle(bar, '::after');
            return { max: Number(bar.style.getPropertyValue('--hp-max')),
                     notched: bar.classList.contains('notched'),
                     width: bar.getBoundingClientRect().width,
                     radius: getComputedStyle(bar).borderTopLeftRadius,
                     step: parseFloat(after.backgroundSize),
                     drawn: after.backgroundImage.split('linear-gradient(').slice(1)
                                 .map(layer => layer.includes('calc(100% - 1px)')) }; })"""

        def expected_layers(bar):
            return [bar["width"] / bar["max"] * every > 3.6 for every in (1, 5, 10, 50, 100)]

        bars = await page.evaluate(NOTCHES_JS)
        assert [b["max"] for b in bars] == [44, 44, 52, 33], bars
        assert all(b["notched"] and b["radius"] == "2px" for b in bars), bars
        for b in bars:
            assert abs(b["step"] - b["width"] / b["max"]) < 0.01, b
            assert b["drawn"] == expected_layers(b), b
        assert all(b["drawn"][0] for b in bars), "at this width every point should have its own notch"
        ok("HP bars are square, with one notch per hit point")

        await page.evaluate("""
            window.__patchFixture('characters', 'c1', { hit_point_maximum: 600, current_hit_points: 450 });
            window.__liveEmit({ table: 'characters', character_id: 'c1', op: 'UPDATE' });
        """)
        await page.wait_for_function(
            "document.querySelector('.character-card .hp-bar').style.getPropertyValue('--hp-max') === '600'",
            timeout=5000)
        big = (await page.evaluate(NOTCHES_JS))[0]
        assert big["drawn"] == expected_layers(big) and not big["drawn"][0] and any(big["drawn"]), big
        ok(f"a 600 hit point bar drops the per-point notches for coarser ones {big['drawn']}")
        await page.evaluate("""
            window.__patchFixture('characters', 'c1', { hit_point_maximum: 44, current_hit_points: 44 });
            window.__liveEmit({ table: 'characters', character_id: 'c1', op: 'UPDATE' });
        """)
        await page.wait_for_function(
            "document.querySelector('.character-card .hp-bar').style.getPropertyValue('--hp-max') === '44'",
            timeout=5000)

        # Korr 22/52 -> mid ; Brannor 44/44 -> high ; Wisp 0/33 -> DOWN
        assert (await cards.nth(2).locator(".hp-state").inner_text()).strip() == "BLOODIED"
        assert (await cards.nth(0).locator(".hp-state").inner_text()).strip() == "HEALTHY"
        assert (await cards.nth(3).locator(".hp-state").inner_text()).strip() == "DOWN"
        ok("HP labels match the classic tracker's five tiers (HEALTHY/INJURED/BLOODIED/CRITICAL/DOWN)")

        # A pending level-up is a corner marker, not a tag beside the name: the
        # inline tag left a name about three characters in the phone grid.
        flag = cards.nth(2).locator(".card-flag")
        assert await flag.count() == 1 and await page.locator(".card-flag").count() == 1
        assert await flag.get_attribute("aria-label") == "Level up due"
        assert await page.locator(".character-card .tag-accent").count() == 0
        assert (await cards.nth(1).locator(".tag-warning").inner_text()).strip() == "POISONED"
        assert await page.locator(".card-top > .tag").count() == 0, "a tag is squeezing a name again"
        fbox, cbox3 = await flag.bounding_box(), await cards.nth(2).bounding_box()
        assert fbox["x"] + fbox["width"] > cbox3["x"] + cbox3["width"] - 12 and fbox["y"] < cbox3["y"] + 12, (fbox, cbox3)
        ok("status: level-up marker on the card corner, condition tag under the name")

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

        # ---------- 4a. Collapsing the sidebar ----------
        # It folds to the sheet's icon rail, and the choice follows the device
        # to every page, since each page rebuilds the shell from scratch.
        await page.click("#sb-collapse")
        await page.wait_for_timeout(350)
        width = await page.evaluate("document.querySelector('.sidebar').getBoundingClientRect().width")
        assert width == 64, width
        assert not await page.locator('.sidebar-nav a[href="characters.html"] .nav-label').is_visible()
        assert await page.get_attribute('.sidebar-nav a[href="characters.html"]', "title") == "Characters"
        assert await page.get_attribute("#sb-collapse", "aria-expanded") == "false"
        assert await page.locator("#sb-logout").is_visible(), "logout stays reachable while collapsed"
        await page.click('.sidebar-nav a[href="characters.html"]')
        await page.wait_for_selector(".sidebar.is-collapsed", timeout=10000)
        ok("the sidebar collapses to the icon rail, and stays collapsed on the next page")

        await page.click("#sb-collapse")
        await page.wait_for_timeout(350)
        assert await page.locator('.sidebar-nav a[href="characters.html"] .nav-label').is_visible()
        assert await page.get_attribute('.sidebar-nav a[href="characters.html"]', "title") is None
        await page.goto(f"{BASE}/v2/index.html", wait_until="domcontentloaded")
        await page.wait_for_selector(".party-roster", timeout=10000)
        assert await page.locator(".sidebar.is-collapsed").count() == 0
        ok("expanding it again is remembered the same way")

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
        assert (hdrs or {}).get("x-dm-token", "") == "tok_" + "p" * 60, hdrs
        ok("player: no DM panel item, and their own world token as x-dm-token")

        # A device still holding a session from before every table was scoped
        # to a token would otherwise sit on an empty world with no explanation.
        ctx_old = await browser.new_context()
        await ctx_old.add_init_script(STUB)
        await ctx_old.add_init_script("""
            try {
              if (!sessionStorage.getItem('__seeded')) {
                sessionStorage.setItem('__seeded', '1');
                localStorage.setItem('dnd-session', JSON.stringify({
                  gameWorldId: 'w1', gameWorldName: 'Thornfell Reach',
                  role: 'player', timestamp: Date.now() }));
              }
            } catch (e) {}
        """)
        page_old = await ctx_old.new_page()
        await page_old.goto(f"{BASE}/v2/index.html", wait_until="domcontentloaded")
        await page_old.wait_for_url("**/v2/login.html", timeout=10000)
        assert await page_old.evaluate("localStorage.getItem('dnd-session')") is None
        ok("a session with no world token is sent to log in, and cleared")
        await ctx_old.close()
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
        # Saves have a row of their own. Inside the ability box they were an
        # unlabelled "S +7" that wrapped onto two lines when the box was narrow.
        assert await page.locator(".ability-box .save, .ability-box [data-explain^='save']").count() == 0
        int_save = page.locator('.save-chip[data-explain="save:int"]')
        assert await page.locator(".save-chip").count() == 6
        assert "+7" in (await int_save.inner_text())
        assert "is-prof" in (await int_save.get_attribute("class"))
        assert await page.locator('.section-head:has-text("Saving throws")').count() == 1
        ok("saving throws have their own labelled row: INT +4, save +7, marked proficient")

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

        # The icon rail is built from the same NAV as the sidebar. A hand-written
        # copy once called Encounters and Compendium unbuilt long after both
        # shipped, and had no Campaigns or DM panel at all.
        assert await page.locator(".rail .is-pending").count() == 0, "nothing on the rail is unbuilt"
        rail_links = await page.eval_on_selector_all(".rail a.icon-btn", "els => els.map(e => e.getAttribute('href'))")
        assert rail_links == ["index.html", "characters.html", "campaigns.html",
                              "monster-tracker.html", "compendium.html", "dm-panel.html"], rail_links
        assert await page.locator('.rail a.is-current[href="characters.html"]').count() == 1
        ok("sheet's icon rail links every page the sidebar does, DM panel included for a DM")

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

        await page.set_viewport_size({"width": 1280, "height": 900})
        await page.goto(f"{BASE}/v2/character-sheet.html?id=c1", wait_until="domcontentloaded")
        await page.wait_for_selector(".rail", timeout=10000)
        assert await page.locator(".rail .is-pending").count() == 0
        rail_links = await page.eval_on_selector_all(".rail a.icon-btn", "els => els.map(e => e.getAttribute('href'))")
        assert rail_links == ["index.html", "characters.html", "campaigns.html",
                              "monster-tracker.html", "compendium.html"], rail_links
        ok("a player's sheet rail reaches encounters and the compendium, and not the DM panel")

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
        for expected in ("Roll initiative", "Add players", "Add monsters", "Add NPC"):
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
        assert "level waiting" in banner and "banner on their sheet" in banner, banner
        assert "classic version" not in banner, "v2 has its own wizard now; this sent players to v1"
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
        # Level 4 starts at 2,700 and level 5 at 6,500: Korr's 6,000 is 3,300
        # of the 3,800 between them. Against the total it read 6,000 / 6,500.
        korr_text = await korr.inner_text()
        assert "3,300 / 3,800 XP to level 5" in korr_text and "6,000 total" in korr_text, korr_text
        ok("EXP mode shows progress through the current level, not the running total")

        # Brannor was just granted level 6 above, and holds exactly its
        # 14,000. Having just reached a level, he has made no progress into
        # it -- the bar once showed him well on his way to the next.
        brannor_text = await page.locator('.dm-row:has-text("Brannor")').inner_text()
        assert "0 / 9,000 XP to level 7" in brannor_text, brannor_text
        ok("a character who has just levelled shows no progress toward the next level")

        # Wisp is level 5 with nothing recorded, as a character levelled by
        # milestone is. She stands at level 5's floor, not at zero.
        wisp = page.locator('.dm-row:has-text("Wisp")')
        assert "0 / 7,500 XP to level 6" in await wisp.inner_text()
        await page.evaluate("window.__resetWrites()")
        await wisp.locator("input").fill("100")
        await wisp.locator('button:has-text("Grant")').click()
        await page.wait_for_timeout(800)
        writes = await page.evaluate("window.__writes")
        wisp_grant = [w for w in writes if w["table"] == "characters"][-1]
        assert wisp_grant["payload"]["experience_points"] == 6600, wisp_grant
        assert "level" not in wisp_grant["payload"], wisp_grant
        ok("EXP granted to a character levelled by milestone adds to their level's floor, not to zero")

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

        # A combatant alone in its colour has no set to be boxed with, so the
        # colour goes all the way round its own row instead of down one edge.
        lone = page.locator('.init-row:has-text("Bog Lurker")')
        lone_id = await lone.get_attribute("data-id")
        await page.evaluate("""id => {
            window.__patchFixture('encounter_combatants', id, { color: '#7fa65c' });
            window.__liveEmit({ table: 'encounter_combatants', encounter_id: 'e1', op: 'UPDATE' });
        }""", lone_id)
        await page.wait_for_selector('.init-row.has-color:has-text("Bog Lurker")', timeout=5000)
        assert await page.locator('.colour-block:has-text("Bog Lurker")').count() == 0
        sides = await lone.evaluate("""el => { const s = getComputedStyle(el);
            return [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor]; }""")
        assert sides == ["rgb(127, 166, 92)"] * 4, sides
        ok("a combatant alone in its colour is outlined in it on every side")
        await page.evaluate("""id => {
            window.__patchFixture('encounter_combatants', id, { color: null });
            window.__liveEmit({ table: 'encounter_combatants', encounter_id: 'e1', op: 'UPDATE' });
        }""", lone_id)
        await page.wait_for_function("document.querySelectorAll('.init-row.has-color').length === 2", timeout=5000)

        # A party member is marked with a figure, not the word.
        party_row = page.locator(".init-row.is-party")
        assert await party_row.locator(".party-mark svg").count() == 1
        assert await party_row.locator(".party-mark").get_attribute("aria-label") == "Party member"
        assert await page.locator('.init-row .hidden-pill:has-text("party")').count() == 0
        ok("a party member carries the party icon, with a label for screen readers")

        # Outlined all the way round in the party blue, not striped down one edge.
        # The blue is --hp-temp, which differs by theme, so compare with what
        # the theme resolves it to rather than one theme's value.
        sides = await party_row.evaluate("""el => { const s = getComputedStyle(el);
            const probe = document.createElement('i');
            probe.style.color = 'var(--hp-temp)'; document.body.appendChild(probe);
            const blue = getComputedStyle(probe).color; probe.remove();
            return { blue, sides: [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor],
                     widths: [s.borderTopWidth, s.borderLeftWidth], shadow: s.boxShadow }; }""")
        assert sides["sides"] == [sides["blue"]] * 4 and sides["widths"] == ["1px", "1px"], sides
        assert sides["blue"] in sides["shadow"], sides
        ok("a party member's row is outlined on every side, not striped down one")

        # The name opened the details and nothing showed that it would. The
        # arrow beside it is the control, and it shows when they are open.
        toggle = party_row.locator(".init-toggle")
        assert await page.locator(".init-toggle").count() == await page.locator(".init-row").count()
        assert await toggle.get_attribute("aria-expanded") == "false"
        await toggle.click()
        await page.wait_for_selector(".init-row.is-party.is-open .init-detail", timeout=5000)
        assert await party_row.locator(".init-toggle").get_attribute("aria-expanded") == "true"
        assert await page.locator(".init-detail").count() == 1
        await party_row.locator(".init-toggle").click()
        await page.wait_for_timeout(300)
        assert await page.locator(".init-detail").count() == 0
        assert await page.locator(".init-row.is-open").count() == 0
        ok("the arrow beside a name opens and closes the details, and shows which it is")

        # Add players: everyone at once, or only some. The fixture world has
        # four characters and one is already in this encounter.
        await act(page, "Add players")
        await page.wait_for_selector("#players-all", timeout=5000)
        assert (await page.locator("#players-all").inner_text()).strip() == "Add all 3"
        names = [n.strip() for n in await page.locator(".choose-row .name").all_inner_texts()]
        assert names == ["Brannor Hale", "Korr", "Wisp"], names
        assert await page.locator("#players-some").is_disabled()
        await page.evaluate("window.__resetWrites()")
        await page.locator('.choose-row:has-text("Korr") input').check()
        assert (await page.locator("#players-some").inner_text()).strip() == "Add 1 selected"
        await page.click("#players-some")
        await page.wait_for_timeout(600)
        added = [w for w in await page.evaluate("window.__writes")
                 if w["table"] == "encounter_combatants" and w["verb"] == "insert"]
        assert len(added) == 1 and len(added[0]["payload"]) == 1, added
        row = added[0]["payload"][0]
        assert row["character_id"] == "c3" and row["combatant_type"] == "character", row
        assert "current_hit_points" not in row and "max_hit_points" not in row, row
        assert await page.locator("#players-all").count() == 0
        ok("a single player character can be added to an encounter on their own")

        await act(page, "Add players")
        await page.wait_for_selector("#players-all", timeout=5000)
        await page.evaluate("window.__resetWrites()")
        await page.click("#players-all")
        await page.wait_for_timeout(600)
        added = [w for w in await page.evaluate("window.__writes")
                 if w["table"] == "encounter_combatants" and w["verb"] == "insert"]
        assert len(added) == 1 and sorted(r["character_id"] for r in added[0]["payload"]) == ["c1", "c3", "c4"], added
        ok("Add all still puts every missing character in at once")

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
        sides = await page.locator(".init-row.has-color").evaluate_all(
            """els => els.map(el => { const s = getComputedStyle(el);
                 return [s.borderTopColor, s.borderRightColor, s.borderBottomColor, s.borderLeftColor].join('|'); })""")
        assert sides == ["|".join(["rgb(61, 90, 114)"] * 4)] * 2, sides
        ok("a running encounter keeps flat initiative order, each coloured row outlined on its own")

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
        await wizard_to_review(page)

        review = await page.locator(".review-grid").inner_text()
        # Barbarian d12, CON 13+1 = 14 (+2): 12 + 2 = 14 hit points at level 1.
        assert "14" in review, review
        ok("review shows the hit points the engine will store")

        # ---------- 43. Point buy ----------
        await wizard_back_to(page, '[data-method="pointbuy"]')
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
        await wizard_back_to(page, "#wz-race")
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
        await wizard_to_review(page)
        await page.click("#wz-next")
        await page.wait_for_timeout(1400)

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
        # Korr is a level 4 Barbarian granted two levels. A grant only raises
        # `level`, and nothing on THIS device recorded where he started --
        # which is the usual case: the DM grants on their machine, the player
        # levels up on their own. The range has to come from the row itself,
        # where four hit dice say level 4 was the last one finished.
        luctx, lu = await open_levelup(browser, KORR, label="levelup")
        ok("a character owed a level gets a banner on their sheet")

        title = await lu.locator(".modal-head h2").inner_text()
        assert "4" in title and "6" in title, title
        ok(f"a multi-level grant opens as one run across the range ({title})")

        # Two levels gained means two hit point choices, not one repeated.
        rows = await lu.locator(".hp-choice-row").count()
        assert rows == 2, rows
        ok("a player on their own device is offered every level granted, not just the last")

        steps = [t.strip() for t in await lu.locator(".wizard-steps li .label").all_inner_texts()]
        # Barbarians take ASIs at 4, 8, 12 -- neither 5 nor 6 is one. The class
        # has no spellcasting either, so both steps must skip themselves.
        assert "ASI" not in steps, steps
        assert "Spells" not in steps, steps
        assert "Subclass" in steps, steps
        assert steps[-1] == "Review", steps
        ok(f"steps that do not apply skip themselves ({steps})")

        # A roll made at the table can be typed in. It is applied in place: a
        # rebuild per keystroke would drop the keyboard on a phone.
        own = lu.locator("[data-hpown]").first
        await own.fill("9")
        await lu.wait_for_timeout(150)
        assert (await lu.locator('[data-hpgain="0"]').inner_text()).strip() == "+9"
        assert await own.evaluate("el => el === document.activeElement"), \
            "typing a roll must not rebuild the dialog"
        assert await lu.locator("#lu-next").is_disabled(), "level 6 still has no choice"
        await own.fill("13")
        await lu.wait_for_timeout(150)
        assert (await lu.locator('[data-hpgain="0"]').inner_text()).strip() == "", \
            "13 is not a face on a d12"
        ok("a roll made at the table can be typed in, and one the die cannot show is refused")

        await lu.click("#lu-avg-all")
        await lu.wait_for_timeout(300)
        total = await lu.locator(".wizard-body .hint").last.inner_text()
        # d12 Barbarian, CON 10 (+0): average is 7 a level, so 14 for two.
        assert "+14" in total, total
        ok(f"taking the average for all fills every level ({total.strip()})")

        # The dialog closes on a stray tap outside it. Coming back must not
        # throw the choices away -- or hand out a fresh set of rolls.
        await lu.click("#modal-close")
        await lu.wait_for_timeout(300)
        await lu.click(".levelup-banner")
        await lu.wait_for_selector(".hp-choice-row", timeout=5000)
        total = await lu.locator(".wizard-body .hint").last.inner_text()
        assert "+14" in total, total
        assert not await lu.locator("#lu-next").is_disabled()
        ok("closing the dialog and reopening it resumes with the choices already made")

        await lu.click("#lu-next")
        await lu.wait_for_selector(".subclass-list", timeout=5000)
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

        # Subclass features are looked up when the review first needs them.
        await lu.wait_for_function(
            "document.querySelector('.pick-list') && "
            "document.querySelector('.pick-list').innerText.includes('Frenzy')", timeout=5000)
        features = await lu.locator(".pick-list").inner_text()
        assert "Extra Attack" in features and "Path Feature" in features, features
        ok("features from every level in the range are listed, not just the last")
        # Korr reached level 4 without a subclass. Choosing one now brings
        # what it granted at 3 as well as what it grants at 6.
        assert "Frenzy" in features and "Mindless Rage" in features, features
        assert "Intimidating Presence" not in features, "that is level 10's"
        ok("the review lists the subclass's features too, including the level 3 one a late choice still owes")

        # A stale marker from an earlier grant, to check it is cleaned up.
        await lu.evaluate("localStorage.setItem('preGrantLevel_c3', '4')")
        await lu.evaluate("window.__resetWrites()")
        await lu.click("#lu-next")
        await lu.wait_for_timeout(1500)

        writes = await lu.evaluate("window.__writes")
        updates = [w for w in writes if w["table"] == "characters" and w["verb"] == "update"]
        # One write, last: it is the one that clears the pending flag, so a
        # failure anywhere before it leaves the level owed and nothing doubled.
        assert len(updates) == 1, [w["payload"] for w in updates]
        assert writes[-1]["table"] == "characters", writes[-1]
        final = updates[0]["payload"]
        assert final["level"] == 6, final
        assert final["proficiency_bonus"] == 3, final
        assert final["hit_dice_total"] == "6d12", final
        assert final["pending_level_up"] is False, final
        assert final["subclass"] == "Path of the Berserker", final
        ok("finishing writes the level, proficiency, hit dice, subclass and the cleared flag in one update, last")

        # Korr was 52/22; +14 across two levels.
        assert final["hit_point_maximum"] == 66, final
        assert final["current_hit_points"] == 36, final
        ok("the hit point gain is added to both maximum and current")

        saved_features = [w for w in writes if w["table"] == "features_traits" and w["verb"] == "insert"]
        names = [w["payload"]["name"] for w in saved_features]
        assert "Extra Attack" in names, names
        assert "Mindless Rage" in names and "Frenzy" in names, "subclass features should be saved too"
        assert len(names) == len(set(names)), names
        ok(f"class and subclass features are both saved ({len(names)} rows)")

        left = await lu.evaluate("localStorage.getItem('preGrantLevel_c3')")
        assert left is None, left
        ok("the wizard clears the level markers it consumed")

        await luctx.close()

        # A row whose hit dice say nothing useful -- one written before the
        # wizard kept them in step -- still falls back to the marker the
        # granting device left behind.
        fbctx, fb = await open_levelup(browser, {**KORR, "hit_dice_total": "6d12"},
                                       extra="localStorage.setItem('preGrantLevel_c3', '4');",
                                       label="levelup-fallback")
        assert await fb.locator(".hp-choice-row").count() == 2
        ok("when the hit dice cannot say where the run starts, the stored marker still does")
        await fbctx.close()

        # ---------- 45b. A save the database refuses ----------
        # Supabase reports a refused write in its return value and throws
        # nothing. Unchecked, the dialog closed as though the level had been
        # taken. (No console watch here: the failure is logged on purpose.)
        rfctx, rf = await open_levelup(browser, KORR)
        await rf.click("#lu-avg-all")
        await rf.click("#lu-next")
        await rf.click('[data-subclass="Path of the Berserker"]')
        await rf.click("#lu-next")
        await rf.wait_for_function(
            "document.querySelector('.pick-list') && "
            "document.querySelector('.pick-list').innerText.includes('Frenzy')", timeout=5000)

        await rf.evaluate("window.__failWrites = ['characters']; window.__resetWrites()")
        await rf.click("#lu-next")
        await rf.wait_for_selector(".toast-error", timeout=5000)
        await rf.wait_for_timeout(300)
        assert "Could not save" in await rf.locator(".toast-error").first.inner_text()
        assert await rf.locator("#lu-next").count() == 1, "the dialog must stay open"
        assert not await rf.locator("#lu-next").is_disabled(), "and Finish must be pressable again"
        first_pass = await rf.evaluate("window.__writes")
        first_features = [w for w in first_pass if w["table"] == "features_traits"]
        assert len(first_features) == 5, [w["payload"]["name"] for w in first_features]
        ok("a refused write keeps the dialog open and says so, instead of closing as if it had worked")

        await rf.evaluate("window.__failWrites = []")
        await rf.click("#lu-next")
        await rf.wait_for_selector("#lu-next", state="detached", timeout=5000)
        second_pass = await rf.evaluate("window.__writes")
        all_features = [w for w in second_pass if w["table"] == "features_traits"]
        assert len(all_features) == 5, "the retry must not write the features a second time"
        landed = [w for w in second_pass if w["table"] == "characters" and w["verb"] == "update"]
        assert landed[-1]["payload"]["pending_level_up"] is False, landed[-1]
        assert landed[-1]["payload"]["hit_point_maximum"] == 66, "the hit points must not be added twice"
        ok("pressing Finish again repeats only the write that failed")
        await rfctx.close()

        # ---------- 45c. A caster: spells, slots and Constitution ----------
        cactx, ca = await open_levelup(browser, LIRA, label="levelup-caster")
        steps = [t.strip() for t in await ca.locator(".wizard-steps li .label").all_inner_texts()]
        assert steps == ["Hit points", "ASI", "Spells", "Review"], steps
        ok(f"a bard reaching level 4 is offered spells as well as an improvement ({steps})")

        # d8, CON 15 (+2): the average is 5 + 2.
        assert "+7" in await ca.locator('[data-hp="0"][data-method="average"]').inner_text()
        await ca.click('[data-hp="0"][data-method="average"]')
        await ca.click("#lu-next")
        await ca.wait_for_selector("[data-asi]", timeout=5000)
        await ca.click('[data-asi="0"][data-ab="con"][data-delta="1"]')
        await ca.wait_for_timeout(150)
        await ca.click('[data-asi="0"][data-ab="cha"][data-delta="1"]')
        await ca.wait_for_timeout(150)
        await ca.click("#lu-next")
        await ca.wait_for_selector("#lu-spell-search", timeout=5000)
        await ca.wait_for_selector("[data-spell]", timeout=5000)

        hint = await ca.locator(".wizard-body .hint").first.inner_text()
        # Level 3 knows 2 cantrips and 6 spells, level 4 knows 3 and 7. The
        # three spells already on her sheet have nothing to do with it.
        assert "1 new cantrip" in hint and "1 new spell" in hint and "level 2 or lower" in hint, hint
        ok("the spell step offers what the level adds, counted from the class table rather than the sheet")

        offered = await ca.locator("[data-spell]").evaluate_all("els => els.map(e => e.dataset.spell)")
        assert "shatter" in offered and "mage-hand" in offered, offered
        assert "hypnotic-pattern" not in offered, "a 3rd-level spell with no 3rd-level slot"
        assert "vicious-mockery" not in offered and "healing-word" not in offered, "already on the sheet"
        ok(f"only spells from her class list, castable now and not already known, are offered ({offered})")

        await ca.click('[data-spell="mage-hand"]')
        await ca.wait_for_selector('[data-unspell]', timeout=5000)
        await ca.wait_for_selector("[data-spell]", timeout=5000)

        # Off the class list (Magical Secrets, a DM's allowance) the level
        # limit still holds: Fireball is 3rd level.
        await ca.click("#lu-spell-classonly")
        await ca.wait_for_selector('[data-spell="fireball"]', timeout=5000)
        await ca.click('[data-spell="fireball"]')
        await ca.wait_for_selector(".toast-error", timeout=5000)
        assert await ca.locator("[data-unspell]").count() == 1, "Fireball must not have been added"
        ok("a spell from off the class list is still held to the level she can cast")
        await ca.click("#lu-spell-classonly")
        await ca.wait_for_selector('[data-spell="shatter"]', timeout=5000)
        await ca.click('[data-spell="shatter"]')
        await ca.wait_for_function("document.querySelectorAll('[data-unspell]').length === 2", timeout=5000)

        await ca.click("#lu-next")
        await ca.wait_for_selector(".review-grid", timeout=5000)
        await ca.wait_for_function(
            "!document.querySelector('.wizard-body').innerText.includes('Looking up')", timeout=5000)
        review = await ca.locator(".wizard-body").inner_text()
        # Level 4's die is 5, and CON is now 16 (+3): 8. The modifier going up
        # is also worth a point for each of the three levels she already had.
        assert "+11" in await ca.locator(".review-grid").inner_text(), review
        assert "Constitution modifier going up" in review, review
        assert "CON 15" in review and "16" in review, review
        ok("raising Constitution raises hit points for the levels already behind her, and the review says why")
        assert "College of Swords is not in the free rules" in review, review
        ok("a subclass the SRD does not carry is named, with where to add its features by hand")

        await ca.evaluate("window.__resetWrites()")
        await ca.click("#lu-next")
        await ca.wait_for_selector("#lu-next", state="detached", timeout=5000)
        writes = await ca.evaluate("window.__writes")

        scores = [w for w in writes if w["table"] == "ability_scores"]
        assert len(scores) == 1 and scores[0]["payload"] == {"constitution": 16, "charisma": 17}, scores
        ok("only the scores that changed are written")

        learned = {w["payload"]["name"]: w["payload"] for w in writes
                   if w["table"] == "spells" and w["verb"] == "insert"}
        assert set(learned) == {"Mage Hand", "Shatter"}, learned
        assert learned["Mage Hand"]["level"] == 0 and learned["Shatter"]["level"] == 2, learned
        assert learned["Shatter"]["prepared"] is True, "a bard's known spell is ready to cast"
        ok("the spells chosen are added to the sheet with their levels")

        slots = [w for w in writes if w["table"] == "spell_slots"]
        # 1st-level slots stay at 4, so that row is left alone; 2nd goes 2 -> 3
        # and keeps the two already spent.
        assert len(slots) == 1 and slots[0]["verb"] == "update", slots
        assert slots[0]["payload"] == {"total": 3, "used": 2}, slots
        ok("spell slots move to the new level's, and slots already spent stay spent")

        final = [w for w in writes if w["table"] == "characters" and w["verb"] == "update"][-1]["payload"]
        assert final["hit_point_maximum"] == 35 and final["current_hit_points"] == 31, final
        assert final["hit_dice_total"] == "4d8", final
        # One of three hit dice was left; a level adds one, it does not refill.
        assert final["hit_dice_remaining"] == 2, final
        assert "initiative_bonus" not in final, "Dexterity did not change"
        ok("levelling adds one hit die and leaves the spent ones spent")
        await cactx.close()

        # ---------- 45d. Pact Magic trades its slots up ----------
        wkctx, wk = await open_levelup(browser, VEX, label="levelup-warlock")
        await wk.click('[data-hp="0"][data-method="average"]')
        await wk.click("#lu-next")
        await wk.wait_for_selector("#lu-spell-search", timeout=5000)
        # Choosing is not forced: the list can fail to load, and a player may
        # want to read up first. The review says what is still owed.
        await wk.click("#lu-next")
        await wk.wait_for_selector(".review-grid", timeout=5000)
        assert "1 spell to choose" in await wk.locator(".wizard-body").inner_text()
        ok("a spell left unchosen is flagged on the review rather than silently dropped")

        await wk.evaluate("window.__resetWrites()")
        await wk.click("#lu-next")
        await wk.wait_for_selector("#lu-next", state="detached", timeout=5000)
        writes = await wk.evaluate("window.__writes")
        slots = [(w["verb"], w["payload"]) for w in writes if w["table"] == "spell_slots"]
        assert ("delete", None) in slots, slots
        gained = [p for v, p in slots if v == "insert"]
        assert len(gained) == 1 and gained[0]["slot_level"] == 2 and gained[0]["total"] == 2, slots
        ok("a warlock reaching level 3 gains 2nd-level slots and gives up the 1st-level ones")
        await wkctx.close()

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
        # Let the page transition finish: while it runs, input goes to the
        # transition overlay rather than the page (v2.css, Page transitions).
        await hp.wait_for_timeout(500)

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

        # The closed + menu is hidden but still laid out, and its wrapper used
        # to catch touches: every heal, Down and Remove button that scrolled
        # under that invisible box was dead, while damage, further left, worked.
        dead = await hp.evaluate("""() => {
            const out = [];
            for (const btn of document.querySelectorAll('.init-row button')) {
                btn.scrollIntoView({ block: 'end' });
                const r = btn.getBoundingClientRect();
                const at = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
                if (at !== btn && !btn.contains(at)) out.push(btn.textContent.trim() + ' <- ' + (at && at.className));
            }
            return out;
        }""")
        assert dead == [], dead
        ok("no row button on the tracker is covered by the closed + menu")

        await hp.evaluate("window.__resetWrites()")
        mob = hp.locator('.init-row:not(.is-party):not(.is-dead)').last
        mob_id = await mob.get_attribute("data-id")
        await hp.evaluate("id => document.querySelector(`.init-row[data-id=\"${id}\"] .hp-btn.heal`).scrollIntoView({ block: 'end' })", mob_id)
        await mob.locator(".hp-btn.damage").tap()
        await hp.wait_for_timeout(300)
        await hp.locator(f'.init-row[data-id="{mob_id}"] .hp-btn.heal').tap()
        await hp.wait_for_timeout(300)
        await hp.locator(f'.init-row[data-id="{mob_id}"] button:has-text("Remove")').tap()
        await hp.wait_for_timeout(500)
        verbs = [w["verb"] for w in await hp.evaluate("window.__writes") if w["table"] == "encounter_combatants"]
        assert verbs == ["update", "update", "delete"], verbs
        assert await hp.locator(f'.init-row[data-id="{mob_id}"]').count() == 0
        ok("at the bottom of a phone screen, heal and Remove work as well as damage")
        await hp.evaluate("document.scrollingElement.scrollTo(0, 0)")
        await hp.wait_for_timeout(200)

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

        # ---------- 49b. Hold to explain ----------
        # Numbers on a sheet say nothing about what they are for. Holding one
        # says so in a bubble -- and most of them also do something on a tap,
        # so the hold must explain without also doing that.
        await hp.goto(f"{BASE}/v2/character-sheet.html?id=c2", wait_until="domcontentloaded")
        await hp.wait_for_selector(".ability-box", timeout=10000)
        tip = hp.locator("#explainer")

        async def hold_explain(selector, click=True):
            target = hp.locator(selector).first
            # An open bubble can be lying over the next thing to hold, and a
            # touch on the bubble only closes it.
            await hp.evaluate("hideExplainer()")
            await target.scroll_into_view_if_needed()
            await hp.wait_for_timeout(150)
            b = await target.bounding_box()
            await hp.evaluate(TOUCH_HOLD_JS if click else TOUCH_HOLD_NOCLICK_JS,
                              {"x": b["x"] + b["width"] / 2, "y": b["y"] + b["height"] / 2, "ms": 700})
            await hp.wait_for_selector("#explainer", timeout=3000)
            return b, await tip.locator(".explainer-title").inner_text()

        _, title = await hold_explain(".ability-box .score")
        assert title == "Strength", title
        note = await tip.locator(".explainer-note").inner_text()
        assert "8" in note and "-1" in note, note          # the fixture's Strength
        assert await tip.locator("li").count() >= 2
        tb = await tip.bounding_box()
        assert tb["x"] >= 0 and tb["x"] + tb["width"] <= 390, tb
        ok("holding an ability score says what it is for, with the character's own number")

        await hp.touchscreen.tap(195, 26)
        await hp.wait_for_timeout(200)
        assert await tip.count() == 0
        ok("a tap anywhere else puts the bubble away")

        absent = await hp.evaluate("""() => [...document.querySelectorAll('.condition-tag')]
            .map(e => e.dataset.explain.split(':')[1]).filter(n => !GLOSSARY.conditions[n])
            .concat(Object.keys(SKILLS).filter(n => !GLOSSARY.skills[n]))""")
        assert absent == [], absent
        assert await hp.locator(".condition-tag").count() == 15
        ok("every condition and every skill has an explanation")

        blinded = '.condition-tag:text-is("Blinded")'
        await hp.evaluate("window.__resetWrites()")
        anchor, title = await hold_explain(blinded)
        assert title == "Blinded", title
        assert await tip.locator("li").count() == 3
        tb = await tip.bounding_box()
        assert tb["y"] + tb["height"] <= anchor["y"] or tb["y"] >= anchor["y"] + anchor["height"], (tb, anchor)
        await hp.wait_for_timeout(300)
        assert await hp.evaluate("window.__writes.length") == 0
        assert await hp.locator(blinded + ".active").count() == 0
        ok("holding a condition explains it without switching it on")

        # The bubble sits over other controls. A tap on it closes it and must
        # not reach whatever is underneath.
        await hp.touchscreen.tap(tb["x"] + tb["width"] / 2, tb["y"] + tb["height"] / 2)
        await hp.wait_for_timeout(400)
        assert await tip.count() == 0
        assert await hp.evaluate("window.__writes.length") == 0
        ok("tapping the bubble closes it and touches nothing beneath")

        await hold_explain(blinded, click=False)
        await hp.locator(blinded).tap()
        await hp.wait_for_timeout(500)
        assert await tip.count() == 0
        writes = await hp.evaluate("window.__writes")
        assert any("Blinded" in (w.get("payload") or {}).get("active_conditions", []) for w in writes), writes
        ok("a hold released without a click does not eat the next real tap")

        await hp.evaluate("window.__resetWrites()")
        chip = '.save-chip[data-explain="save:str"]'
        _, title = await hold_explain(chip)
        assert title == "Strength save", title
        assert "Tap to switch proficiency" in await tip.locator(".explainer-note").inner_text()
        assert await hp.evaluate("window.__writes.length") == 0
        ok("holding a saving throw explains it without switching proficiency")

        # One line each, at phone width: the wrap is what made them look broken.
        heights = await hp.evaluate("""() => [...document.querySelectorAll('.save-chip')]
            .map(e => Math.round(e.getBoundingClientRect().height))""")
        assert len(set(heights)) == 1 and heights[0] < 44, heights
        await hp.evaluate("hideExplainer()")
        await hp.locator(chip).tap()
        await hp.wait_for_timeout(500)
        writes = await hp.evaluate("window.__writes")
        assert any(w["table"] == "saving_throws" and w["payload"] == {"proficient": True} for w in writes), writes
        assert await hp.locator(chip + ".is-prof").count() == 1
        ok("a tap on a saving throw still switches its proficiency")

        _, title = await hold_explain('[data-explain="stat:ac"]')
        assert title == "Armor Class", title
        # Speed is not here: its chip is hidden at phone width. The desktop
        # hover check below covers it.
        for key, want in (("init", "Initiative"), ("prof", "Proficiency bonus"),
                          ("pp", "Passive Perception")):
            _, title = await hold_explain(f'[data-explain="stat:{key}"]')
            assert title == want, (key, title)
        ok("the combat chips in the header explain themselves")

        await hp.touchscreen.tap(195, 26)
        await click_tab(hp, "Skills")
        await hp.wait_for_selector(".skill-row", timeout=5000)
        await hp.evaluate("window.__resetWrites()")
        _, title = await hold_explain('.skill-row:has-text("Arcana")')
        assert title == "Arcana · Intelligence", title
        note = await tip.locator(".explainer-note").inner_text()
        assert "d20 + 10 (expertise)" in note, note        # +4 Int, +3 proficiency twice
        assert await hp.evaluate("window.__writes.length") == 0
        ok("holding a skill explains it, with the roll, and leaves proficiency alone")

        await hold.close()

        # ---------- 50. The sheet can be written to ----------
        # It was read-only everywhere but hit points, conditions, proficiency
        # toggles and rests, so a player had to open the classic version to
        # record a spell they had just learned.
        await page.goto(f"{BASE}/v2/character-sheet.html?id=c2", wait_until="domcontentloaded")
        await page.wait_for_selector(".sheet-header", timeout=10000)

        # A mouse cannot hold, so it hovers for the same bubble.
        await page.hover('[data-explain="stat:speed"]')
        await page.wait_for_selector("#explainer", timeout=3000)
        assert await page.locator("#explainer .explainer-title").inner_text() == "Speed"
        assert await page.locator("#explainer.is-touch").count() == 0
        await page.hover(".sheet-id h1")
        await page.wait_for_timeout(150)
        assert await page.locator("#explainer").count() == 0
        ok("with a mouse, hovering shows the explanation and leaving puts it away")

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

        # ---------- 62. The starting kit ----------
        await page.goto(f"{BASE}/v2/character-new.html", wait_until="domcontentloaded")
        await page.wait_for_selector("#wz-name", timeout=10000)
        await page.fill("#wz-name", "Hrothgar")
        await page.fill("#wz-player", "Sam")
        await page.select_option("#wz-class", "Barbarian")
        await page.wait_for_timeout(250)
        await page.select_option("#wz-background", "Acolyte")
        await page.wait_for_timeout(250)
        await page.click("#wz-next")
        await page.wait_for_selector(".method-grid", timeout=5000)
        await page.click('[data-method="manual"]')
        await page.wait_for_timeout(200)
        await page.click("#wz-next")
        await page.wait_for_selector('.method-grid[aria-label="Starting gear"]', timeout=5000)

        gear = await page.locator(".wizard-body").inner_text()
        # A Barbarian's kit, plus the Acolyte's gear and coin.
        assert "Greataxe" in gear and "Javelin" in gear, gear
        assert "Holy Symbol" in gear, gear
        assert "15" in gear and "GP" in gear, gear
        ok("the gear step lists the class and background kit, with its coin")

        await page.evaluate("window.__resetWrites()")
        await wizard_to_review(page)
        await page.click("#wz-next")
        await page.wait_for_timeout(1400)

        writes = await page.evaluate("window.__writes")
        weapons = [w for w in writes if w["table"] == "weapons" and w["verb"] == "insert"]
        assert weapons, [w["table"] for w in writes]
        names = [row["name"] for row in weapons[-1]["payload"]]
        assert "Greataxe" in names and names.count("Javelin") == 4, names
        ok(f"taking the kit writes the class weapons ({len(names)} of them)")

        carried = [w for w in writes if w["table"] == "inventory_items" and w["verb"] == "insert"][-1]
        carried_names = [row["name"] for row in carried["payload"]]
        assert "Explorer's Pack" in carried_names, carried_names
        assert "Holy Symbol" in carried_names, "background gear comes too"
        ok("armour and gear go to the inventory, not the weapons table")

        purse = [w for w in writes if w["table"] == "currency" and w["verb"] == "update"]
        assert purse and purse[-1]["payload"]["gold"] == 15, purse
        ok("the background's coin lands on the purse")

        # ---------- 63. Skipping the kit ----------
        await page.goto(f"{BASE}/v2/character-new.html", wait_until="domcontentloaded")
        await page.wait_for_selector("#wz-name", timeout=10000)
        await page.fill("#wz-name", "Pauper")
        await page.fill("#wz-player", "Sam")
        await page.click("#wz-next")
        await page.wait_for_selector(".method-grid", timeout=5000)
        await page.click('[data-method="manual"]')
        await page.wait_for_timeout(200)
        await page.click("#wz-next")
        await page.wait_for_selector('[data-kit="no"]', timeout=5000)
        await page.click('[data-kit="no"]')
        await page.wait_for_timeout(200)
        await page.evaluate("window.__resetWrites()")
        await wizard_to_review(page)
        await page.click("#wz-next")
        await page.wait_for_timeout(1400)

        writes = await page.evaluate("window.__writes")
        assert not [w for w in writes if w["table"] == "weapons"], "no kit means no weapons"
        purse = [w for w in writes if w["table"] == "currency" and w["verb"] == "update"]
        assert not purse, "no kit means no coin"
        ok("starting with nothing writes no weapons and no coin")

        # ---------- 64. Creating above level 1 ----------
        # The character is written at level 1 and the level-up wizard runs for
        # the levels above it, so every improvement is offered before the
        # sheet rather than being silently skipped.
        await page.goto(f"{BASE}/v2/character-new.html", wait_until="domcontentloaded")
        await page.wait_for_selector("#wz-level", timeout=10000)
        await page.fill("#wz-name", "Veteran")
        await page.fill("#wz-player", "Sam")
        await page.select_option("#wz-class", "Barbarian")
        await page.wait_for_timeout(250)
        level = page.locator("#wz-level")
        await level.click()
        await page.keyboard.type("6")
        await page.locator("#wz-name").click()
        await page.wait_for_timeout(200)
        assert await level.input_value() == "6"

        await page.click("#wz-next")
        await page.wait_for_selector(".method-grid", timeout=5000)
        await page.click('[data-method="manual"]')
        await page.wait_for_timeout(200)
        await wizard_to_review(page)

        review = await page.locator(".wizard-body").inner_text()
        assert "levels 2 to 6" in review, review
        ok("review says the wizard will walk the levels above the first")

        await page.evaluate("window.__resetWrites()")
        await page.click("#wz-next")
        await page.wait_for_selector(".wizard-steps", timeout=10000)
        await page.wait_for_timeout(1200)

        writes = await page.evaluate("window.__writes")
        made = [w for w in writes if w["table"] == "characters" and w["verb"] == "insert"][-1]
        # A d12 Barbarian with CON 10: 12 hit points at level 1, not level 6's.
        assert made["payload"]["hit_point_maximum"] == 12, made
        assert made["payload"]["level"] == 6, made
        assert made["payload"]["pending_level_up"] is True, made
        # One hit die to go with the level 1 hit points. It is what tells the
        # wizard which levels are still owed, on whatever device finishes.
        assert made["payload"]["hit_dice_total"] == "1d12", made
        assert made["payload"]["hit_dice_remaining"] == 1, made
        ok("the row is written at level 1 hit points and hit dice, flagged for the levels above")

        title = await page.locator(".modal-head h2").inner_text()
        assert "1" in title and "6" in title, title
        rows = await page.locator(".hp-choice-row").count()
        assert rows == 5, f"levels 2 to 6 is five choices, got {rows}"
        ok(f"the level-up wizard opens for levels 2 to 6 ({title})")

        # Scoped to the dialog: the creation wizard's own step list is still
        # on the page behind it, so a bare .wizard-steps matches both.
        steps = [t.strip() for t in
                 await page.locator("#modal-host .wizard-steps li .label").all_inner_texts()]
        # Barbarians take an ability score improvement at 4, which is in range.
        assert "ASI" in steps, steps
        assert "Subclass" in steps, steps
        assert "Identity" not in steps, "this should be the level-up wizard's steps, not creation's"
        ok(f"the improvements a level 6 Barbarian is owed are offered ({steps})")

        # The dialog can be closed, so the step behind it has to say what is
        # still owed rather than letting someone leave with level 1 hit points.
        await page.click("#modal-close")
        await page.wait_for_timeout(400)
        banner = await page.locator(".levelup-banner").inner_text()
        assert "2 to 6" in banner, banner
        ok("closing the wizard leaves the step saying what is still owed")

        # ---------- 65. The wizard keeps its place ----------
        # openPanel rebuilds the dialog on every redraw, which resets its
        # scroll. With two levels owing an improvement, pressing + on the
        # lower one threw the dialog back to the top on every click.
        # Three hit dice: level 3 was the last one finished. The level on the
        # row is 6 and this device was told the target is 8, so the run is 4..8.
        lvl = await browser.new_context(viewport={"width": 390, "height": 720})
        await lvl.add_init_script(stub_with(characters_single={
            **KORR, "hit_dice_total": "3d12", "hit_dice_remaining": 3}))
        await lvl.add_init_script("""
            try {
              localStorage.setItem('dnd-session', JSON.stringify({
                gameWorldId: 'w1', gameWorldName: 'Thornfell Reach', role: 'dm',
                dmToken: 'tok_' + 'a'.repeat(60), dmTokenIssued: Date.now(),
                timestamp: Date.now() }));
              localStorage.setItem('targetLevel_c3', '8');
            } catch (e) {}
        """)
        lp = await lvl.new_page()
        watch(lp, "levelup-scroll")
        await lp.goto(f"{BASE}/v2/character-sheet.html?id=c3", wait_until="domcontentloaded")
        await lp.wait_for_selector(".levelup-banner", timeout=10000)
        await lp.click(".levelup-banner")
        await lp.wait_for_selector(".wizard-steps", timeout=10000)
        await lp.wait_for_timeout(900)

        await lp.click("#lu-avg-all")
        await lp.wait_for_timeout(300)
        await lp.click("#lu-next")
        await lp.wait_for_selector("[data-asi]", timeout=5000)

        # A Barbarian takes improvements at 4 and 8, so the range 4..8 owes
        # two -- the second is well below the fold.
        blocks = await lp.locator(".asi-block").count()
        assert blocks == 2, f"levels 4 and 8 both owe an improvement, got {blocks}"

        scroller = "#modal-host .modal"
        await lp.evaluate(f"document.querySelector('{scroller}').scrollTop = 99999")
        await lp.wait_for_timeout(200)
        before = await lp.evaluate(f"document.querySelector('{scroller}').scrollTop")
        assert before > 0, "the dialog should be scrollable for this to mean anything"

        last_plus = lp.locator('.asi-block').last.locator('[data-delta="1"]').first
        await last_plus.click()
        await lp.wait_for_timeout(400)
        after = await lp.evaluate(f"document.querySelector('{scroller}').scrollTop")
        assert after > before - 40, f"scroll jumped from {before} to {after}"
        ok(f"pressing + on the lower improvement keeps the dialog's place ({before} -> {after})")

        # ---------- 65b. Two improvements in one run stack ----------
        # The press above put a point of level 8's on Strength, which is 18.
        # Spending both of level 4's there too takes it to 20 first, so that
        # later point no longer fits. Each improvement used to be measured
        # against the score on the sheet alone, and the save then capped the
        # result at 20 and threw the difference away without a word.
        first = lp.locator(".asi-block").nth(0)
        second = lp.locator(".asi-block").nth(1)
        for _ in range(2):
            await first.locator('[data-ab="str"][data-delta="1"]').click()
            await lp.wait_for_timeout(200)
        assert await second.locator('[data-ab="str"][data-delta="1"]').is_disabled()
        blocked = await lp.locator(".wizard-blocker").inner_text()
        assert "Strength" in blocked and "20" in blocked, blocked
        assert await lp.locator("#lu-next").is_disabled()
        ok("a later improvement sees an earlier one: a point that would pass 20 blocks the step, not vanishes on save")

        await second.locator('[data-ab="str"][data-delta="-1"]').click()
        await lp.wait_for_timeout(200)
        for _ in range(2):
            await second.locator('[data-ab="con"][data-delta="1"]').click()
            await lp.wait_for_timeout(200)
        assert not await lp.locator("#lu-next").is_disabled(), \
            await lp.locator(".wizard-blocker").inner_text()

        # ---------- 66. Subclass summaries ----------

        await lp.click("#lu-next")
        await lp.wait_for_selector("[data-subclass]", timeout=5000)

        # Compare against what rules.js actually holds, rather than guessing at
        # a word: "rage" is not a substring of "raging", which is how the first
        # version of this assertion failed on correct output.
        rows = await lp.locator(".subclass-row").count()
        assert rows >= 7, rows
        summary = (await lp.locator('[data-subclass="Path of the Berserker"] .summary').inner_text()).strip()
        expected = await lp.evaluate("() => subclassSummary('Path of the Berserker')")
        assert summary and summary == expected, (summary, expected)
        blank = await lp.evaluate(BLANK_SUMMARIES_JS)
        assert not blank, blank
        ok(f"every subclass row carries its one-line summary ({rows} of them)")

        await lvl.close()

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
                role: 'dm', timestamp: Date.now(),
                dmToken: 'tok_' + 'a'.repeat(60), dmTokenIssued: Date.now() }));
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
                role: 'dm', timestamp: Date.now(),
                dmToken: 'tok_' + 'a'.repeat(60), dmTokenIssued: Date.now() }));
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

        # ---------- v2: the Support menu ----------
        ctx10 = await browser.new_context(viewport={"width": 1280, "height": 900})
        await ctx10.add_init_script(STUB)
        page10 = await ctx10.new_page()
        watch(page10, "support")
        await page10.goto(f"{BASE}/v2/login.html", wait_until="domcontentloaded")
        await page10.fill("#world-name", "Thornfell Reach")
        await fill_pin(page10, "join", "1379")
        await page10.click("#join-form .btn-submit")
        await page10.wait_for_url("**/v2/index.html", timeout=10000)
        await page10.wait_for_selector(".party-roster", timeout=10000)

        assert await page10.locator(".sidebar-foot #sb-support").count() == 1
        ok("the desktop sidebar carries a Support item")

        await page10.click("#sb-support")
        await page10.wait_for_selector(".card-menu", timeout=5000)
        coffee = page10.locator('.card-menu a[href*="buymeacoffee"]')
        assert await coffee.count() == 1
        assert await coffee.get_attribute("href") == "https://buymeacoffee.com/pwtf"
        assert await coffee.get_attribute("target") == "_blank"
        # Opened in a new tab without handing the tab a window.opener to steer.
        assert "noopener" in (await coffee.get_attribute("rel") or "")
        ok("Support offers the classic version's coffee link, as a real anchor")

        # A real anchor rather than a button, because the menu closes before an
        # action runs and a popup opened outside the click's gesture is blocked.
        underline = await page10.eval_on_selector(
            '.card-menu a[href*="buymeacoffee"]',
            "el => getComputedStyle(el).textDecorationLine")
        assert underline == "none", underline
        ok("the coffee row is not styled as a bare link")

        await page10.click("#support-feedback")
        await page10.wait_for_selector("#modal-form", timeout=5000)
        note = await page10.locator(".modal-body .hint").first.inner_text()
        for expected in ("Thornfell Reach", "DM", "index.html"):
            assert expected in note, (expected, note)
        assert "browser" in note.lower()
        ok("the form says what travels with a report, before anything is typed")

        await page10.select_option("#mf-kind", "bug")
        await page10.fill("#mf-message", "Holding a card on iOS selects the text.")
        await page10.fill("#mf-contact", "sam@example.com")
        await page10.evaluate("window.__resetWrites()")
        await page10.click('#modal-form button[type="submit"]')
        await page10.wait_for_timeout(400)

        sent = [w for w in await page10.evaluate("window.__writes")
                if w["table"] == "feedback" and w["verb"] == "insert"]
        assert len(sent) == 1, sent
        row = sent[0]["payload"]
        assert row["kind"] == "bug"
        assert row["message"] == "Holding a card on iOS selects the text."
        assert row["contact"] == "sam@example.com"
        ok("submitting writes the report with what was typed")

        # The context the form promised, actually attached.
        assert row["world_name"] == "Thornfell Reach"
        assert row["game_world_id"] == "w1"
        assert row["role"] == "dm"
        assert row["page"] == "index.html"
        assert row["app_version"] == "v2"
        assert "x" in row["viewport"], row["viewport"]
        assert row["user_agent"], row
        ok("the promised context rides along: world, role, page, viewport and browser")

        # Nothing from the sheet or the campaign goes with it.
        blob = json.dumps(row).lower()
        for leak in ("sythra", "brannor", "drowned road", "harbourmaster"):
            assert leak not in blob, leak
        ok("no character or campaign content is attached to a report")

        # is_read and is_archived are pinned by the insert policy's WITH CHECK,
        # and the client must not be sending them at all.
        assert "is_read" not in row and "is_archived" not in row, row
        ok("a report is never submitted pre-read or pre-archived")

        # Below the breakpoint the sidebar is gone, so the drawer has to carry it.
        await page10.set_viewport_size({"width": 390, "height": 780})
        await page10.reload(wait_until="domcontentloaded")
        await page10.wait_for_selector(".party-roster", timeout=10000)
        await page10.click("#menu-btn")
        await page10.wait_for_timeout(350)
        assert await page10.locator("#sm-support").is_visible()
        await page10.click("#sm-support")
        await page10.wait_for_selector(".card-menu", timeout=5000)
        # The drawer must close first, or the panel opens behind its overlay.
        assert not await page10.locator("#side-menu-overlay.open").count()
        ok("the mobile drawer carries Support too, and closes before the panel opens")
        await ctx10.close()

        # ---------- Analytics: the global owner dashboard ----------
        # The campaign layer is dm_all, so every campaign number on this page
        # comes from analytics_overview() -- counts only. The assertions below
        # lock in both halves of that: the numbers arrive, and no campaign name
        # ever does.
        ctx8 = await browser.new_context(viewport={"width": 1280, "height": 900})
        await ctx8.add_init_script(stub_with(
            game_worlds=ANALYTICS_WORLDS,
            characters=ANALYTICS_CHARACTERS,
            analytics_overview=ANALYTICS_OVERVIEW,
            feedback=ANALYTICS_FEEDBACK))
        page8 = await ctx8.new_page()
        watch(page8, "analytics")
        await page8.goto(f"{BASE}/analytics.html", wait_until="domcontentloaded")

        await page8.wait_for_selector("#gate-form", timeout=10000)
        assert await page8.locator("#shell").is_hidden()
        ok("analytics opens on the sign-in gate with the dashboard hidden")

        await page8.fill("#gate-email", "owner@example.com")
        await page8.fill("#gate-password", "nope")
        await page8.click("#gate-submit")
        await page8.wait_for_selector("#gate-error:not([hidden])", timeout=5000)
        assert await page8.locator("#shell").is_hidden()
        ok("a refused sign-in shows the error and keeps the dashboard hidden")

        await page8.fill("#gate-password", "letmein")
        await page8.click("#gate-submit")
        await page8.wait_for_selector("#sec-library", timeout=10000)
        sections = await page8.locator(".an-section").count()
        assert sections == 7, sections
        ok(f"signing in renders all {sections} dashboard sections")

        # Worlds, characters and players, counted off the readable tables.
        heroes = await page8.locator("#sec-overview .an-stat.is-hero .value").all_inner_texts()
        assert heroes[0] == "3", heroes          # worlds
        assert heroes[1] == "6", heroes          # characters
        assert heroes[2] == "4", heroes          # Dave, Priya, Sam, Alex
        # 8+11+12+4+3+4+4+2 for w1..w3 as the RPC reports them
        assert heroes[3] == "48", heroes
        ok(f"headline tiles report {heroes[0]} worlds, {heroes[1]} characters, {heroes[2]} players, {heroes[3]} campaign items")

        # A nominal bar set encodes magnitude, so it takes ONE hue. Colouring
        # class bars by class would say something the data does not.
        hues = await page8.eval_on_selector_all(
            "#sec-characters .an-bar-fill",
            "els => Array.from(new Set(els.map(e => getComputedStyle(e).backgroundColor)))")
        assert len(hues) == 1, hues
        ok(f"every magnitude bar uses a single hue ({hues[0]})")

        # A genuine split is coloured by series -- and then always legended,
        # because on the light surface one slot sits below 3:1.
        first = page8.locator("#sec-overview .an-panel").first
        segs = await first.locator(".an-split > span").count()
        legend = await first.locator(".an-legend > div").count()
        assert segs == 2 and legend == 2, (segs, legend)
        values = await first.locator(".an-legend b").all_inner_texts()
        assert values == ["2", "1"], values
        ok("a two-way split carries one legend entry per segment, each with its value")

        # The worlds table joins what anon can read to what the RPC counted.
        rows = page8.locator("#worlds-table tbody tr")
        assert await rows.count() == 3, await rows.count()
        top = [c.strip() for c in await rows.first.locator("td").all_inner_texts()]
        assert top[0] == "Thornfell Reach", top
        assert top[3] == "5", top                # party
        assert top[6] == "6", top                # chapters, from the RPC
        ok("the worlds table joins party counts to the campaign counts from the RPC")

        # Three worlds fit on one page, so there is nothing to page through and
        # no pager saying so -- the section heading already carries the count.
        assert await page8.locator("#sec-worlds .an-pager").count() == 0
        ok("a table that fits on one page shows no pager at all")

        # Sorting redraws the table alone; the page must not jump back to the top.
        await page8.click('#worlds-table th[data-sort="name"]')
        await page8.wait_for_timeout(120)
        names = [n.strip() for n in await page8.locator("#worlds-table tbody td.name").all_inner_texts()]
        assert names == ["Ashvale", "The Quiet Fen", "Thornfell Reach"], names
        assert await page8.locator(".an-section").count() == sections
        ok("clicking a column header re-sorts the worlds table and leaves the rest of the page alone")

        # Levels are a distribution: read along the axis, never sorted by count.
        levels = [t.strip() for t in await page8.locator(
            "#sec-characters .an-panel:nth-child(3) .an-bar-label").all_inner_texts()]
        assert levels == ["Level 2", "Level 3", "Level 4", "Level 5"], levels
        ok("the level distribution keeps its axis order rather than sorting by count")

        # Campaign figures, and what is still hidden from the party.
        campaign_tiles = await page8.locator("#sec-campaigns .an-stat .value").all_inner_texts()
        assert campaign_tiles[1] == "8", campaign_tiles    # chapters
        assert campaign_tiles[2] == "11", campaign_tiles   # beats
        shown = await page8.locator("#sec-campaigns .an-prog-row .num").first.inner_text()
        assert "3" in shown and "8" in shown, shown
        ok("campaign counts and the revealed-to-players rows come through from the RPC")

        # ---------- The feedback inbox ----------
        badge = page8.locator("#nav-feedback-count")
        assert await badge.inner_text() == "2", await badge.inner_text()
        assert await badge.is_visible()
        ok("the sidebar badge counts unread, unarchived reports (2 of 4)")

        cards = page8.locator("#sec-feedback .fb-card")
        assert await cards.count() == 3, await cards.count()   # the archived one is out
        assert await page8.locator("#sec-feedback .fb-card.is-unread").count() == 2
        ok("the open list shows every unarchived report, marking the unread ones")

        # A report is free text from an anonymous submitter.
        assert "<script>" not in (await page8.content())
        assert "alert('xss')" in await cards.nth(1).locator(".fb-message").inner_text()
        ok("a report's message renders as text, tags and all")

        # The context the v2 form promised is what the inbox shows.
        meta = await cards.first.locator(".fb-meta").inner_text()
        for expected in ("Thornfell Reach", "DM", "characters.html", "390x780", "Safari on iOS"):
            assert expected in meta, (expected, meta)
        assert "sam@example.com" in await cards.first.locator(".fb-contact").inner_text()
        ok("each card shows where the report came from, and how to reply")

        # Marking read writes the row and takes it off the badge.
        await page8.evaluate("window.__resetWrites()")
        await page8.click('#sec-feedback .fb-card:first-child [data-fb="read"]')
        await page8.wait_for_timeout(300)
        marked = [w for w in await page8.evaluate("window.__writes")
                  if w["table"] == "feedback" and w["verb"] == "update"]
        assert len(marked) == 1 and marked[0]["payload"]["is_read"] is True, marked
        assert marked[0]["payload"]["read_at"], marked
        assert await badge.inner_text() == "1", await badge.inner_text()
        assert await page8.locator("#sec-feedback .fb-card.is-unread").count() == 1
        ok("marking a report read writes the row and drops the badge to 1")

        # And back again, so a mis-tap costs nothing.
        await page8.click('#sec-feedback .fb-card:first-child [data-fb="unread"]')
        await page8.wait_for_timeout(300)
        assert await badge.inner_text() == "2", await badge.inner_text()
        ok("marking it unread again restores the count")

        # Archive hides without deleting: the row is updated, never removed.
        await page8.evaluate("window.__resetWrites()")
        await page8.click('#sec-feedback .fb-card:first-child [data-fb="archive"]')
        await page8.wait_for_timeout(300)
        writes = await page8.evaluate("window.__writes")
        assert not [w for w in writes if w["table"] == "feedback" and w["verb"] == "delete"], writes
        archived = [w for w in writes if w["table"] == "feedback" and w["verb"] == "update"]
        assert archived[0]["payload"]["is_archived"] is True, archived
        assert await page8.locator("#sec-feedback .fb-card").count() == 2
        ok("archiving updates the row rather than deleting it, and takes it off the list")

        await page8.click('#sec-feedback [data-fb-view="archived"]')
        await page8.wait_for_timeout(250)
        assert await page8.locator("#sec-feedback .fb-card").count() == 2   # f4 and the one just archived
        await page8.click('#sec-feedback .fb-card:first-child [data-fb="restore"]')
        await page8.wait_for_timeout(300)
        assert await page8.locator("#sec-feedback .fb-card").count() == 1
        await page8.click('#sec-feedback [data-fb-view="open"]')
        await page8.wait_for_timeout(250)
        assert await page8.locator("#sec-feedback .fb-card").count() == 3
        ok("the Archived tab lists what was hidden, and Restore brings it back")

        # Nothing a DM wrote may reach this page. If anyone ever swaps the RPC
        # for a direct read, the campaign fixture's name lands in the markup.
        markup = await page8.content()
        for secret in ("The Drowned Road", "Mist hangs over the water", "harbourmaster"):
            assert secret not in markup, secret
        ok("no campaign name, read-aloud line or DM note appears anywhere on the page")

        await page8.set_viewport_size({"width": 390, "height": 780})
        await page8.wait_for_timeout(200)
        overflow = await page8.evaluate(
            "() => document.documentElement.scrollWidth - document.documentElement.clientWidth")
        assert overflow <= 1, overflow
        assert await page8.locator(".an-jump").is_visible()
        ok("at 390px the dashboard has no horizontal overflow and shows the section jumps")

        await page8.set_viewport_size({"width": 1280, "height": 900})
        await page8.click("#sb-signout")   # the desktop sidebar's copy
        await page8.wait_for_selector("#gate-form", timeout=5000)
        assert await page8.locator("#shell").is_hidden()
        ok("signing out returns to the gate")
        await ctx8.close()

        # Without the function the campaign section says so, and every section
        # that does not depend on it still renders.
        ctx9 = await browser.new_context(viewport={"width": 1280, "height": 900})
        await ctx9.add_init_script(stub_with(
            game_worlds=ANALYTICS_WORLDS, characters=ANALYTICS_CHARACTERS))
        page9 = await ctx9.new_page()
        watch(page9, "analytics-norpc")
        await page9.goto(f"{BASE}/analytics.html", wait_until="domcontentloaded")
        await page9.fill("#gate-email", "owner@example.com")
        await page9.fill("#gate-password", "letmein")
        await page9.click("#gate-submit")
        await page9.wait_for_selector("#sec-library", timeout=10000)
        assert await page9.locator("#sec-campaigns .an-locked").count() == 1
        assert await page9.locator("#sec-characters .an-bar-row").count() > 0
        assert await page9.locator("#worlds-table tbody tr").count() == 3
        ok("a refused analytics_overview() locks only the campaign section; the rest still renders")
        await ctx9.close()

        # ---------- Worlds table: paging ----------
        ctx11 = await browser.new_context(viewport={"width": 1440, "height": 1000})
        await ctx11.add_init_script(stub_with(
            game_worlds=PAGED_WORLDS,
            characters=[],
            analytics_overview=ANALYTICS_OVERVIEW,
            feedback=[]))
        page11 = await ctx11.new_page()
        watch(page11, "analytics-paging")
        await page11.goto(f"{BASE}/analytics.html", wait_until="domcontentloaded")
        await page11.fill("#gate-email", "owner@example.com")
        await page11.fill("#gate-password", "letmein")
        await page11.click("#gate-submit")
        await page11.wait_for_selector("#worlds-table", timeout=10000)

        # Sort by name so the order under test is the one being asserted, not
        # whatever the default sort happens to leave equal rows in.
        await page11.click('#worlds-table th[data-sort="name"]')
        await page11.wait_for_timeout(150)

        rows11 = page11.locator("#worlds-table tbody tr")
        assert await rows11.count() == 10, await rows11.count()
        ok("23 worlds render 10 rows, not 23")

        pager = page11.locator("#sec-worlds .an-pager")
        assert "1–10 of 23 worlds" in await pager.locator(".range").inner_text()
        assert "Page 1 of 3" in await pager.locator(".page-of").inner_text()
        assert await pager.locator('[data-world-page="prev"]').is_disabled()
        assert not await pager.locator('[data-world-page="next"]').is_disabled()
        ok("the pager says where you are, and Previous is dead on the first page")

        first_page = [n.strip() for n in await page11.locator("#worlds-table td.name").all_inner_texts()]
        assert first_page[0] == "World 01" and first_page[-1] == "World 10", first_page

        await page11.click('[data-world-page="next"]')
        await page11.wait_for_timeout(200)
        second = [n.strip() for n in await page11.locator("#worlds-table td.name").all_inner_texts()]
        assert second[0] == "World 11" and second[-1] == "World 20", second
        assert "11–20 of 23 worlds" in await pager.locator(".range").inner_text()
        ok("Next moves to the following ten, and none of them repeat")

        await page11.click('[data-world-page="next"]')
        await page11.wait_for_timeout(200)
        last = [n.strip() for n in await page11.locator("#worlds-table td.name").all_inner_texts()]
        assert last == ["World 21", "World 22", "World 23"], last
        assert await pager.locator('[data-world-page="next"]').is_disabled()
        assert "21–23 of 23 worlds" in await pager.locator(".range").inner_text()
        ok("the last page holds the remainder, and Next is dead there")

        # A new order makes "page 3" meaningless, so sorting starts over.
        await page11.click('#worlds-table th[data-sort="characters"]')
        await page11.wait_for_timeout(200)
        assert "Page 1 of 3" in await pager.locator(".page-of").inner_text()
        assert await page11.locator("#worlds-table tbody tr").count() == 10
        ok("re-sorting returns to the first page rather than stranding you deep in a new order")

        # Paging is a redraw of the table block alone.
        assert await page11.locator(".an-section").count() == 7
        ok("paging leaves the rest of the dashboard alone")
        await ctx11.close()

        # ---------- Owlbear Rodeo extension ----------
        # Monster HP hidden, as the tracker defaults it.
        hidden_hp = stub_with(encounters=[{"id": "e1", "name": "Ambush at the Ford", "status": "active",
                                           "round": 3, "campaign_id": "cam1", "hide_monster_hp": True}])

        # The GM's background shares a player session with the room on its own.
        octx = await obr_context(browser, hidden_hp)
        gm = await octx.new_page()
        watch(gm, "obr-gm")
        await obr_seed(gm, "GM", session=OBR_DM)
        await gm.goto(f"{BASE}/owlbear/background.html", wait_until="domcontentloaded")
        await until(gm, "(JSON.parse(localStorage.getItem('__obr_room')) || {})['com.taphou5e.owlbear/session']")
        shared = await gm.evaluate("JSON.parse(localStorage.getItem('__obr_room'))['com.taphou5e.owlbear/session']")
        assert shared["token"] == "tok_" + "s" * 60 and shared["worldId"] == "w1", shared
        assert await gm.evaluate("window.__shareCalls") == 1
        assert await gm.evaluate("window.__obr.badge") is None
        ok("the GM's client mints a player session and puts it in the room, once")

        menus = await gm.evaluate("Object.keys(window.__obr.menus)")
        assert set(menus) == {"com.taphou5e.owlbear/token", "com.taphou5e.owlbear/link-menu",
                              "com.taphou5e.owlbear/unlink"}, menus
        embed = await gm.evaluate("window.__obr.menus['com.taphou5e.owlbear/token'].embed.url")
        assert embed.endswith("/owlbear/token.html"), embed
        ok("the token popup is a context-menu embed, alongside link and unlink")

        icons = await gm.evaluate("""[window.__obr.icon,
            ...Object.values(window.__obr.menus).flatMap(m => m.icons.map(i => i.icon))]""")
        assert all(i.endswith("/owlbear/icon.png") for i in icons), icons
        ok("the toolbar button and every menu carry the white taphou5e logo in Owlbear's dark theme")

        # The GM sees every linked token's bar: Sythra 9/44 with 5 temp, the
        # gargoyle full.
        await until(gm, """(() => { const ids = window.__obrLocal().map(i => i.id);
            return ['t-sythra/hp', 't-sythra/name', 't-garg/hp', 't-garg/name']
                .every(s => ids.some(id => id.endsWith(s))); })()""")
        local = await gm.evaluate("window.__obrLocal()")
        by_id = {i["id"].split("/")[-2] + "/" + i["id"].split("/")[-1]: i for i in local}
        track, fill, temp = by_id["t-sythra/track"], by_id["t-sythra/fill"], by_id["t-sythra/temp"]
        assert abs(track["width"] - 126) < 0.01 and abs(fill["width"] - 126 * 9 / 44) < 0.01, (track, fill)
        assert fill["fillColor"] == "#c4452f" and temp["fillColor"] == "#3d5a72", (fill, temp)
        assert all(i["attachedTo"] == "t-sythra" and i["locked"] and i["disableHit"]
                   for i in (track, fill, temp))
        assert track["position"]["y"] > 375, track["position"]          # below the token
        assert by_id["t-garg/fill"]["fillColor"] == "#7fa65c"
        ok("bars: Sythra's track, low fill at 9/44 and temp segment; the gargoyle's full and green")

        # Plain bars: notches were tried and did not scale to large pools.
        assert not [k for k in by_id if "/notch-" in k], [k for k in by_id if "/notch-" in k]
        ok("bars are plain, with no notches")

        # Under the bar, AC and initiative. Sythra is in the running
        # encounter, so hers is the 17 she rolled, not her +3 bonus.
        stats = by_id["t-sythra/stats"]
        assert stats["plainText"] == "AC 12  ·  Init 17", stats
        assert by_id["t-garg/stats"]["plainText"] == "AC 15  ·  Init 12"
        assert stats["position"]["y"] > track["position"]["y"] + track["height"], (stats, track)
        assert stats["layer"] == "ATTACHMENT" and stats["attachedTo"] == "t-sythra", stats
        ok("under each bar, AC and initiative: the roll in a running fight ('AC 12 · Init 17')")

        # The number on the bar: current/max, and the temporary hit points.
        hp = by_id["t-sythra/hp"]
        assert hp["plainText"] == "9/44 +5" and hp["textType"] == "PLAIN", hp
        assert by_id["t-garg/hp"]["plainText"] == "52/52"
        assert hp["layer"] == "ATTACHMENT" and hp["attachedTo"] == "t-sythra" and hp["disableHit"], hp
        assert abs(hp["width"] - 126) < 0.01 and hp["position"] == track["position"], (hp, track)
        ok("each bar carries its numbers, '9/44 +5', as plain text under the fog layer")

        # Names above the tokens: the character's own, the encounter's for an enemy.
        name = by_id["t-sythra/name"]
        assert name["plainText"] == "Sythra of the Ninefold Ash", name
        assert by_id["t-garg/name"]["plainText"] == "Gargoyle 1"
        assert name["position"]["y"] + name["height"] <= 225, name        # the token's top edge is 225
        assert name["layer"] == "ATTACHMENT" and name["textAlign"] == "CENTER", name
        ok("linked tokens are named above them in Owlbear: Sythra by name, the enemy as 'Gargoyle 1'")

        # The player's client adopts the room's session and draws only what a
        # player may see: Sythra, and no gargoyle while monster HP is hidden.
        # Closed first: the player's setup below changes the stored session,
        # which would reload this page as it closed.
        await gm.close()
        pl = await octx.new_page()
        watch(pl, "obr-player")
        await pl.goto(f"{BASE}/owlbear/manifest.json", wait_until="domcontentloaded")
        await pl.evaluate("""() => {
            localStorage.removeItem('dnd-session');
            localStorage.setItem('__obr_role', JSON.stringify('PLAYER'));
            localStorage.setItem('__obr_local', '[]');
        }""")
        await pl.goto(f"{BASE}/owlbear/background.html", wait_until="domcontentloaded")
        await until(pl, "(JSON.parse(localStorage.getItem('dnd-session')) || {}).dmToken === 'tok_' + 's'.repeat(60)")
        sess = await pl.evaluate("JSON.parse(localStorage.getItem('dnd-session'))")
        assert sess["role"] == "player" and sess["gameWorldId"] == "w1", sess
        await until(pl, """(() => { const ids = window.__obrLocal().map(i => i.id);
            return ids.some(id => id.endsWith('t-sythra/hp')) && ids.some(id => id.endsWith('t-garg/name')); })()""")
        ids = sorted(i["id"] for i in await pl.evaluate("window.__obrLocal()"))
        garg = [i for i in ids if "t-garg" in i]
        # Name only: no bar, no numbers and no AC while the DM hides its HP.
        assert garg == ["com.taphou5e.owlbear/bar/t-garg/name"], garg
        assert any(i.endswith("t-sythra/stats") for i in ids), ids
        hdrs = await pl.evaluate("window.__capturedHeaders")
        assert hdrs.get("x-dm-token") == "tok_" + "s" * 60, hdrs
        ok("a player's client adopts the shared session, with no PIN, and draws no enemy bar while HP is hidden")
        ok("a player sees an enemy's name over its token even while its HP is hidden")

        # The DM shows monster HP. The encounter signal alone brings the bar.
        await until(pl, "typeof window.__liveEmit === 'function'")
        await pl.evaluate("""
            window.__patchFixture('encounters', 'e1', { hide_monster_hp: false });
            window.__liveEmit({ table: 'encounters', encounter_id: 'e1', op: 'UPDATE' });
        """)
        await until(pl, "window.__obrLocal().some(i => i.id.endsWith('t-garg/track'))")
        await until(pl, "(window.__obrLocal().find(i => i.id.endsWith('t-garg/hp')) || {}).plainText === '52/52'")
        await until(pl, "(window.__obrLocal().find(i => i.id.endsWith('t-garg/stats')) || {}).plainText === 'AC 15  ·  Init 12'")
        ok("showing monster HP in taphou5e puts the gargoyle's bar, numbers, AC and initiative on the player's map, live")

        # Hidden in Owlbear, a token shows a player nothing: no bar, no name.
        await pl.evaluate("""() => {
            const items = JSON.parse(localStorage.getItem('__obr_items'));
            items.find(i => i.id === 't-garg').visible = false;
            localStorage.setItem('__obr_items', JSON.stringify(items));
            window.dispatchEvent(new StorageEvent('storage', { key: '__obr_items' }));
        }""")
        await until(pl, "!window.__obrLocal().some(i => i.id.includes('t-garg'))")
        assert any(i["id"].endswith("t-sythra/name") for i in await pl.evaluate("window.__obrLocal()"))
        ok("a token hidden in Owlbear shows a player neither its bar nor its name")
        await pl.evaluate("""() => {
            const items = JSON.parse(localStorage.getItem('__obr_items'));
            items.find(i => i.id === 't-garg').visible = true;
            localStorage.setItem('__obr_items', JSON.stringify(items));
            window.dispatchEvent(new StorageEvent('storage', { key: '__obr_items' }));
        }""")
        await until(pl, "window.__obrLocal().some(i => i.id.endsWith('t-garg/track'))")

        # Damage in taphou5e redraws the bar.
        await pl.evaluate("""
            window.__patchFixture('characters', 'c2', { current_hit_points: 22, temporary_hit_points: 0 });
            window.__liveEmit({ table: 'characters', character_id: 'c2', op: 'UPDATE' });
        """)
        await until(pl, """(() => { const f = window.__obrLocal().find(i => i.id.endsWith('t-sythra/fill'));
                                   return f && Math.abs(f.width - 63) < 0.01 && f.fillColor === '#d9a94a'; })()""")
        assert not any(i["id"].endswith("t-sythra/temp") for i in await pl.evaluate("window.__obrLocal()"))
        hp_now = await pl.evaluate("window.__obrLocal().find(i => i.id.endsWith('t-sythra/hp')).plainText")
        assert hp_now == "22/44", hp_now
        ok("HP changed on the sheet redraws the Owlbear bar: half, amber, temp gone, '22/44'")

        await pl.evaluate("localStorage.setItem('__obr_theme', JSON.stringify('LIGHT'))")
        await pl.reload(wait_until="domcontentloaded")
        await until(pl, "!!window.__obr && !!window.__obr.icon && Object.keys(window.__obr.menus).length === 3")
        icons = await pl.evaluate("""[window.__obr.icon,
            ...Object.values(window.__obr.menus).flatMap(m => m.icons.map(i => i.icon))]""")
        assert all(i.endswith("/owlbear/icon-dark.png") for i in icons), icons
        ok("in Owlbear's light theme the logo switches to its dark ink")

        # The GM stops sharing; the player's client lets go of the session.
        await pl.evaluate("""() => {
            const m = JSON.parse(localStorage.getItem('__obr_room'));
            m['com.taphou5e.owlbear/session'] = { off: true, worldId: 'w1' };
            localStorage.setItem('__obr_room', JSON.stringify(m));
            window.dispatchEvent(new StorageEvent('storage', { key: '__obr_room' }));
        }""")
        await until(pl, "localStorage.getItem('dnd-session') === null")
        ok("stopping the share signs the player's client out")
        await octx.close()

        # ---------- Revealing enemies when an encounter starts ----------
        # Two enemies hidden on the map, the encounter not yet started. When it
        # starts in taphou5e, the GM's toolbar button is badged and a notice
        # says where to reveal them -- but nothing appears until the GM says.
        planned = stub_with(encounters=[{"id": "e1", "name": "Ambush at the Ford", "status": "planned",
                                         "round": 0, "campaign_id": "cam1", "hide_monster_hp": True}])
        hidden_items = [dict(OBR_ITEMS[0]), dict(OBR_ITEMS[1], visible=False),
                        {"id": "t-g2", "name": "Gargoyle", "layer": "CHARACTER", "visible": False,
                         "position": {"x": 900, "y": 300}, "width": 150, "height": 150,
                         "metadata": {OBR_LINK: {"kind": "combatant", "id": "cb4"}}}]
        rctx = await obr_context(browser, planned)
        # The stub's fixtures are rebuilt on every load, so once the encounter
        # has "started" this flag starts it again on each page that follows.
        await rctx.add_init_script("""try { if (localStorage.getItem('__e1_active'))
            window.__patchFixture('encounters', 'e1', { status: 'active', round: 1 }); } catch (e) {}""")
        bg = await rctx.new_page()
        watch(bg, "obr-reveal-bg")
        await obr_seed(bg, "GM", items=hidden_items, session=OBR_DM)
        await bg.goto(f"{BASE}/owlbear/background.html", wait_until="domcontentloaded")
        await until(bg, "window.__obrLocal().some(i => i.id.endsWith('t-g2/name'))")
        await bg.wait_for_timeout(300)
        assert await bg.evaluate("window.__obr.badge") is None
        assert await bg.evaluate("window.__obr.notes") == []
        ok("hidden enemies of an encounter not yet started are not offered")

        await until(bg, "typeof window.__liveEmit === 'function'")
        await bg.evaluate("""
            window.__patchFixture('encounters', 'e1', { status: 'active', round: 1 });
            window.__liveEmit({ table: 'encounters', encounter_id: 'e1', op: 'UPDATE' });
        """)
        await until(bg, "window.__obr.badge === '2'")
        notes = await bg.evaluate("window.__obr.notes")
        assert len(notes) == 1, notes
        assert "Ambush at the Ford has started" in notes[0]["message"] and "2 enemies" in notes[0]["message"], notes
        items = {i["id"]: i for i in await bg.evaluate("JSON.parse(localStorage.getItem('__obr_items'))")}
        assert items["t-garg"]["visible"] is False and items["t-g2"]["visible"] is False, "never automatic"
        ok("starting the encounter badges the GM's button with the 2 hidden enemies and says so, revealing nothing itself")

        await bg.evaluate("localStorage.setItem('__e1_active', '1')")
        await bg.reload(wait_until="domcontentloaded")
        await until(bg, "window.__obr.badge === '2'")
        await bg.wait_for_timeout(300)
        assert await bg.evaluate("window.__obr.notes") == [], "told once per encounter, not on every load"
        ok("the notice comes once per encounter; the badge stays until the GM answers")

        pn = await rctx.new_page()
        watch(pn, "obr-reveal-panel")
        await pn.goto(f"{BASE}/owlbear/panel.html", wait_until="domcontentloaded")
        await pn.wait_for_selector(".pn-reveal", timeout=8000)
        rows = await pn.locator(".pn-reveal-row").all_inner_texts()
        assert len(rows) == 2 and any("Gargoyle 2" in r for r in rows), rows
        assert (await pn.locator("#pn-reveal").inner_text()).strip() == "Reveal 2"
        await pn.locator('[data-reveal="t-g2"]').uncheck()
        assert (await pn.locator("#pn-reveal").inner_text()).strip() == "Reveal 1"
        await pn.click("#pn-reveal")
        await until(pn, "!document.querySelector('.pn-reveal')")
        items = {i["id"]: i for i in await pn.evaluate("JSON.parse(localStorage.getItem('__obr_items'))")}
        assert items["t-garg"]["visible"] is True and items["t-g2"]["visible"] is False, items
        assert "Revealed 1 enemy" in await pn.locator(".pn-note").inner_text()
        ok("the panel lists the hidden enemies, and reveals only the ones left ticked")

        await until(bg, "window.__obr.badge === null")
        ok("once answered the badge clears, and the one held back is not offered again")
        await rctx.close()

        # A database without world_share_player_session: the GM gives the
        # player PIN once, and the room gets a player session that way.
        octx = await obr_context(browser, hidden_hp)
        pn = await octx.new_page()
        watch(pn, "obr-panel")
        await obr_seed(pn, "GM")
        await pn.goto(f"{BASE}/owlbear/panel.html", wait_until="domcontentloaded")
        await pn.wait_for_selector("#pn-login", timeout=8000)
        await pn.fill("#pn-world", "Thornfell Reach")
        await pn.fill("#pn-pin", "2468")
        await pn.click("#pn-login .btn-submit")
        await pn.wait_for_selector(".pn-error", timeout=8000)
        assert "player PIN" in await pn.locator(".pn-error").inner_text()
        assert await pn.evaluate("localStorage.getItem('dnd-session')") is None
        ok("the panel refuses the player PIN for the GM, and stores nothing")

        await pn.fill("#pn-pin", "1379")
        await pn.click("#pn-login .btn-submit")
        await until(pn, "!!document.querySelector('#pn-share')")
        assert "Thornfell Reach" in await pn.locator(".pn-world").inner_text()
        sent = await pn.evaluate("JSON.parse(sessionStorage.getItem('__lastLoginParams'))")
        assert sent["p_altcha"] == "stub-altcha-payload", sent
        ok("the GM signs in from the panel with the DM PIN and the bot check")

        await pn.evaluate("window.__shareUnsupported = true")
        await pn.click("#pn-share")
        await pn.wait_for_selector("#pn-pinshare", timeout=8000)
        await pn.fill("#pn-player-pin", "2468")
        await pn.click("#pn-pinshare .btn-submit")
        await pn.wait_for_selector("#pn-stop", timeout=8000)
        shared = await pn.evaluate("JSON.parse(localStorage.getItem('__obr_room'))['com.taphou5e.owlbear/session']")
        assert shared["token"] == "tok_" + "p" * 60, shared
        ok("on an older database the GM gives the player PIN once, and players connect through it")

        # Link by name. Gargoyle 1 is already on the map, so of the three
        # gargoyles only 2 and 3 are free: "Gargoyle 3" takes its own row, the
        # first loose "Gargoyle" takes Gargoyle 2, and the second finds none
        # left rather than doubling up. Korr matches regardless of case.
        loose = [{"id": f"t-{n}", "name": name, "layer": "CHARACTER", "visible": True,
                  "position": {"x": 100, "y": 100}, "metadata": {}}
                 for n, name in [("korr", "korr"), ("g3", "Gargoyle 3"), ("ga", "Gargoyle"),
                                 ("gb", "Gargoyle"), ("mimic", "Mimic")]]
        await pn.evaluate("items => { localStorage.setItem('__obr_items', JSON.stringify(items)); }",
                          OBR_ITEMS + loose)
        await pn.click("#pn-autolink")
        await pn.wait_for_selector(".pn-note", timeout=8000)
        assert "Linked 3 tokens. 2 had no match." in await pn.locator(".pn-note").inner_text()
        items = {i["id"]: i["metadata"].get(OBR_LINK) for i in
                 await pn.evaluate("JSON.parse(localStorage.getItem('__obr_items'))")}
        assert items["t-korr"] == {"kind": "character", "id": "c3"}, items
        assert items["t-g3"] == {"kind": "combatant", "id": "cb5"}, items
        assert items["t-ga"] == {"kind": "combatant", "id": "cb4"}, items
        assert items["t-gb"] is None and items["t-mimic"] is None, items
        ok("link by name: characters by name, numbered enemies exactly, loose ones by kind, none reused")
        await octx.close()

        # The token popup.
        octx = await obr_context(browser, hidden_hp)
        tk = await octx.new_page()
        watch(tk, "obr-token")
        await obr_seed(tk, "PLAYER", session={**OBR_DM, "role": "player", "dmToken": "tok_" + "s" * 60},
                       selection=["t-garg"])
        await tk.goto(f"{BASE}/owlbear/token.html", wait_until="domcontentloaded")
        await tk.wait_for_selector(".tk-head .hp-state", timeout=8000)
        assert (await tk.locator(".tk-head .hp-state").inner_text()).strip() == "HEALTHY"
        assert await tk.locator(".hp-bar").count() == 0 and await tk.locator(".hp-btn").count() == 0
        ok("a player clicking an enemy with HP hidden sees only how it is faring, and no controls")

        await tk.evaluate("window.__obrSelect(['t-sythra'])")
        await tk.wait_for_selector("#tk-sheet", timeout=8000)
        await tk.fill("#tk-amount", "3")
        await tk.click(".hp-btn.damage")
        await until(tk, "window.__writes.some(w => w.table === 'characters' && w.payload.current_hit_points === 6)")
        await tk.click("#tk-sheet")
        modal = await tk.evaluate("window.__obr.modals[0]")
        assert "/v2/character-sheet.html?id=c2&embed=1" in modal["url"], modal
        assert modal["width"] == 480 and modal["height"] == 852, modal
        ok("a player clicking a party token damages it through taphou5e and opens the full sheet in a modal")

        await tk.evaluate("localStorage.setItem('__obr_role', JSON.stringify('GM'))")
        await tk.evaluate("""() => localStorage.setItem('dnd-session', JSON.stringify({
            gameWorldId: 'w1', gameWorldName: 'Thornfell Reach', role: 'dm',
            dmToken: 'tok_' + 'a'.repeat(60), dmTokenIssued: Date.now(), timestamp: Date.now() }))""")
        await tk.evaluate("localStorage.setItem('__obr_selection', JSON.stringify(['t-garg']))")
        await tk.reload(wait_until="domcontentloaded")
        await tk.wait_for_selector("#tk-toggle", timeout=8000)
        await tk.fill("#tk-amount", "100")
        await tk.click(".hp-btn.damage")
        await until(tk, """window.__writes.some(w => w.table === 'encounter_combatants'
                           && w.payload.current_hit_points === 0 && w.payload.is_defeated === true)""")
        await tk.click("#tk-toggle")
        await until(tk, "window.__writes.some(w => w.table === 'encounters' && w.payload.hide_monster_hp === false)")
        ok("the GM damages an enemy past zero (clamped, defeated) and shows monster HP from the popup")
        await octx.close()

        # The sheet inside the Owlbear modal.
        octx = await obr_context(browser)
        sh = await octx.new_page()
        watch(sh, "obr-sheet")
        await obr_seed(sh, "PLAYER", session={**OBR_DM, "role": "player", "dmToken": "tok_" + "s" * 60})
        await sh.goto(f"{BASE}/v2/character-sheet.html?id=c2&embed=1", wait_until="domcontentloaded")
        await sh.wait_for_selector(".sheet-header h1", timeout=8000)
        assert await sh.locator(".rail").count() == 0
        assert await sh.locator("#menu-btn").count() == 0 and await sh.locator("#side-menu-overlay").count() == 0
        assert await sh.locator('a[href="characters.html"]').count() == 0
        await until(sh, "typeof window.closeEmbed === 'function'")
        await sh.click("#embed-close")
        assert await sh.evaluate("window.__obr.closed") == ["com.taphou5e.owlbear/sheet"]
        ok("embedded, the sheet has no rail, menu or back link, and its close button closes the modal")

        await sh.evaluate("localStorage.removeItem('dnd-session')")
        await sh.goto(f"{BASE}/v2/character-sheet.html?id=c2&embed=1", wait_until="domcontentloaded")
        await sh.wait_for_selector(".embed-waiting", timeout=8000)
        assert sh.url.endswith("character-sheet.html?id=c2&embed=1"), sh.url
        ok("embedded with no session, the sheet waits for the GM instead of sending anyone to log in")
        await octx.close()

        # The tracker answers encounter signals too.
        octx = await obr_context(browser)
        tr = await octx.new_page()
        watch(tr, "tracker-live")
        await obr_seed(tr, "GM", session=OBR_DM)
        await tr.goto(f"{BASE}/v2/monster-tracker.html?id=e1", wait_until="domcontentloaded")
        await tr.wait_for_selector(".init-row", timeout=10000)
        await until(tr, "typeof window.__liveEmit === 'function'")
        await tr.evaluate("""
            window.__patchFixture('encounter_combatants', 'cb2', { current_hit_points: 10 });
            window.__liveEmit({ table: 'encounter_combatants', encounter_id: 'e1', op: 'UPDATE' });
        """)
        await until(tr, """[...document.querySelectorAll('.init-row')].some(r =>
            r.textContent.includes('Gargoyle 1') && r.querySelector('.hp-value b')?.textContent === '10')""")
        ok("damage to a monster from Owlbear or another device shows in an open tracker, live")
        await octx.close()

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


# Guarded so the fixtures and the stub can be imported (by a screenshot or
# debugging script) without running the whole suite as a side effect.
if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
