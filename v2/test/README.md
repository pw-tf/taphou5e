# v2 smoke test

A Playwright pass over the v2 shell: login, hub rendering, the HP component,
theme, responsive behaviour and the version router. 25 assertions.

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
- The root router: opted-in devices go to v2, everyone else stays on classic
