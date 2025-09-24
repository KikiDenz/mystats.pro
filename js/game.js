import { fetchCsv } from './app.js';

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game_id");


initTheme();  // ensures body class + toggle text sync across pages


// Published CSV for the *Index* tab (not the whole spreadsheet)
const INDEX_CSV = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSGdu88uH_BwBwrBtCZdnVGR1CNDWiazKjW_slOjBAvOMH7kOqJxNtWiNY1l3PIfLZhOyaPH43bZyb2/pub?gid=0&single=true&output=csv";

async function init() {
  if (!gameId) {
    document.getElementById("game-header").textContent = "No game_id given";
    return;
  }

  // 1) Load the index and look up this game
  const indexRows = await fetchCsv(INDEX_CSV); // returns array of objects by header
  const entry = indexRows.find(r => (r.game_id || "").trim() === gameId);
  if (!entry) {
    document.getElementById("game-header").textContent = `Game not found: ${gameId}`;
    return;
  }

  // 2) Use the per-tab CSV URL
  const gameCsvUrl = entry.csv_url;
  const gameRows = await fetchCsv(gameCsvUrl);

  // First row in each game tab is META (we wrote it there with the Python script)
  // And the next row is headers for player lines.
  const meta = gameRows.find(r => (r.date || r.META) === "META") || null;

  // 3) Render header
  document.getElementById("game-header").innerHTML = `
    <div class="title">
      ${entry.team1_slug} vs ${entry.team2_slug}
    </div>
    <div class="pill">Date: ${entry.date}</div>
    ${(entry.score_team1 && entry.score_team2) ? `<div class="pill">Final: ${entry.score_team1} - ${entry.score_team2}</div>` : ""}
  `;

  // 4) Render box tables (split by team_slug)
  const byTeam = {};
  gameRows.forEach(r => {
    if ((r.date || "").toUpperCase() === "META") return; // skip meta
    (byTeam[r.team_slug] ||= []).push(r);
  });

  const wrap = document.getElementById("box-table");
  wrap.innerHTML = "";
  const make = (title, rows) => {
    const div = document.createElement("div");
    div.className = "card";
    div.innerHTML = `
      <div class="title">${title}</div>
      <table class="table">
        <thead><tr>
          <th>PLAYER</th><th>FG</th><th>3P</th><th>FT</th>
          <th>OR</th><th>DR</th><th>TRB</th><th>AST</th><th>STL</th><th>BLK</th><th>TOV</th><th>PTS</th>
        </tr></thead>
        <tbody></tbody>
      </table>`;
    const tb = div.querySelector("tbody");
    rows.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.player_name || r.player_slug}</td>
        <td>${r.fg}/${r.fga}</td>
        <td>${r["3p"]}/${r["3pa"]}</td>
        <td>${r.ft}/${r.fta}</td>
        <td>${r.or}</td><td>${r.dr}</td><td>${r.totrb}</td>
        <td>${r.ass}</td><td>${r.st}</td><td>${r.bs}</td><td>${r.to}</td><td>${r.pts}</td>
      `;
      tb.appendChild(tr);
    });
    return div;
  };

  // Use team slugs from the index row for order
  wrap.appendChild(make(entry.team1_slug, byTeam[entry.team1_slug] || []));
  wrap.appendChild(make(entry.team2_slug, byTeam[entry.team2_slug] || []));
}

init();
