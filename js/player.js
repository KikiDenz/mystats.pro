import { CSV, $, $all, renderTable, bindThemeToggle, groupBy, sum, avg, maxBy, toNum } from "./util.js";

// Map player name to their CSV and metadata
const PLAYERS = {
  "Kyle Denzin": {
    number: 22, pos: "G", team: "Sweaty Already",
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=0&single=true&output=csv",
    bio: { Height:"—", Weight:"—", College:"—", Country:"Australia", Wingspan:"—", Birthday:"—" }
  },
  "Levi Denzin": {
    number: 28, pos: "G/F", team: "Sweaty Already",
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=2091114860&single=true&output=csv",
    bio: { Height:"—", Weight:"—", College:"—", Country:"Australia", Wingspan:"—", Birthday:"—" }
  },
  "Findlay Wendtman": {
    number: 1, pos: "F", team: "Sweaty Already",
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=863688176&single=true&output=csv",
    bio: { Height:"—", Weight:"—", College:"—", Country:"Australia", Wingspan:"—", Birthday:"—" }
  },
};

function getQuery(name){
  const url = new URL(location.href);
  return url.searchParams.get(name);
}
function setTabs(active){
  $all(".tab").forEach(t=>t.classList.toggle("active", t.dataset.view===active));
  $all(".view").forEach(v=>v.classList.toggle("active", v.id===`view-${active}`));
}
function bindTabs(){
  $all(".tab").forEach(t=>{
    t.addEventListener("click", e=>{ e.preventDefault(); setTabs(t.dataset.view); history.replaceState({}, "", `?name=${encodeURIComponent(currentName)}&view=${t.dataset.view}`); });
  });
}

let currentName = getQuery("name") || "Kyle Denzin";
let currentView = getQuery("view") || "averages";

let rawData = null; // {header, rows}
let numericCols = []; // auto-detected numeric stat keys
let seasonKey = null; // attempt to detect a "Season" column
let dateKey = null; // date column if exists

function detectColumns(header){
  // heuristics for season/date
  seasonKey = header.find(h=>/season/i.test(h)) || null;
  dateKey = header.find(h=>/date/i.test(h)) || null;
  // numeric columns: everything that parses as a number in most rows (except opponent, team, result, etc.)
  const exclude = new Set(["Opponent","Opp","Team","TM","Result","R","Location","Notes","Season","Date"]);
  const sample = rawData.rows.slice(0, Math.min(20, rawData.rows.length));
  numericCols = header.filter(h => !exclude.has(h)).filter(h=>{
    let numericCount = 0, checked = 0;
    for (const r of sample){
      if (r[h]===undefined || r[h]==="") continue;
      checked++;
      if (Number.isFinite(parseFloat(String(r[h]).replace(/[^0-9\.\-]/g,"")))) numericCount++;
    }
    return checked>0 && numericCount/checked > 0.6;
  });
}

function renderBio(meta){
  const dest = $("#bioBlock");
  const items = Object.entries(meta.bio).map(([k,v])=>`<div class="bio-item"><div class="k">${k}</div><div class="v">${v}</div></div>`);
  dest.innerHTML = items.join("");
}

function seasonsFromRows(){
  if (!seasonKey){
    // try to derive from Date, using YYYY or YYYY-YY
    if (dateKey){
      const years = Array.from(new Set(rawData.rows.map(r=> String(r[dateKey]).slice(0,4)))).filter(Boolean);
      return years.sort();
    }
    return ["All"];
  }
  const uniq = Array.from(new Set(rawData.rows.map(r=> r[seasonKey] || "Unknown")));
  return uniq.filter(Boolean);
}

function computeCareerAverages(rows){
  const n = rows.length || 1;
  const obj = {};
  for (const c of numericCols){ obj[c] = +(avg(rows, c)).toFixed(1); }
  return obj;
}
function computeCareerTotals(rows){
  const obj = {};
  for (const c of numericCols){ obj[c] = +sum(rows, c).toFixed(0); }
  return obj;
}
function computeGameHighs(rows){
  const obj = {};
  for (const c of numericCols){ const {max} = maxBy(rows, c); obj[c] = Number.isFinite(max) ? max : "—"; }
  return obj;
}
function seasonRows(selSeason){
  if (!seasonKey || selSeason==="All") return rawData.rows;
  return rawData.rows.filter(r => (r[seasonKey]||"") === selSeason);
}

