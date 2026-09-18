# v2 smoke test

A Playwright pass over v2: login, hub, roster, character sheet, theming,
campaigns, the compendium, the encounter tracker, responsive behaviour and the
version router. 307 assertions.

It injects a **stub Supabase client** before any page script runs and asserts
against fixtures, rather than hitting the live database. Two reasons: the tests
stay deterministic and touch no production data, and they run in sandboxes where
`cdn.jsdelivr.net` and `supabase.co` are blocked by network policy. The server
side is verified separately by the SQL checks in the migration history.

## Running

```sh
pip install playwright
python3 -m http.server 8777 &          # serve the repo root
python3 v2/test/smoke.py
```

If the bundled Chromium does not match the installed Playwright version, point
at it directly — edit `CHROME` at the top of the file, or run
`playwright install chromium`.

## What it covers

- DM and player login, including that the DM token is sent as `x-dm-token`
  and that a player is never issued one
- Role-gated navigation (DM panel hidden from players)
- The single HP component: values, temp segment, thresholds matching v1, and
  that a bar is two elements rather than one per hit point
- Derived stats (passive perception), status tags, text escaping
- Light and dark themes, including re-marking the control after the shell
  rebuilds `document.body`
- 390px: no horizontal scroll, 2-up roster, drawer open/Escape-close
- 900px+: 4-up roster, sidebar
- The roster: ordering, the needs-attention count, links into the sheet
- The sheet: derived modifiers and saves, expertise counted twice, passive
  perception from the skill row, HP damage/heal/apply with clamping, death saves
  appearing at 0 HP, condition toggles preserving existing conditions, long rest
  restoring HP and resetting slots, and the detail pane
- That rest buttons appear exactly once per viewport (rail above 900px, body below)
- Campaigns: the list and its counts, the seven-tab detail, nested areas, beat
  checks with their DC and secret marker
- Party membership: the picker excluding characters already in the campaign,
  inserts carrying `game_world_id`, and re-adding a former member updating their
  row rather than inserting a duplicate
- Reveal flags: the DM-facing hidden/visible markers and the writes they make
- The player view: no DM notes, no editing actions, no reveal toggles
- The compendium: SRD search, stat block normalisation (array armor class,
  fractional CR), the index being fetched once rather than per keystroke, adding
  a monster as a reference with only changed fields stored as overrides, and
  homebrew writing a stat block so the source check constraint holds
- The tracker: initiative ordering, rolling only the blanks, starting an
  encounter, the turn order skipping downed combatants and wrapping the round,
  conditions persisting, and damage clamping at zero
- **The hit point split**: a player character's HP reads from their character
  record and damage writes to `characters`, while a monster's writes to
  `encounter_combatants`
- `hide_monster_hp`: players see the order and their own party's HP, not the
  monsters'
- Mobile: the login page fitting at 390px with shrunk PIN boxes, cards not
  underlining on hover, topbar actions reachable through the FAB, the compendium
  detail opening as a dismissible bottom sheet, and the FAB hiding above 900px
- Tracker parity: searching the SRD from the tracker, bulk add with per-creature
  rolled hit points, initiative including the dexterity modifier, an unknown SRD
  monster creating its roster row automatically, colour stripes, collapsible
  groups, notes and inline armor class editing
- The DM panel: milestone grants writing level and the pending flag, the
  pre-grant level recorded for the classic wizard, the mode toggle, EXP crossing
  a threshold levelling a character and EXP short of one not, and a player
  reaching the page by URL getting nothing to act on
- Check authoring: attaching to exactly one parent, sending only the field the
  check type uses, and refusing an out-of-range DC before it reaches the database
- The root router: opted-in devices go to v2, everyone else stays on classic
- The level-up dialog holding its scroll position when the improvement below
  the fold is stepped, which a rebuild used to reset
- Subclass rows: every one of the 102 carrying its one-line summary, checked
  against what `rules.js` holds rather than against a guessed-at word
- The starting kit: the gear step listing the class and background kit with its
  coin, taking it writing weapons to `weapons` and gear to `inventory_items`
  with the background's gold on the purse, and skipping it writing neither
- Creating above level 1: the row written at level 1 hit points and flagged,
  the level-up wizard opening for the levels above with one hit point choice
  each and the improvements the range owes, and the step behind it saying what
  is still owed if the dialog is closed
- Chapters (formerly storylines): a check showing its success and failure text,
  chapter and beat notes coming from `dm_notes` rather than a column a revealed
  row would hand to players, the summary not being clamped, and edit routes for
  chapters, beats and checks
- The roster being fillable from the campaign, items in the compendium landing
  in a character's inventory, and the desktop sidebar carrying logout
- Selecting text out of a dialog leaving it open, while a press that starts and
  ends on the backdrop still dismisses
- Typing into a number field: the level keeping focus per keystroke (a redraw
  there closes the keyboard on a phone), a two-digit level being enterable at
  all, clamping happening on blur rather than mid-word, and an empty field
  blocking the step in place rather than through a redraw
- Pre-filled number fields replacing on focus rather than appending, and text
  fields deliberately not doing so

