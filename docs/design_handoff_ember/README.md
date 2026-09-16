# Handoff: taphou5e — "Ember" modernisation (character + encounter tracker)

## Overview
A visual and layout modernisation of taphou5e's main surfaces: the party roster, the character sheet,
the encounter (monster) tracker, the DM panel, the app shell / side menu, login, and a **new home hub**
that becomes the post-login landing page. Three goals:

1. **Compaction.** A four-person party fits one mobile screen. Roster cards became a 2-up grid on mobile
   and 4-up on desktop; oversized stat type came down, HP came up.
2. **Layout fixes.** One HP bar treatment everywhere (fixed 8 / 10 / 6px rails, mono readout, temp-HP
   inset) — replacing today's 6px roster bar, 8px sheet bar, and the tracker bar that renders one div
   per hit point. The 600px --max-width cap is gone: above 900px the app is a sidebar shell with
   list + detail panes.
3. **Full colour refresh** with light and dark modes — warm parchment / ember, replacing the blue-on-zinc
   dark-only palette.

**Scope: visual + layout only.** No new features. Every control in these references maps to something the
app already does (HP minus / amount / plus / Apply, rest buttons, condition toggles, proficiency toggles,
Simple+Advanced and Full+Compact modes, save/load encounter, the monster details popup, add-monsters with a
count, add party character, leveling-mode toggle, grant level / EXP). The only genuinely new *screen* is the
home hub, and it is links plus summaries of state the app already holds.

## About the design files
Everything in this bundle is a **design reference written in HTML/CSS** — a prototype of the intended look
and layout, not production code to paste in. The task is to recreate these designs in the target codebase
using its own patterns. The current app is static HTML + styles.css + app.js with Supabase from a CDN, but
**the spec deliberately does not assume vanilla**: if you move to a framework, treat tokens.css as the token
source of truth and the class list below as a component inventory. Wiring, data and Supabase changes are
yours; nothing here prescribes them.

## Fidelity
**High fidelity.** Colours, type sizes, spacing, radii and states are final and exact — match them. Where a
reference page shows placeholder data (a party of four, "Ambush at the Ford"), the data is illustrative; the
layout and values around it are not.

---

## Design tokens

tokens.css is a drop-in replacement for the :root block at the top of styles.css. Variable **names match the
existing app** (--bg-primary, --text-secondary, --accent-primary, --hp-high, --space-md, --radius-lg, and so
on) so much of the old stylesheet re-themes without being rewritten.

### Theme mechanism
data-theme="dark" | "light" on the html element; **absent = follow prefers-color-scheme**. The toggle lives in
the side menu (mobile) and the sidebar footer (desktop): Dark / Light / System, persisted under the
localStorage key taphou5e-theme. See theme.js — set the attribute in head before first paint to avoid a flash.

### Colour — dark (default)

| Token | Hex | Use |
|---|---|---|
| --bg-primary | #15110e | page |
| --bg-secondary | #1a1512 | cards, header, sidebar |
| --bg-tertiary | #221b16 | chips, inputs |
| --bg-elevated | #1e1815 | pane sub-panels |
| --bg-hover | #2a211a | hover, active nav, bar track |
| --bg-sunken | #171310 | detail pane ground |
| --border-subtle | #2a221c | hairlines, dividers |
| --border-default | #342b23 | card borders |
| --border-strong | #47392e | inputs, outline buttons |
| --text-primary | #f5efe6 | headings, values |
| --text-secondary | #b6a795 | body |
| --text-tertiary | #8a7b6b | labels, meta |
| --text-muted | #6b5d4f | disabled, footer |
| --accent-primary | #e2703a | ember accent |
| --accent-primary-hover | #f08a56 | accent hover |
| --accent-on | #1b0f08 | ink on accent fills |
| --accent-soft / --accent-soft-border | #2c1a10 / #6b3a1f | active row tint |
| --accent-secondary | #d9a94a | gold (short rest, warnings) |
| --hp-high / --hp-mid / --hp-low | #7fa65c / #d9a94a / #c4452f | HP fills and status text |
| --hp-temp / --hp-temp-text | #3d5a72 / #7aa2c4 | temp-HP segment / the "+5" readout |
| harm chip (damage button) | bg #2c1a15, border #6b2f22, ink #e08a6f | |
| heal chip (heal button) | bg #1c2417, border #3d5c2c, ink #9dc47c | |

