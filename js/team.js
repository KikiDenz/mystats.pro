import { initThemeToggle, fetchCsv, loadJSON, applyTeamTheme, initSearch, computePlayerAverages, pct, oneDec } from './app.js';

const INDEX_CSV = "https://docs.google.com/spreadsheets/d/15zxpQZJamQfEz07qFtZAI_738cI2rjc2qrrz-q-8Bo0/export?format=csv&gid=0";

function getParam(name){ return new URL(location.href).searchParams.get(name); }

function slugify(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function teamMatches(cell, team){
  const cSlug = slugify(cell), cNorm = norm(cell);
  const tSlug = slugify(team.slug), tNorm = norm(team.name);
  return (cSlug===tSlug) || cSlug.includes(tSlug) || (cNorm===tNorm) || cNorm.includes(tNorm);
}

function el(sel){ return document.querySelector(sel); }
function fmt(x){ return x==null||x==="" ? "—" : x; }

async function renderRoster(team, players){
  const grid = document.getElementById("roster-grid");
  if(!grid) return;
  grid.innerHTML = "";
  (team.roster||[]).forEach(slug => {
    const p = players.find(x=>x.slug===slug);
    if(!p) return;
    const div = document.createElement("a");
    div.href = `player.html?player=${p.slug}`;
    div.className = "player-tile";
    div.innerHTML = `<img src="${p.image||'assets/player.png'}" alt=""><div><div class="nm">${p.name}</div><div class="num">#${p.number||''}</div></div>`;
    grid.appendChild(div);
  });
}

async function renderHeader(team, games){
  const rec = games.reduce((a,g)=>{
    const isT1 = g.team1_slug===team.slug;
    const isT2 = g.team2_slug===team.slug;
    if(!isT1 && !isT2) return a;
    const s1 = Number(g.score_team1||0), s2 = Number(g.score_team2||0);
    const won = isT1 ? s1>s2 : s2>s1;
    if(won) a.w++; else a.l++;
    return a;
  }, {w:0,l:0});
  const recEl = document.getElementById("team-record");
  if(recEl) recEl.textContent = `Record: ${rec.w}-${rec.l}`;
  const bannerTitle = document.getElementById("team-name");
  if(bannerTitle) bannerTitle.textContent = team.name;
  applyTeamTheme(team);
}

function rowsToObjects(rows){
  const headers = rows[0].map(h=>h.trim().toLowerCase());
  const out=[];
  for(let i=1;i<rows.length;i++){
    const r = rows[i]; if(!r || !r.length) continue;
    const obj={};
    headers.forEach((h,idx)=> obj[h]=(r[idx]||"").trim());
    out.push(obj);
  }
  return out;
}

async function loadGamesFromIndex(){
  const res = await fetch(INDEX_CSV, {cache:"no-store"});
  const txt = await res.text();
  const rows = txt.trim().split(/\r?\n/).map(l=>l.split(",").map(s=>s.trim()));
  return rowsToObjects(rows);
}

async function renderGameLog(team, indexGames){
  const tb = document.getElementById("team-games-body");
  if(!tb) return;
  tb.innerHTML = "";
  const games = indexGames.filter(g => g.team1_slug===team.slug || g.team2_slug===team.slug);
  games.forEach(g=>{
    const tr = document.createElement("tr");
    const matchup = `${g.team1_slug} vs ${g.team2_slug}`;
    const score = `${g.score_team1||0} - ${g.score_team2||0}`;
    const won = (g.team1_slug===team.slug) ? (Number(g.score_team1||0) > Number(g.score_team2||0)) : (Number(g.score_team2||0) > Number(g.score_team1||0));
    const badge = won ? '<span class="badge-win">W</span>' : '<span class="badge-loss">L</span>';
    tr.innerHTML = `<td>${fmt(g.date)}</td><td>${matchup}</td><td>${score}</td><td>${badge}</td><td>${fmt(g.season||'')}</td>`;
    tr.style.cursor="pointer";
    const gameId = `${g.date}_${g.team1_slug}_vs_${g.team2_slug}`;
    tr.addEventListener("click",()=>{ location.href = `game.html?game_id=${encodeURIComponent(gameId)}`; });
    tb.appendChild(tr);
  });
}

async function renderTeamLeaders(team){
  const host = document.getElementById("team-leaders");
  if(!host) return;
  const players = await loadJSON("data/players.json");

  // controls
  host.innerHTML = "";
  const controls = document.createElement("div"); controls.className="hstack";
  const statSel = document.createElement("select"); statSel.className="select";
  const opts = [['pts','Points'],['trb','Rebounds'],['ast','Assists'],['stl','Steals'],['blk','Blocks'],['fgm','FGM'],['fga','FGA'],['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']];
  opts.forEach(([k,l])=>{ const o=document.createElement("option"); o.value=k; o.textContent=l; statSel.appendChild(o); });
  statSel.value="pts";
  const modeBtn = document.createElement("button"); modeBtn.className="btn"; modeBtn.dataset.mode="avg"; modeBtn.textContent="Averages";
  controls.appendChild(statSel); controls.appendChild(modeBtn);
  host.appendChild(controls);
  const list = document.createElement("div"); list.className="section"; host.appendChild(list);

  async function fetchAgg(){
    const out = [];
    for(const slug of (team.roster||[])){
      const p = players.find(x=>x.slug===slug);
      if(!p || !p.csvUrl) continue;
      try{
        const rows = await fetchCsv(p.csvUrl);
        const filt = rows.filter(r => teamMatches(r['team']||'', team));
        const avg = computePlayerAverages(filt);
        const tot = filt.reduce((a,r)=>{
          const num = k => Number(r[k]||0);
          a.pts+=num('pts'); a.trb+=Number(r['totrb']||Number(r['or']||0)+Number(r['dr']||0));
          a.ast+=num('ass')||num('hock ass'); a.stl+=num('st'); a.blk+=num('bs'); a.tov+=num('to');
          a.fgm+=num('fg'); a.fga+=num('fga'); a['3pm']+=num('3p'); a['3pa']+=num('3pa'); a.oreb+=num('or'); a.dreb+=num('dr');
          return a;
        }, {pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,'3pm':0,'3pa':0,oreb:0,dreb:0});
        out.push({name:p.name, avg, tot});
      }catch(e){ console.warn("CSV fail", p?.slug, e); }
    }
    return out;
  }

  async function refresh(){
    list.innerHTML = "";
    const data = await fetchAgg();
    if(!data.length){ list.textContent = "No data yet…"; return; }
    const mode = modeBtn.dataset.mode, stat = statSel.value;
    const rows = data.map(d=>({name:d.name, val: mode==='avg' ? (d.avg[stat]||0) : (d.tot[stat]||0)})).sort((a,b)=>b.val-a.val);
    const table = document.createElement("table"); table.className="table";
    table.innerHTML = "<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>";
    const tb = document.createElement("tbody");
    rows.forEach((r,i)=>{ const tr=document.createElement("tr"); tr.innerHTML = `<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(r.val*10)/10).toFixed(1)}</td>`; tb.appendChild(tr); });
    table.appendChild(tb); list.appendChild(table);
  }

  statSel.addEventListener("change", refresh);
  modeBtn.addEventListener("click", ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages':'Totals'; refresh(); });
  await refresh();
}

async function init(){
  initThemeToggle(); initSearch();
  const [teams, players] = await Promise.all([loadJSON("data/teams.json"), loadJSON("data/players.json")]);
  const slug = getParam("team");
  const team = teams.find(t=>t.slug===slug);
  if(!team){ console.error("Team not found", slug); return; }

  // banner + roster
  renderRoster(team, players);

  // index games
  const indexGames = await loadGamesFromIndex();
  await renderHeader(team, indexGames);
  await renderGameLog(team, indexGames);

  // leaders
  await renderTeamLeaders(team);
}

window.addEventListener("DOMContentLoaded", init);