A note on measuring this: clicking an already-focused element fires no
`focusin`, so a test that clicks and types twice measures nothing. Blur between
the passes or the select-on-focus behaviour is never exercised.
- The login page opening on the join form alone, and the segmented control
  swapping the two rather than only revealing one (`.login-card` sets
  `display: flex`, which beats the UA's `[hidden] { display: none }`)
- The deliberate switches to v2 surviving a turned-off prompt: the classic
  sidebar item and the login page button, both opting the device in
- The logo decoding on the v2 login screen and sitting before the wordmark in
  the sidebar, and no page carrying a background image behind it
- The invite on both classic screens: the login page, and the home screen for a
  device that still has a session (waiting for that screen rather than firing
  over the redirect), plus each answer's consequence — "not now" recording
  when we asked without choosing classic, staying away on the next load,
  returning after a week, the checkbox stopping it for good, and "try it"
  opting the device in so the router takes over
- The sheet's write paths, which did not exist: spell slots spent by tap and
  restored by hold, the prepared toggle, adding a spell prefilled from the SRD,
  an out-of-range spell level refused before it reaches the database, item
  quantity stepping (and the last one dropping the item), currency refusing
  negatives and saving every coin type, an SRD weapon's damage filling itself,
  feature charges in both directions, and a details field being edited
- That none of the inline controls on a row open the detail pane behind it,
  which is what would make all of them useless
- The attack list drawing on both tables: an equipped inventory weapon showing
  as an action and an unequipped one not, its damage resolved from the SRD by
  name (there is no column for it), equipped sorting first without hiding
  unequipped weapons, and a weapon's own equipped flag being settable
- Press-and-hold card menus: a normal tap still opening the card, a hold
  opening the menu, the synthesised click afterwards *not* following the card's
  link, and a hold that moves being treated as a scroll
- Every `data-kind` the campaign detail resolver handles, since they share one
  code path: storyline, NPC, roster monster and party member
- Deleting a character refusing anything but the typed name, and accepting it
  with different case and surrounding spaces
- Action crowding: a page over three actions keeping the + menu on desktop with
  an empty topbar, a page under it still using the topbar, and the menu's rows
  all being one width inside one bordered panel
- Deleting a campaign or an encounter: what the confirmation says cascades, and
  the delete write itself surviving the redirect back to the list
- Encounter sharing: a ten-character code, the dialog saying what travels, an
  unknown code refused before anything is created, a lower-case code with stray
  spaces still importing, and an import creating the roster monsters the recipe
  needs, at full health with their colour and group intact
- The rules constants v2 copies out of v1's `app.js` still matching it, compared
  as text so a silent drift fails the suite
- Character creation: the wizard naming what blocks it, racial bonuses shown on
  the scores before saving, standard array using each number once, point buy's
  27-point budget (and 14 to 15 costing two points, not one), the Half-Elf
  choice v1 never asked for, and the five scaffolding tables being seeded
- That the shared engine ran and wrote **numbers** into `ability_scores` --
  it keys scores by their long names, so short keys would write `undefined`
  over all six
- Levelling: a multi-level grant opening as one run, one hit point choice per
  level gained, steps that do not apply skipping themselves, and the finish
  writing level, proficiency, hit dice, the hit point gain on both current and
  maximum, class *and* subclass features, and clearing the pending flag
- The analytics dashboard: the sign-in gate holding the page back until a
  session exists, the six sections rendering, the worlds table joining party
  counts to the campaign counts the RPC returns, sorting redrawing the table
  alone, the level distribution keeping its axis order, and 390px having no
  horizontal overflow
- That the dashboard shows campaign **numbers** and never campaign **content**:
  the fixture's campaign name, read-aloud line and DM note appear nowhere in
  the rendered markup, so swapping `analytics_overview()` for a direct table
  read fails the suite
- That a refused `analytics_overview()` locks only the campaign section and
  leaves every other section rendering
- That a magnitude bar set uses one hue: colouring class or level bars by
  value would claim the colour means something, and it does not
- The Support menu on both the desktop sidebar and the mobile drawer: the
  coffee link being a real anchor with `target=_blank` and `rel=noopener` (a
  button calling `window.open` would be blocked, since the menu closes before
  the action runs), the drawer closing before the panel opens, and the form
  naming the world, role and page it is about to send before anything is typed
- What a submitted report actually carries: the typed fields, the promised
  context, **no** character or campaign content, and **no** `is_read` or
  `is_archived` — those are pinned by the insert policy, and the client is not
  trying to set them either
- The feedback inbox: the badge counting unread and unarchived only, the open
  list hiding archived reports, marking read and unread moving the badge both
  ways, Archive issuing an *update* rather than a delete, and Restore bringing
  a report back from the Archived tab
- That a report's message renders as text: one fixture carries a `<script>`
  tag, and the page must show it rather than run it

`dnd5eapi.co` is stubbed the same way as the database, so the suite needs no
network at all.

The stub serves the same `<table>_single` row whatever id the page asked for, so
a test needing a different character on the sheet injects its own stub with
`stub_with(characters_single=...)` in a fresh context rather than steering the
query. The level-up section does this for Korr.

Recorded writes are mirrored into `sessionStorage`, so an assertion can read
what a page wrote even after the page redirected — importing a shared encounter
and deleting a campaign both navigate away on success. Use
`window.__resetWrites()` rather than assigning to `window.__writes` when a test
wants a clean slate.

The stub returns the same character regardless of the id in the query string, so
the sheet assertions always describe that one fixture even when the test arrived
by clicking a different card.

The stub carries a Supabase `auth` object (`getSession`, `signInWithPassword`,
`signOut`) for the analytics page alone -- the app itself signs in against a
world PIN, not an auth user. `letmein` is the password that works. The
analytics fixtures (`ANALYTICS_WORLDS`, `ANALYTICS_CHARACTERS`,
`ANALYTICS_OVERVIEW`) are deliberately kept out of the base `FIXTURES`: adding
a `game_worlds` list there would change what every other page's un-`single`
read resolves to.