### Colour — light

| Token | Hex |
|---|---|
| --bg-primary | #f5efe3 |
| --bg-secondary | #fffaf1 |
| --bg-tertiary | #f7f0e2 |
| --bg-elevated | #f0e4d0 |
| --bg-hover | #ece0cc |
| --border-subtle / default / strong | #ece0cc / #e0d4c0 / #d9b98f |
| --text-primary / secondary / tertiary / muted | #231c15 / #5c4d3f / #6f6252 / #8a7b6b |
| --accent-primary / hover / on | #c85a27 / #ab4a1d / #fffaf1 |
| --hp-high / --hp-mid / --hp-low | #5f9142 / #c79424 / #b83a22 |
| --hp-temp / --hp-temp-text | #7fa5c4 / #3d6d96 |

Contrast: all body and label text meets 4.5:1 against its own surface in both themes. Status words
("HEALTHY", "CRITICAL") are set in the HP colours at 10-11px semibold, which clears 4.5:1 on --bg-secondary
in both themes — do not swap those for alpha-faded versions.

### Typography

| Role | Family | Sizes / weight |
|---|---|---|
| Display: brand, page titles, character + monster names | **Playfair Display** 700 | 30 / 24 / 21 / 19 / 17 / 16px |
| UI: labels, body, buttons, nav | **Inter** 400-600 | 15 / 14 / 13 / 12 / 11px |
| Long-form notes and textareas | **DM Sans** 400 | 12-14px |
| All numbers: HP, AC, modifiers, initiative, PIN | **IBM Plex Mono** 400-600 | 24 / 19 / 17 / 15 / 13 / 12 / 10 / 9px |

Eyebrow labels: mono, 9-10px, letter-spacing .1-.16em, uppercase, --text-tertiary.
Playfair Display, Inter and DM Sans are already loaded by the app; IBM Plex Mono replaces the
SF Mono / Fira Code / Consolas stack so the numeric columns align on every platform.

### Spacing, radius, motion
Spacing 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18 / 20 / 24 / 26 / 32 / 48px. Radius 6 / 8 / 12 / 16 / 9999px.
Transitions 150ms (hover tints), 200ms (HP bar width and colour), 300ms (drawer, theme), all ease.
Shadows only on floating things (drawer, FAB, popovers): 0 8px 24px rgba(12,8,5,.44) dark,
0 8px 20px rgba(80,50,20,.18) light.

### Layout tokens
--header-height 56px (mobile), --header-height-desktop 60px, --tab-bar-height 64px, --sidebar-width 240px,
--rail-width 64px, --sheet-nav-width 212px, --pane-width 400px, --content-max 1360px,
**breakpoint 900px**, HP rails --hp-bar-h 8px, --hp-bar-h-row 10px, --hp-bar-h-inline 6px.

---

## The HP bar (the fix that matters most)

Today there are three different bars, and the tracker renders **one div.health-segment per hit point** (a
41-HP creature is 41 hairline divs; a 300-HP creature is 300). Replace all of them with one component:

```html
<div class="hp">
  <div class="hp-readout">
    <span class="hp-value"><b>9</b><span class="max">/44</span><span class="temp">+5</span></span>
    <span class="hp-state state-low">CRITICAL</span>
  </div>
  <div class="hp-bar">                        <!-- .row = 10px, .inline = 6px -->
    <div class="fill low" style="width:20%"></div>
    <div class="fill temp" style="width:11%"></div>
  </div>
</div>
```

