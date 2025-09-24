// js/game.js
import { fetchCsv, initTheme } from './app.js';  // fetchCsv returns array of objects by header

// --- CONFIG: published CSV for the *Index* tab (not the whole spreadsheet) ---
const INDEX_CSV =
  "https://docs.google.com/spreadsheets/d/15zxpQZJamQfEz07qFtZAI_738cI2rjc2qrrz-q-8Bo0/export?format=csv&gid=0";

// --- helpers ---
const qs = new URLSearchParams(location.search);
const gameId = qs.get("game_id");

const $ = (id) => document.getElementById(id);
const fmt = (v) => (v === undefined || v === null || v === "" ? "—" : v);
const toNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

initTheme(); // keep light/dark mode consistent

async function init() {
  if (!gameId) {
    $("game-header").textContent = "No game_id given";
    return;
  }

  // 1) Look up the game in the Index tab
  let indexRows = [];
  try {
    indexRows = await fetchCsv(INDEX_CSV); // array of objects with headers from Index
  } catch (e) {
    $("game-header").textContent = "Failed to load index CSV.";
    console.error(e);
    return;
  }

  const entry = indexRows.find((r) => (r["game_id"] || "").trim() === gameId);
  if (!entry) {
    $("game-header").textContent = `Game not found: ${gameId}`;
    return;
  }

  // 2) Fetch the game’s own CSV (per-tab csv_url from Index)
  const gameCsvUrl = entry["csv_url"];
  if (!gameCsvUrl) {
    $("game-header").textContent = "Index entry missing csv_url.";
    return;
  }

  let gameRows = [];
  try {
    gameRows = await fetchCsv(gameCsvUrl);
  } catch (e) {
    $("game-header").textContent = "Failed to load game CSV.";
    console.error(e);
    return;
  }

  // 3) Render header from index entry (scores + date + teams)
  renderHeader(entry);

  // 4) Convert rows to player objects (skip rows without a player name/slug)
  const players = gameRows
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

  // 5) Render table with FG% / 3P% / FT%
  renderTable($("box-head"), $("box-body"), players);
}

function renderHeader(entry) {
  const t1 = (entry.team1_slug || "").trim();
  const t2 = (entry.team2_slug || "").trim();
  const d  = (entry.date || "").trim();
  const s1 = entry.score_team1 || "";
  const s2 = entry.score_team2 || "";

  $("game-header").innerHTML = `
    <div class="title">${t1} <span class="muted">vs</span> ${t2}</div>
    <div class="pill">Date: ${fmt(d)}</div>
    <div class="pill">Score: ${fmt(s1)} – ${fmt(s2)}</div>
  `;
}

function renderTable(headEl, bodyEl, players) {
  // We add FG%, 3P%, FT% columns right after their makes/attempts
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

  headEl.innerHTML = `<tr>${cols.map(([, label]) => `<th>${label}</th>`).join("")}</tr>`;
  bodyEl.innerHTML = "";

  players.forEach((p) => {
    // Calculate percentages
    const fgPct = p.fga > 0 ? ((p.fg / p.fga) * 100).toFixed(1) : "";
    const tpPct = p["3pa"] > 0 ? ((p["3p"] / p["3pa"]) * 100).toFixed(1) : "";
    const ftPct = p.fta > 0 ? ((p.ft / p.fta) * 100).toFixed(1) : "";

    const row = {
      ...p,
      fg_pct: fgPct,
      "3p_pct": tpPct,
      ft_pct: ftPct,
    };

    const tr = document.createElement("tr");
    tr.innerHTML = cols.map(([key]) => `<td>${fmt(row[key])}</td>`).join("");
    bodyEl.appendChild(tr);
  });

//TEAM TOTALS
  renderTotalsRow(bodyEl, players, cols);
}

function renderTotalsRow(bodyEl, players, cols) {
  const sum = (k) => players.reduce((a, p) => a + toNum(p[k]), 0);
  const fg = sum("fg"), fga = sum("fga");
  const tp = sum("3p"), tpa = sum("3pa");
  const ft = sum("ft"), fta = sum("fta");

  const totals = {
    player_name: "TEAM TOTALS",
    min: "",
    fg, fga, fg_pct: fga ? ((fg / fga) * 100).toFixed(1) : "",
    "3p": tp, "3pa": tpa, "3p_pct": tpa ? ((tp / tpa) * 100).toFixed(1) : "",
    ft, fta, ft_pct: fta ? ((ft / fta) * 100).toFixed(1) : "",
    or: sum("or"), dr: sum("dr"), totrb: sum("totrb"),
    ass: sum("ass"), st: sum("st"), bs: sum("bs"), to: sum("to"),
    pf: sum("pf"), pts: sum("pts"),
  };

  const tr = document.createElement("tr");
  tr.className = "totals";
  tr.innerHTML = cols.map(([key]) => `<td>${fmt(totals[key])}</td>`).join("");
  bodyEl.appendChild(tr);
}


init();
