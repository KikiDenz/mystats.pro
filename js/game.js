// js/game.js — standalone (no imports)

// PUBLISHED CSV for the Index tab (gid must be the Index tab's gid)
const INDEX_CSV =
  "https://docs.google.com/spreadsheets/d/15zxpQZJamQfEz07qFtZAI_738cI2rjc2qrrz-q-8Bo0/export?format=csv&gid=0";

// ---------- utils ----------
const $ = (id) => document.getElementById(id);
const fmt = (v) => (v === undefined || v === null || v === "" ? "—" : v);
const toNum = (v) => (Number.isFinite(+v) ? +v : 0);

async function fetchCsvRows(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
  return res
    .text()
    .then((t) =>
      t
        .trim()
        .split(/\r?\n/)
        .map((line) => line.split(",").map((s) => s.trim()))
    );
}

function rowsToObjects(rows, headerRowIndex = 0) {
  const headers = rows[headerRowIndex].map((h) => h.trim().toLowerCase());
  const out = [];
  for (let i = headerRowIndex + 1; i < rows.length; i++) {
    const r = rows[i] || [];
    if (!r.length || r.every((c) => !c)) continue;
    const obj = {};
    headers.forEach((h, idx) => (obj[h] = (r[idx] ?? "").trim()));
    out.push(obj);
  }
  return out;
}

// ---------- renderers ----------
function renderHeader(entry) {
  $("game-header").innerHTML = `
    <div class="title">${fmt(entry.team1_slug)} <span class="muted">vs</span> ${fmt(entry.team2_slug)}</div>
    <div class="pill">Date: ${fmt(entry.date)}</div>
    <div class="pill">Score: ${fmt(entry.score_team1)} – ${fmt(entry.score_team2)}</div>
  `;
}

function renderTable(containerEl, players) {
  const cols = [
    ["player_name", "PLAYER"],
    ["min", "MIN"],
    ["fg", "FG"], ["fga", "FGA"], ["fg_pct", "FG%"],
    ["3p", "3P"], ["3pa", "3PA"], ["3p_pct", "3P%"],
    ["ft", "FT"], ["fta", "FTA"], ["ft_pct", "FT%"],
    ["or", "OR"], ["dr", "DR"], ["totrb", "TRB"],
    ["ass", "AST"], ["st", "STL"], ["bs", "BLK"], ["to", "TOV"],
    ["pf", "PF"], ["pts", "PTS"],
  ];

  // table skeleton
  const table = document.createElement("table");
  table.className = "table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr>${cols.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  const tbody = document.createElement("tbody");

  // rows
  players.forEach((p) => {
    const fgPct = p.fga > 0 ? ((p.fg / p.fga) * 100).toFixed(1) : "";
    const tpPct = p["3pa"] > 0 ? ((p["3p"] / p["3pa"]) * 100).toFixed(1) : "";
    const ftPct = p.fta > 0 ? ((p.ft / p.fta) * 100).toFixed(1) : "";

    const row = { ...p, fg_pct: fgPct, "3p_pct": tpPct, ft_pct: ftPct };
    const tr = document.createElement("tr");
    tr.innerHTML = cols.map(([k]) => `<td>${fmt(row[k])}</td>`).join("");
    tbody.appendChild(tr);
  });

  // team totals row
  const sum = (k) => players.reduce((a, p) => a + toNum(p[k]), 0);
  const t_fg = sum("fg"), t_fga = sum("fga");
  const t_3p = sum("3p"), t_3pa = sum("3pa");
  const t_ft = sum("ft"), t_fta = sum("fta");
  const totals = {
    player_name: "TEAM TOTALS",
    min: "",
    fg: t_fg, fga: t_fga, fg_pct: t_fga ? ((t_fg / t_fga) * 100).toFixed(1) : "",
    "3p": t_3p, "3pa": t_3pa, "3p_pct": t_3pa ? ((t_3p / t_3pa) * 100).toFixed(1) : "",
    ft: t_ft, fta: t_fta, ft_pct: t_fta ? ((t_ft / t_fta) * 100).toFixed(1) : "",
    or: sum("or"), dr: sum("dr"), totrb: sum("totrb"),
    ass: sum("ass"), st: sum("st"), bs: sum("bs"), to: sum("to"),
    pf: sum("pf"), pts: sum("pts"),
  };
  const trTot = document.createElement("tr");
  trTot.className = "totals";
  trTot.innerHTML = cols.map(([k]) => `<td>${fmt(totals[k])}</td>`).join("");
  tbody.appendChild(trTot);

  table.appendChild(thead);
  table.appendChild(tbody);

  containerEl.innerHTML = "";
  containerEl.appendChild(table);
}

// ---------- main ----------
async function init() {
  try {
    const qs = new URLSearchParams(location.search);
    const gameId = (qs.get("game_id") || "").trim();

    if (!gameId) {
      $("game-header").textContent = "No game_id given";
      return;
    }

    // 1) find game in Index
    const indexRows = await fetchCsvRows(INDEX_CSV);
    const indexObjs = rowsToObjects(indexRows, 0); // first row is header
    const entry = indexObjs.find((r) => (r.game_id || "").trim() === gameId);
    if (!entry) {
      $("game-header").textContent = `Game not found: ${gameId}`;
      return;
    }

    renderHeader(entry);

    // 2) load per-game CSV
    const gameCsvUrl = entry.csv_url;
    if (!gameCsvUrl) {
      $("game-header").textContent = "No csv_url for this game in Index.";
      return;
    }

    const raw = await fetchCsvRows(gameCsvUrl);
    // detect META row on first line; headers on second
    let headerRowIndex = 0;
    if (raw.length && (raw[0][0] || "").toUpperCase() === "META") headerRowIndex = 1;

    const rows = rowsToObjects(raw, headerRowIndex);

    // 3) filter to player rows (skip any accidental header/meta)
    const players = rows
      .filter((r) => (r.player_name || r.player_slug || "").trim() !== "")
      .map((r) => ({
        player_name: r.player_name || r.player_slug || "",
        min: r.min || "",
        fg: toNum(r.fg),
        fga: toNum(r.fga),
        "3p": toNum(r["3p"]),
        "3pa": toNum(r["3pa"]),
        ft: toNum(r.ft),
        fta: toNum(r.fta),
        or: toNum(r.or),
        dr: toNum(r.dr),
        totrb: toNum(r.totrb),
        ass: toNum(r.ass),
        st: toNum(r.st),
        bs: toNum(r.bs),
        to: toNum(r.to),
        pf: toNum(r.pf),
        pts: toNum(r.pts),
      }));

    renderTable($("box-table"), players);
  } catch (err) {
    console.error(err);
    $("game-header").textContent = `Error: ${err.message}`;
  }
}

document.addEventListener("DOMContentLoaded", init);