- Track --bg-hover, radius --radius-full, overflow hidden, display flex.
- Fill width = current / max * 100. Colour by the existing thresholds: above 50% high, above 25% mid, else
  low (matches getHpClass). Temp HP is a second .fill.temp segment sized temp / max * 100, drawn after the
  main fill.
- Numbers are mono and never smaller than 12px; the percentage or status word is right-aligned.
- Height never varies with HP total. No per-hit-point segments anywhere.

---

## Screens

### 1. Home hub — index.html (NEW, replaces login as the landing page)
**Purpose:** post-login home. Browse the app — trackers, sheets, reference, tools — and see party state at a
glance. **Login moves to login.html.**

**Layout at 900px and up:** .app-shell = 240px .sidebar + .app-main. .topbar is 60px: page title (Playfair
21/700), a 320px search field, then right-aligned "Long rest" (outline) and "Resume encounter" (accent).
.main-content caps at 1360px, padding 24/26px, sections gapped 24px:

1. .hub-tiles — four equal tiles (radius 12, --bg-secondary, 1px --border-default, padding 14/16px): accent
   15px icon plus 13px/600 title, then a 12px --text-tertiary line. Character sheets, Encounter tracker,
   Compendium, Dice and tools.
2. .party-roster — four character cards (see section 2).
3. Live-encounter summary and DM-panel card, 12px gap.

**Below 900px:** 56px .header (hamburger, title + sub, search), tiles 2-up, roster 2-up, summary below. The
sidebar becomes the drawer. No bottom tab bar here — the tab bar belongs to the character sheet.

**Sidebar:** brand "TAPHOU5E" (Playfair 19/700, letter-spacing .02em), world row (6px green dot, world name
12px, role pill in mono 10px accent with a 1px --border-strong). Nav items 14px/500, 10/12px padding, radius
8, hover --bg-hover; the active item is --bg-hover plus 600 weight and an accent icon. Count and LIVE pills
sit right-aligned in the row. Footer: "Dave / DM" and the Dark|Light segmented control.

### 2. Party roster — characters.html
**Purpose:** pick a character; read party health without scrolling.

**Card** (.character-card, radius 12, --bg-secondary, 1px --border-default, padding 12px mobile / 14px
desktop, 10px internal gap, hover to --bg-elevated with --border-strong):

- **Top row:** 30/34px avatar (radius 8, --bg-elevated, 1px --border-strong, Playfair 15/16px accent initial),
  then name (13/14px 600, ellipsis) over meta ("Lv 5 Fighter / Dave", 10/11px --text-tertiary, ellipsis), then
  an optional status tag (10px/600 pill: warning tint for conditions, accent tint for a pending level-up).
- **HP block** exactly as specified above (8px rail).
- **Chip line:** four equal .chip elements — AC, IN, SP, PP — on --bg-tertiary, radius 6-7, mono 13px value
  plus a 9px --text-tertiary label. Mobile may drop SP to keep three chips legible at 2-up.

**Grid:** repeat(2, 1fr) with 10px gap below 900px; repeat(4, 1fr) with 12px gap above. Four players fill one
mobile screen with no scroll. The old stacked full-width card is gone.

### 3. Character sheet — character-sheet.html
**Purpose:** play from one screen — HP and combat first, then abilities, skills, actions.

- **Sticky .sheet-header** (--bg-secondary, bottom 1px --border-default): a 52px identity row (back button,
  Playfair 16/700 name plus an "LV 5" mono badge, hamburger), then the combat block — large HP readout (mono
  24/600 current, 14px max, status word right-aligned), the 8px bar, .hp-ctl (46x36 damage minus button in the
  harm tint, a flexible mono amount input, 46x36 heal plus button in the heal tint, accent "Apply"), then a
  five-chip line AC / INIT / SPD / PROF / PP. Hit targets are at least 36px tall, 44px+ on the tab bar.
