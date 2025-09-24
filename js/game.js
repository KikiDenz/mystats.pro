import { initTheme } from './app.js';  // if initTheme lives here; otherwise remove this line

// Published CSV for the Index tab
const INDEX_CSV =
  "https://docs.google.com/spreadsheets/d/15zxpQZJamQfEz07qFtZAI_738cI2rjc2qrrz-q-8Bo0/export?format=csv&gid=0";

const qs = new URLSearchParams(location.search);
const gameId = qs.get("game_id");

// ---------- tiny CSV loader (good enough for our data: no embedded commas/quotes) ----------
async function fetchCsvRows(url) {
  const res = await fetch(url, { cache: "no-store" });
  const text = await res.text();
  // split into rows and columns
  const rows = text
    .trim()
    .split(/\r?\n/)
    .map(line => line.split(",").map(s => s.trim()));
  return rows;
}

// convert array rows to objects using a header row
function rowsToObjects(rows, headerRowIndex = 0) {
  const headers = rows[headerRowIndex].map(h => h.trim().toLowerCase());
  const out = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i];
    if (!r || r.length === 0) continue;
    // skip completely blank lines
    if (r.every(cell => !cell)) continue;
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    out.push(obj);
  }
  return out;
}

function fmt(v) {
  return v === undefined || v === null || v === "" ? "—" : v;
}

async function init() {
  // optional theme init (remove if not used in your project)
  try { initTheme && initTheme(); } catch (_) {}

  if (!gameId) {
    document.getElementById("game-header").textContent = "No game_id given";
    return;
  }

  // 1) Load Index CSV and find this game
  const indexRows = await fetchCsvRows(INDEX_CSV);
  const indexObjs = rowsToObjects(indexRows, 0); // Index has headers on the first row

  const entry = indexObjs.find(r => (r.game_id || "").trim() === gameId);
  if (!entry) {
    document.getElementById("game-header").textContent = `Game not found: ${gameId}`;
    return;
  }

  // 2) Load the per-tab CSV by url from the index
  const gameCsvUrl = entry.csv_url;
  const rawRows = await fetchCsvRows(gameCsvUrl);

  // Detect META row on first line; if present, headers are on the second line
  let headerRowIndex = 0;
  if (rawRows.length > 0 && (rawRows[0][0] || "").toUpperCase() === "META") {
    headerRowIndex = 1;
  }

  const players = rowsToObjects(rawRows, headerRowIndex);

  // 3) Render header
  document.getElementById("game-header").innerHTML = `
    <div class="title">${entry.team1_slug} vs ${entry.team2_slug}</div>
    <div class="pill">Date: ${fmt(entry.date)}</div>
    <div class="pill">Score: ${fmt(entry.score_team1)} – ${fmt(entry.score_team2)}</div>
  `;

  // 4) Render table
  const tbody = document.getElementById("box-table-body");
  tbody.innerHTML = "";

  const cols = [
    ["player_name", "PLAYER"],
    ["min", "MIN"],
    ["fg", "FG"], ["fga", "FGA"],
    ["3p", "3P"], ["3pa", "3PA"],
    ["ft", "FT"], ["fta", "FTA"],
    ["or", "OR"], ["dr", "DR"], ["totrb", "TRB"],
    ["ass", "AST"], ["st", "STL"], ["bs", "BLK"], ["to", "TOV"],
    ["pf", "PF"], ["pts", "PTS"],
  ];

  // ensure header labels exist in the table (if you build them in JS)
  const thead = document.getElementById("box-table-head");
  if (thead && !thead.dataset.built) {
    thead.innerHTML = `<tr>${cols.map(([,label]) => `<th>${label}</th>`).join("")}</tr>`;
    thead.dataset.built = "1";
  }

  players.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = cols.map(([key]) => `<td>${fmt(p[key])}</td>`).join("");
    tbody.appendChild(tr);
  });
}

init();