function renderSummaryCards(obj){
  const keys = Object.keys(obj).slice(0,8); // first 8 stats
  $("#averagesSummary").innerHTML = keys.map(k=>`
    <div class="card">
      <div class="card-title">${k}</div>
      <div class="metric">${obj[k]}</div>
      <div class="sub">${k.includes("%")?"Rate":"Stat"}</div>
    </div>
  `).join("");
}

function renderAveragesView(){
  // bubbles
  const activeBubble = $(".bubble.active")?.dataset.bubble || "career";
  const selSeason = $("#seasonSelect").value;
  let rows = rawData.rows;
  if (activeBubble==="season") rows = seasonRows(selSeason);

  let summary = {};
  if (activeBubble==="career" || activeBubble==="season"){
    summary = computeCareerAverages(rows);
    // per-season table (like game logs format but aggregated)
    const bySeason = seasonKey ? groupBy(rawData.rows, r=>r[seasonKey]) : {"All": rawData.rows};
    const aggRows = Object.entries(bySeason).map(([season, arr])=>{
      const o = { Season: season, GP: arr.length };
      for (const c of numericCols){ o[c] = +(avg(arr,c)).toFixed(1); }
      return o;
    }).sort((a,b)=> String(a.Season).localeCompare(String(b.Season)));
    renderTable("#averagesTable", ["Season","GP", ...numericCols], aggRows);
  } else if (activeBubble==="totals"){
    summary = computeCareerTotals(rows);
    // totals by season
    const bySeason = seasonKey ? groupBy(rawData.rows, r=>r[seasonKey]) : {"All": rawData.rows};
    const aggRows = Object.entries(bySeason).map(([season, arr])=>{
      const o = { Season: season, GP: arr.length };
      for (const c of numericCols){ o[c] = +sum(arr,c).toFixed(0); }
      return o;
    }).sort((a,b)=> String(a.Season).localeCompare(String(b.Season)));
    renderTable("#averagesTable", ["Season","GP", ...numericCols], aggRows);
  } else if (activeBubble==="highs"){
    summary = computeGameHighs(rows);
    // highs by stat, one row
    const row = { Category: "Highs" };
    for (const c of numericCols){ row[c] = summary[c]; }
    renderTable("#averagesTable", ["Category", ...numericCols], [row]);
  }
  renderSummaryCards(summary);
}

function renderLogsView(){
  const selSeason = $("#logSeasonSelect").value;
  const rows = seasonRows(selSeason);
  // Keep all original columns, but show most relevant first if present
  const header = rawData.header;
  renderTable("#logsTable", header, rows);
}

async function init(){
  bindThemeToggle();
  bindTabs();
  setTabs(currentView);

  const name = getQuery("name") || "Kyle Denzin";
  currentName = name;
  $("#playerName").textContent = name;
  const meta = PLAYERS[name];
  if (!meta) {
    $("#playerSub").textContent = "Unknown player";
    return;
  }
  $("#playerSub").textContent = `#${meta.number} • ${meta.pos} • ${meta.team}`;
  $("#rawLink").href = meta.csv;
  $("#playerSwitcher").href = "./";

  // Load CSV
  rawData = await CSV.fetch(meta.csv);
  detectColumns(rawData.header);

  // Seasons for selects
  const seasons = seasonsFromRows();
  const seasonSelect = $("#seasonSelect");
  const logSeasonSelect = $("#logSeasonSelect");
  seasonSelect.innerHTML = seasons.map(s=>`<option>${s}</option>`).join("");
  logSeasonSelect.innerHTML = seasons.map(s=>`<option>${s}</option>`).join("");

  // bubbles behavior
  $all(".bubble").forEach(b=> b.addEventListener("click", e=>{
    $all(".bubble").forEach(x=>x.classList.remove("active"));
    b.classList.add("active");
    renderAveragesView();
  }));
  seasonSelect.addEventListener("change", renderAveragesView);

  renderAveragesView();
  renderLogsView();
  logSeasonSelect.addEventListener("change", renderLogsView);

  // Switch to view via query
  const qView = getQuery("view");
  if (qView) setTabs(qView);
}

init();