- **Body:** eyebrow label plus hairline section heads. .ability-grid is 3 columns on mobile, 6 on desktop;
  each .ability-box holds a 9px label, the score in mono 17/600, and a right-aligned modifier (accent 13px)
  over the save ("S +7", 10px mono, --hp-high when proficient) — this merges the old separate Saving Throws
  section. .skills-grid is 1 column on mobile, 2 on desktop, 2px gaps; a row is an 8px proficiency dot, name
  13px, ability 10px mono, modifier mono 14px right-aligned; proficient rows take --accent-soft. Conditions
  are 12px pills with 5px gaps, active in the warning tint. Rest row: Short (gold outline), Long (accent
  outline), hit-dice chip.
- **Mobile nav:** the six-item bottom tab bar stays — 64px, --bg-secondary, 19px icons over 10px labels,
  active in accent 600. **At 900px and up** the tab bar hides and becomes .sheet-nav (a 212px rail: name, mini
  HP, six tab rows, rest buttons pinned to the bottom), and the body becomes .split = list plus a 400px
  .pane. Tapping a skill, weapon, spell or item fills the pane; below 900px that pane is a bottom sheet. This
  is where the existing detail popups live now.

### 4. Encounter tracker — monster-tracker.html
**Purpose:** run combat — read initiative order, adjust HP fast, check a stat block.

- **Shell:** a 64px icon .rail (no labels; the tracker wants the width) plus .topbar: encounter name (Playfair
  21/700), the Simple|Advanced and Full|Compact segmented controls (existing modes), then right-aligned Save
  encounter, Load encounter, and an accent "+ Add monsters".
- **.init-row** (radius 12, --bg-secondary, 1px --border-default, padding 12/14px, 14px gaps), columns left to
  right: initiative block (40px: mono 19/600 over a 9px "INIT" label), identity (180px: name 15/600 plus a
  sub-line with "AC 17" in mono 11px and a status word in the HP colour), HP rail (flex, 10px), total (70px,
  right-aligned, mono 15px), actions (damage minus 32x30, a 58px mono amount input, heal plus).
  The active turn takes an --accent-soft background with --accent-soft-border and an accent initiative number.
  Party members get border-left 3px solid var(--hp-temp). Dead combatants drop to 0.55 opacity on --bg-sunken
  with a struck-through name and no controls — replacing today's grayscale filter. Encounter groups keep the
  collapsible Playfair 17px header.
- **.pane (400px):** the monster details popup, re-housed — eyebrow "Stat block", Playfair 21px name, italic
  12px flavour line, the AC/HP/Speed trio, a six-column ability strip, accent trait names with 12px/1.55 copy,
  and the DM notes textarea pinned at the bottom. Below 900px it is a bottom sheet opened from the monster
  name, as today.

### 5. DM panel — dm-panel.html
Topbar: title, the Milestone|EXP segmented control (accent active), "Grant level to party". Body: eyebrow plus
rule, then .dm-row items (radius 12, --bg-secondary, 1px --border-default, padding 12/14px): name 15/600 and
meta 12px --text-tertiary, an "LV 5" mono badge (1px --border-strong, radius 6, 4/10px padding), and a "Grant
level" button — accent outline normally, filled accent when that character is due. EXP mode swaps the badge
for an EXP bar (the same .hp-bar component with an accent fill) and the button for an amount field plus Grant.

### 6. App shell / side menu
.side-menu-overlay is rgba(10,7,5,.6); the drawer is 288px (max 82vw) on --bg-secondary with a right border of
1px --border-default, animating transform translateX(-100%) to 0 over 300ms ease. Escape and backdrop click
close it; body scroll locks while open. Header is brand plus world plus role pill. Items are 14px/500 with
12px padding, 8px radius, 11px gap, hover --bg-hover; the destructive item uses --danger.
**Appearance section:** an eyebrow label plus the Dark / Light / System segmented control — this is the theme
toggle. Same item set as today, plus Overview.

