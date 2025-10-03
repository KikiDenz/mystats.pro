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
    a.className = "player-tile";
    a.innerHTML = `<img src="${p.image}" alt="contain"/>
                  <div><div class="nm">${p.name}</div>
                  <div class="num">#${p.number||''}</div></div>`;
    rosterEl.appendChild(a);
  });

  // Record and game log
  const rows = await fetchCsv(team.teamCsv);
  const missing = validateColumns(rows, REQUIRED_TEAM_COLS);
  const v = document.getElementById('validator');
  if (missing.length) { v.style.display='block'; v.innerHTML = `<strong>Heads up:</strong> Missing columns in team sheet → ${missing.join(', ')}`;}
  // slug helpers so names like "Pretty Good" and "Pretty Good Basketball Team" still match
  const slugify = s => (s || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const isMe = (name) => slugify(name) === team.slug;

// compute record from rows using winner/loser names
let wins = 0, losses = 0;
rows.forEach(r => {
  if (isMe(r["winner"])) wins++;
  else if (isMe(r["loser"])) losses++;
});
const rec = { wins, losses };

document.getElementById("record").textContent = `${rec.wins}-${rec.losses}`;

  document.getElementById("record").textContent = `${rec.wins}-${rec.losses}`;

  const tbody = document.getElementById("gamelog-body");
  tbody.innerHTML = "";

  // --- Team leaders (rank all players; default PTS / Averages) ---
  async function renderTeamLeaders(team) {
    const host = document.getElementById('team-leaders');
    if (!host) return;
    const players = await loadJSON("data/players.json");

    // controls
    host.innerHTML = "";
    const controls = document.createElement('div'); controls.className='hstack';
    const statSel = document.createElement('select'); statSel.className='select';
    const opts = [['pts','Points'],['trb','Rebounds'],['ast','Assists'],['stl','Steals'],['blk','Blocks'],['fgm','FGM'],['fga','FGA'],['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']];
    opts.forEach(([k,l])=>{ const o=document.createElement('option'); o.value=k; o.textContent=l; statSel.appendChild(o); });
    statSel.value = 'pts';
    const modeBtn = document.createElement('button'); modeBtn.className='btn'; modeBtn.textContent='Averages'; modeBtn.dataset.mode='avg';
    controls.appendChild(statSel); controls.appendChild(modeBtn);
    host.appendChild(controls);

    const list = document.createElement('div'); list.className='section'; host.appendChild(list);

    function slugToTitle(slug){ return (slug||'').replaceAll('-', ' ').replace(/\b\w/g, c=>c.toUpperCase()); }

    async function fetchRosterAgg() {
      const rosterSlugs = team.roster || [];
      const out = [];
      for (const ps of rosterSlugs) {
        const p = players.find(x => x.slug === ps);
        if (!p || !p.csvUrl) continue;
        try {
          const rows = await fetchCsv(p.csvUrl);
          const filt = rows.filter(r => (r['team']||'').toLowerCase().includes(team.name.toLowerCase()));
          const avg = computePlayerAverages(filt);
          const totals = filt.reduce((a,r)=>{
            const num = k => Number(r[k]||0);
            a.pts+=num('pts'); a.trb+=Number(r['totrb']||Number(r['or']||0)+Number(r['dr']||0));
            a.ast+=num('ass')||num('hock ass'); a.stl+=num('st'); a.blk+=num('bs'); a.tov+=num('to');
            a.fgm+=num('fg'); a.fga+=num('fga'); a["3pm"]+=num('3p'); a["3pa"]+=num('3pa'); a.oreb+=num('or'); a.dreb+=num('dr');
            return a;
          }, {pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,"3pm":0,"3pa":0,oreb:0,dreb:0});
          out.push({ name:p.name, avg, tot:totals });
        } catch(e){ console.warn('csv fail', p.slug, e); }
      }
      return out;
    }

    async function refresh() {
      list.innerHTML = '';
      const mode = modeBtn.dataset.mode; const stat = statSel.value;
      const data = await fetchRosterAgg();
      if (!data.length) { list.textContent = 'No data yet…'; return; }
      const rows = data.map(d => ({ name:d.name, val: mode==='avg' ? (d.avg[stat]||0) : (d.tot[stat]||0) }));
      rows.sort((a,b)=> (b.val - a.val));

      const table = document.createElement('table'); table.className='table';
      table.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>';
      const tb = document.createElement('tbody');
      rows.forEach((r,i)=>{ const tr=document.createElement('tr'); tr.innerHTML = `<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(r.val*10)/10).toFixed(1)}</td>`; tb.appendChild(tr); });
      table.appendChild(tb);
      list.appendChild(table);
    }

    statSel.addEventListener('change', refresh);
    modeBtn.addEventListener('click', ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals'; refresh(); });

    await refresh();
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");

    const date = r['date'] || "";
    const t1 = r['team1'] || "";
    const t2 = r['team2'] || "";
    const s1 = r['score_team1'] || "";
    const s2 = r['score_team2'] || "";
    const res = isMe(r["winner"]) ? "W" : isMe(r["loser"]) ? "L" : "";


    tr.innerHTML = `
      <td>${date}</td>
      <td>${t1} vs ${t2}</td>
      <td>${s1} - ${s2}</td>
      <td>${res ? `<span class="${res==='W'?'badge-win':'badge-loss'}">${res}</span>` : ''}</td>
      <td>${r['season'] || ''}</td>
    `;
    tbody.appendChild(tr);

    const gameId = `${r.date}_${slugify(r.team1)}_vs_${slugify(r.team2)}`;
    tr.style.cursor = "pointer";
    tr.addEventListener("click", () => {
      window.location.href = `game.html?game_id=${encodeURIComponent(gameId)}`;
    });


  });

  // Leaders section
  await renderTeamLeaders(team);
}

window.addEventListener("DOMContentLoaded", init);