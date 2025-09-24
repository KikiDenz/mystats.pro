// js/game.js  — stand-alone, no imports

// 1) Published CSV for the Index tab (gid=0)
const INDEX_CSV =
  "https://docs.google.com/spreadsheets/d/15zxpQZJamQfEz07qFtZAI_738cI2rjc2qrrz-q-8Bo0/export?format=csv&gid=0";

// 2) Helpers
function fmt(v) {
  return v === undefined || v === null || v === "" ? "—" : v;
}

async function fetchCsvRows(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  const text = await res.text();
  // Simple CSV split (works for our data that has no quoted commas)
  return text
    .trim()
    .split(/\r?\n/)
    .map(line => line.split(",").map(s => s.trim()));
}

function rowsToObjects(rows, headerRowIndex = 0) {
  const headers = rows[headerRowIndex].map(h => h.trim().toLowerCase());
  const out = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const row = rows[i] || [];
    if (row.every(c => !c)) continue; // skip blank lines
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (row[idx] ?? "").trim()));
    out.push(obj);
  }
  return out;
}

function ensureSkeleton() {
  // Must exist in game.html:
  // <div id="game-header" class="banner"></div>
  // <div id="box-table" class="section"></div>
  const box = document.getElementById("box-table");
  if (!box) {
    const msg = document.createElement("div");
    msg.textContent = "#box-table container not found in HTML";
    document.body.appendChild(msg);
    return null;
  }
  // Build a table if not present
  if (!box.querySelector("table")) {
    const table = document.createElement("table");
    table.className = "table";
    table.innerHTML = `
      <thead id="box-table-head"></thead>
      <tbody id="box-table-body"></tbody>
    `;
    box.appendChild(table);
  }
  return {
    head: box.querySelector("#box-table-head"),
    body: box.querySelector("#box-table-body"),
  };
}

function renderHeader(entry) {
  const el = document.getElementById("game-header");
  if (!el) return;
  el.innerHTML = `
    <div class="title">${fmt(entry.team1_slug)} vs ${fmt(entry.team2_slug)}</div>
    <div class="pill">Date: ${fmt(entry.date)}</div>
    <div class="pill">Score: ${fmt(entry.score_team1)} – ${fmt(entry.score_team2)}</div>
  `;
}

function renderTable(headEl, bodyEl, players) {
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

  headEl.innerHTML = `<tr>${cols.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  bodyEl.innerHTML = "";

  players.forEach(p => {
    const tr = document.createElement("tr");
    tr.innerHTML = cols.map(([key]) => `<td>${fmt(p[key])}</td>`).join("");
    bodyEl.appendChild(tr);
  });
}

async function init() {
  try {
    const qs = new URLSearchParams(location.search);
    const gameId = qs.get("game_id");

    const headerBox = document.getElementById("game-header");
    if (!gameId) {
      if (headerBox) headerBox.textContent = "No game_id given";
      return;
    }

    const tableRefs = ensureSkeleton();
    if (!tableRefs) return;

    // 1) Load the index
    const indexRows = await fetchCsvRows(INDEX_CSV);
    const indexObjs = rowsToObjects(indexRows, 0); // first row is headers
    const entry = indexObjs.find(r => (r.game_id || "").trim() === gameId);

    if (!entry) {
      if (headerBox) headerBox.textContent = `Game not found: ${gameId}`;
      return;
    }

    renderHeader(entry);

    // 2) Load the specific game CSV via the URL in the index
    const gameCsvUrl =
      entry.csv_url || entry.csv || entry.url || entry.link; // tolerate different header names

    if (!gameCsvUrl) {
      if (headerBox) headerBox.textContent = "No csv_url for this game in Index sheet.";
      return;
    }

    const raw = await fetchCsvRows(gameCsvUrl);

    // detect META on first row; then headers are on the second row
    let headerRowIndex = 0;
    if (raw.length && (raw[0][0] || "").toUpperCase() === "META") {
      headerRowIndex = 1;
    }

    const players = rowsToObjects(raw, headerRowIndex);

    renderTable(tableRefs.head, tableRefs.body, players);
  } catch (err) {
    console.error(err);
    const headerBox = document.getElementById("game-header");
    if (headerBox) headerBox.textContent = `Error: ${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