### 7. Login — login.html
A centred 440px column on --bg-primary. Header: "TAPHOU5E" in Playfair 30/700 with letter-spacing .04em plus a
13px tagline, over a bottom hairline. Join|Create segmented control. .login-card (radius 14, --bg-secondary,
1px --border-default, padding 20px, 18px gaps): labelled text input (11/12px padding, radius 8, --bg-tertiary,
accent border on focus), a PIN row of four 56px-tall mono-22px inputs (radius 12, 10px gap; the focused cell
takes --border-strong), a remember-me checkbox with accent-color var(--accent-primary), a full-width accent
submit (14px vertical padding, 15px/600), and the 12px switch-mode line. Footer hairline plus 11px
--text-muted credit. The theme control sits under the card so it is reachable before login.

---

## Interactions and behaviour
Nothing new. Transition durations: 150ms on hover and press tints, 200ms on HP bar width and colour, 300ms on
the drawer and the theme swap. prefers-reduced-motion: reduce disables all of it (already in ember.css).
Focus: a 1px accent border on inputs, and keep a visible focus ring on every interactive element — the current
build has none, so add :focus-visible outlines in the accent colour while you are in there.

## Responsive rules
- **Below 900px:** single column, 56px sticky header, hamburger drawer, bottom tab bar on the sheet, roster and
  tiles 2-up, ability grid 3-up, skills 1-up, detail panes as bottom sheets.
- **900px and up:** a 240px labelled sidebar (or the 64px rail on tracker and sheet), 60px topbar, no tab bar,
  content capped at 1360px, roster and tiles 4-up, ability grid 6-up, skills 2-up, .split list plus 400px pane.
- **1200px and up:** wider page padding only.
- Nothing is pinned to a fixed pixel width except the panes and rails; every text container reflows.

## State
One addition only: theme = "dark" | "light" | "system", persisted in localStorage under taphou5e-theme and
applied as data-theme on the html element before first paint. Everything else is the app's existing state.

## Assets
No new image assets. Icons are the app's existing inline Lucide-style SVG paths, copied verbatim from
characters.html, monster-tracker.html and sidemenu.js (hamburger, back, refresh, search, bar-chart, user,
monster, dice, document, star, sword, bag, trash, logout, plus). Fonts come from Google Fonts — add IBM Plex
Mono to the existing link. taphou5e.png and icon.svg are unchanged.

## Files in this bundle

| File | What it is |
|---|---|
| tokens.css | the token sheet, light + dark, drop-in for the :root block |
| ember.css | component reference stylesheet (shell, HP bar, cards, rows, panes, menu, login) |
| theme.js | theme switch (data-theme + localStorage, no flash) |
| index.html | home hub (new landing page) |
| characters.html | party roster grid |
| character-sheet.html | character sheet, Stats + Skills with tab rail and detail pane |
| monster-tracker.html | encounter tracker, initiative rows and stat-block pane |
| dm-panel.html | DM panel |
| login.html | login |
| mockups/Modernised taphou5e.dc.html | the full annotated mockup (desktop + mobile, both themes) |
| mockups/Current UI (recreation).dc.html | pixel recreation of today's UI, for before and after |

Open the reference pages directly in a browser and resize past 900px to see both shells. The two files in
mockups/ are design canvases: they show every screen side by side at device size and are the authority where a
reference page and this README disagree.

## Suggested order of work
1. Swap the :root block for tokens.css, add theme.js and the side-menu Appearance control, add IBM Plex Mono.
   The app should re-theme wholesale before any markup moves.
2. Replace the three HP bar implementations with the single .hp component — this deletes the per-hit-point
   segment loop in renderMonsters.
3. Roster: re-render renderRoster() as the compact card, grid it 2-up / 4-up, drop the 600px cap.
4. Character sheet: sticky combat header, ability and save merge, skills grid; keep the bottom tabs.
5. Shell: sidebar, rail and .split panes above 900px; move the existing detail popups into panes.
6. Tracker: the .init-row layout plus the stat-block pane.
7. DM panel, login, then the new hub page.
