# mystats.pro (starter)

Static site that reads published Google Sheets CSV tabs for a local basketball team.
- Team page (`index.html`) shows roster and games from a selected team tab.
- Player page (`player.html?name=Kyle%20Denzin`) shows Averages (career/season/totals/highs), Game Logs, and Bio.

## Where to edit
- `js/team.js` — add/modify team sheet URLs and roster meta (name/number/pos/team and the player's CSV URL).
- `js/player.js` — extend the `PLAYERS` map and add bio fields.
- `css/style.css` — tweak theme tones.
- Images: drop avatars to `/img` and wire them if you want (currently uses emoji placeholder).

## How data is detected
- Numeric stat columns are auto‑detected by sampling rows and ignoring common non‑stat headers. This makes it resilient to column set changes.
- Season detection tries a `Season` column, otherwise derives from a `Date` column year.

## Google Sheets
Use **File → Share → Publish to web** and copy the **CSV** link for each tab (already provided). Caching is disabled in `fetch` for fast updates.

## GitHub Pages
1. Create a new repo `mystats.pro` (or any name).
2. Upload this folder.
3. Enable **Settings → Pages → Deploy from branch**, root `/`.
4. Visit the Pages URL: e.g., `https://<username>.github.io/mystats.pro/`.

## Deep links
- Team page: `/` (select team from dropdown).
- Player pages:
  - `/player.html?name=Kyle%20Denzin`
  - `/player.html?name=Levi%20Denzin`
  - `/player.html?name=Findlay%20Wendtman`
You can also add `&view=logs` or `&view=bio` to switch tab by URL.

## Notes
- The UI includes a Light/Dark toggle.
- Averages view has bubbles for **Career**, **Season**, **Career Totals**, **Game Highs**.
- The per‑season table under Averages mirrors the "game logs" table style but aggregated.
