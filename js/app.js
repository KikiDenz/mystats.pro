// Theme handling
const root = document.documentElement;
function setTheme(mode) {
  if (mode === "dark") root.classList.add("dark"); else root.classList.remove("dark");
  localStorage.setItem("theme", mode);
}
function initThemeToggle() {
  const saved = localStorage.getItem("theme") || "light";
  setTheme(saved);
  const btn = document.getElementById("theme-toggle");
  if (btn) {
    btn.textContent = saved === "dark" ? "Light mode" : "Dark mode";
    btn.onclick = () => {
      const next = root.classList.contains("dark") ? "light" : "dark";
      setTheme(next);
      btn.textContent = next === "dark" ? "Light mode" : "Dark mode";
    };
  }
}

// CSV fetch & parse
async function fetchCsv(url) {
  const res = await fetch(url);
  const text = await res.text();
  return parseCsv(text);
}

function parseCsv(text) {
  // Simple CSV parser (handles commas inside quotes)
  const rows = [];
  let row = [], col = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' ) {
      if (inQuotes && text[i+1] === '"') { col += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      row.push(col); col = "";
    } else if ((c === '\n' || c === '\r') && !inQuotes) {
      if (col !== "" || row.length) { row.push(col); rows.push(row); row = []; col = ""; }
    } else {
      col += c;
    }
  }
  if (col !== "" || row.length) { row.push(col); rows.push(row); }

  const headers = rows[0].map(h => h.trim().toLowerCase());
  return rows.slice(1).filter(r => r.some(x => x && x.trim() !== "")).map(r => {
    const o = {};
    headers.forEach((h, i) => { o[h] = (r[i] || "").trim(); });
    return o;
  });
}

// Formatters
function pct(num) {
  if (isNaN(num)) return "0.0%";
  return (num * 100).toFixed(1) + "%";
}
function oneDec(x){ return (isNaN(x)?0:x).toFixed(1); }
function zero(x){ return isNaN(x) ? 0 : x; }

// Compute weighted shooting percentages and box stats
function computePlayerAverages(rows) {
  const acc = rows.reduce((a, r) => {
    const n = (k) => Number(String(r[k]||"").replace('%',''));

    const fg  = Number(r['fg']  || 0);
    const fga = Number(r['fga'] || 0);
    const tp  = Number(r['3p']  || 0);
    const tpa = Number(r['3pa'] || 0);
    const ft  = Number(r['ft']  || 0);
    const fta = Number(r['fta'] || 0);

    const or_ = Number(r['or'] || 0);
    const dr_ = Number(r['dr'] || 0);
    const totrb = Number(r['totrb'] || (or_ + dr_));

    a.games += 1;
    a.min   += Number(r['min'] || 0);
    a.fg    += fg;     a.fga  += fga;
    a.tp    += tp;     a.tpa  += tpa;
    a.ft    += ft;     a.fta  += fta;
    a.or    += or_;    a.dr   += dr_;  a.trb += totrb;
    a.ast   += Number(r['ass'] || r['hock ass'] || 0);
    a.pf    += Number(r['pf'] || 0);
    a.stl   += Number(r['st'] || 0);
    a.blk   += Number(r['bs'] || 0);
    a.tov   += Number(r['to'] || 0);
    a.pts   += Number(r['pts'] || 0);
    return a;
  }, {games:0,min:0,fg:0,fga:0,tp:0,tpa:0,ft:0,fta:0,or:0,dr:0,trb:0,ast:0,pf:0,stl:0,blk:0,tov:0,pts:0});

  const avg = (k) => acc.games ? acc[k]/acc.games : 0;
  return {
    games: acc.games,
    min: avg('min'),
    pts: avg('pts'),
    trb: avg('trb'),
    fgm: avg('fg'),
    fga: avg('fga'),
    "3pm": avg('tp'),
    "3pa": avg('tpa'),
    oreb: avg('or'),
    dreb: avg('dr'),
    ast: avg('ast'),
    stl: avg('stl'),
    blk: avg('blk'),
    tov: avg('tov'),
    pf: avg('pf'),
    fgPct: acc.fga ? acc.fg/acc.fga : 0,
    tpPct: acc.tpa ? acc.tp/acc.tpa : 0,
    ftPct: acc.fta ? acc.ft/acc.fta : 0
  };
}

function byYear(rows) {
  const groups = {};
  for (const r of rows) {
    const d = new Date(r['date'] || r['game date'] || r['dt'] || '');
    const y = isNaN(d.getFullYear()) ? 'Unknown' : String(d.getFullYear());
    if (!groups[y]) groups[y] = [];
    groups[y].push(r);
  }
  return groups;
}

// Build roster list
async function loadJSON(path){ const r = await fetch(path); return r.json(); }

function applyTeamTheme(team) {
  const mode = (localStorage.getItem("theme") || "light");
  const theme = team.colors?.[mode] || {};
  const rootStyle = document.documentElement.style;
  if (theme.primary) rootStyle.setProperty("--primary", theme.primary);
  if (theme.accent)  rootStyle.setProperty("--accent", theme.accent);
  if (theme.bg)      rootStyle.setProperty("--bg", theme.bg);
  if (theme.text)    rootStyle.setProperty("--text", theme.text);
}

// Simple search across team & player names
async function initSearch() {
  const input = document.getElementById("search");
  if (!input) return;
  const teams = await loadJSON("data/teams.json");
  const players = await loadJSON("data/players.json");
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const q = input.value.toLowerCase().trim();
      const t = teams.find(x => x.name.toLowerCase().includes(q));
      if (t) { window.location.href = `team.html?team=${t.slug}`; return; }
      const p = players.find(x => x.name.toLowerCase().includes(q));
      if (p) { window.location.href = `player.html?player=${p.slug}`; return; }
      alert("No team/player match. Try a different search.");
    }
  });
}

export { initThemeToggle, fetchCsv, computePlayerAverages, byYear, loadJSON, applyTeamTheme, initSearch, pct, oneDec };