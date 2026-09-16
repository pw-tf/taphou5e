# v2 smoke test

A Playwright pass over v2: login, hub, roster, character sheet, theming,
campaigns, responsive behaviour and the version router. 63 assertions.

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
- The root router: opted-in devices go to v2, everyone else stays on classic

The stub returns the same character regardless of the id in the query string, so
the sheet assertions always describe that one fixture even when the test arrived
by clicking a different card.
