# mystats.pro

A lightweight, GitHub Pages–friendly basketball stat site for your teams and players.  
Mobile-first with light/dark modes and no build step required.

## 🚀 Quick start
1. Download this folder as a ZIP and extract it.
2. Create a new GitHub repository named `mystats.pro` (or any name).
3. Upload the contents to the repo root.
4. Enable GitHub Pages for the repo (Settings → Pages → Deploy from branch → `main`/`docs`).
5. Visit your site.

## 🧱 Structure
```
/assets            # logos & player images (placeholders included)
/css/style.css     # theme & layout
/data/teams.json   # team config (names, colors, CSVs, roster)
/data/players.json # player config (numbers, positions, CSVs)
/js/app.js         # shared utilities (theme, CSV parser, averages)
/js/team.js        # team page logic (record, gamelog)
/js/player.js      # player page logic (averages, gamelog, filters)
index.html         # teams hub
team.html          # dynamic team page (?team=slug)
player.html        # dynamic player page (?player=slug)
```

## 🖼️ Assets
Put your logos and player photos into `/assets` and update the filenames in `data/*.json` if needed.

## 🗂️ Data
Team pages read from your Google Sheet **team tab** (published CSV). Columns expected:
- `date, team1, team2, score_team1, score_team2, winner, loser, season`

Player pages read from your **player tab** CSV with columns:
- `date, position, team, opponent, min, fg, fga, 3p, 3pa, ft, fta, or, dr, totrb, ass (or hock ass), pf, st, bs, to, pts`

> **Note on shooting %**: We compute FG%, 3P%, FT% correctly as weighted rates:  
> FG% = sum(FG)/sum(FGA), 3P% = sum(3P)/sum(3PA), FT% = sum(FT)/sum(FTA).

## 👥 Roster & Routing
- Edit `/data/teams.json` to set team colors (light/dark), CSV URLs, and roster (list of player slugs).
- Edit `/data/players.json` to add players, their numbers/positions, image filename, teams, and CSV URL.
- Player slugs must match entries in `teams.json` roster to appear on team pages.

## 🔎 Search
Top header search lets you type a team or player name and hit **Enter** to jump to that page.

## 🌓 Dark Mode
Toggle in the top-right; preference is saved in `localStorage`.

## 🧮 Season vs Career
- On player page, use the **Career** or **Season** tab.  
- Season = calendar year group parsed from `date`. You can refine this by adding a `season` column to player sheets and adapting `player.js` if you prefer league-season logic.

## 🛠️ Customisation
- Styling: edit `css/style.css`. Per-team color theming is applied on `team.html` by reading `teams.json`.
- Add additional KPIs or columns in `js/player.js`.

## 📌 Notes
- Some players currently have placeholder CSV URLs (e.g., Codey Nowland). Add their Google Sheet CSV links when ready.
- If a player plays on multiple teams, use the **Team** dropdown on the player page to filter their logs.
- If `totrb` is missing, we fallback to `or + dr`.

## ⚠️ CORS
Google-published CSVs load fine on GitHub Pages. Ensure each sheet is **“Published to the web” → CSV**.

---

Built for Kyle & teammates. Enjoy!