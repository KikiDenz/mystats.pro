import { initThemeToggle, fetchCsv, loadJSON, applyTeamTheme, initSearch } from './app.js';

const REQUIRED_TEAM_COLS = ['date','team1','team2','score_team1','score_team2','winner','loser','season'];
function validateColumns(rows, required){
  if (!rows || !rows.length) return required;
  const keys = Object.keys(rows[0]||{});
  return required.filter(k => !keys.includes(k));
}

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function recordFromTeamSheet(teamName, rows) {
  let wins = 0, losses = 0;
  for (const r of rows) {
    const t1 = (r['team1']||"").trim();
    const t2 = (r['team2']||"").trim();
    const winner = (r['winner']||"").trim();
    const loser  = (r['loser']||"").trim();
    if (t1 === teamName || t2 === teamName) {
      if (winner === teamName) wins++;
      else if (loser === teamName) losses++;
      else {
        // Fallback if winner/loser missing: infer by score
        const s1 = Number(r['score_team1']||0);
        const s2 = Number(r['score_team2']||0);
        if (!isNaN(s1) && !isNaN(s2)) {
          if ((t1 === teamName && s1 > s2) || (t2 === teamName && s2 > s1)) wins++;
          else if (s1 !== s2) losses++;
        }
      }
    }
  }
  return {wins, losses};
}

async function init() {
  initThemeToggle();
  initSearch();
  const slug = getParam("team");
  const teams = await loadJSON("data/teams.json");
  const players = await loadJSON("data/players.json");
  const team = teams.find(t => t.slug === slug) || teams[0];
  applyTeamTheme(team);
  // Banner gradient
  const mode = (localStorage.getItem("theme") || "light");
  const colors = team.colors?.[mode] || team.colors?.light || {};
  const p = colors.primary || '#3b82f6';
  const a = colors.accent || '#60a5fa';
  const banner = document.getElementById("team-banner");
  if (banner) banner.style.background = `linear-gradient(135deg, ${p}, ${a})`;

  document.getElementById("team-name").textContent = team.name;
  document.getElementById("team-logo").src = team.logo;

  // Roster
  const rosterEl = document.getElementById("roster");
  rosterEl.innerHTML = "";
  team.roster.forEach(slug => {
    const p = players.find(x => x.slug === slug);
    if (!p) return;
    const a = document.createElement("a");
    a.href = `player.html?player=${p.slug}`;
    a.className = "pill";
    a.textContent = `${p.name}${p.number ? " #" + p.number : ""}`;
    rosterEl.appendChild(a);
  });

  // Record and game log
  const rows = await fetchCsv(team.teamCsv);
  const missing = validateColumns(rows, REQUIRED_TEAM_COLS);
  const v = document.getElementById('validator');
  if (missing.length) { v.style.display='block'; v.innerHTML = `<strong>Heads up:</strong> Missing columns in team sheet → ${missing.join(', ')}`;}
  const rec = recordFromTeamSheet(team.name, rows);
  document.getElementById("record").textContent = `${rec.wins}-${rec.losses}`;

  const tbody = document.getElementById("gamelog-body");
  tbody.innerHTML = "";
  rows.forEach(r => {
    const tr = document.createElement("tr");

    const date = r['date'] || "";
    const t1 = r['team1'] || "";
    const t2 = r['team2'] || "";
    const s1 = r['score_team1'] || "";
    const s2 = r['score_team2'] || "";
    const res = (r['winner']||"") === team.name ? "W" : ((r['loser']||"") === team.name ? "L" : "");

    tr.innerHTML = `
      <td>${date}</td>
      <td>${t1} vs ${t2}</td>
      <td>${s1} - ${s2}</td>
      <td>${res ? `<span class="${res==='W'?'badge-win':'badge-loss'}">${res}</span>` : ''}</td>
      <td>${r['season'] || ''}</td>
    `;
    tbody.appendChild(tr);
  });
}

window.addEventListener("DOMContentLoaded", init);