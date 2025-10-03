import { initThemeToggle, fetchCsv, computePlayerAverages, loadJSON, initSearch, pct, oneDec } from './app.js';

function getParam(name){ return new URL(location.href).searchParams.get(name); }
function slugToTitle(slug){ return (slug||'').replaceAll('-', ' ').replace(/\b\w/g, c=>c.toUpperCase()); }
function slugify(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
function norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
function teamMatches(cell, teamSlug, teamName){
  const cSlug = slugify(cell), cNorm = norm(cell);
  const tSlug = slugify(teamSlug), tNorm = norm(teamName);
  return (cSlug===tSlug) || cSlug.includes(tSlug) || (cNorm===tNorm) || cNorm.includes(tNorm);
}

function setText(id, v){ const el=document.getElementById(id); if(el) el.textContent=v; }

function fillKPIs(avg){
  setText("c-pts", oneDec(avg.pts));
  setText("c-trb", oneDec(avg.trb));
  setText("c-ast", oneDec(avg.ast));
  setText("c-fg", pct(avg.fgPct));
  setText("c-3p", pct(avg.tpPct));
  setText("c-ft", pct(avg.ftPct));
  const set=(id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = oneDec(val||0); };
  set("c-stl", avg.stl); set("c-blk", avg.blk); set("c-fgm", avg.fgm); set("c-fga", avg.fga);
  set("c-3pm", avg["3pm"]); set("c-3pa", avg["3pa"]); set("c-or", avg.oreb); set("c-dr", avg.dreb); set("c-tov", avg.tov);
}

function renderLog(rows){
  const tb = document.getElementById("player-log-body"); if(!tb) return;
  tb.innerHTML = "";
  rows.forEach(r=>{
    const tr = document.createElement("tr");
    const fgPct = r.fga>0 ? ((r.fg/r.fga)*100).toFixed(1) : "";
    const tpPct = r["3pa"]>0 ? ((r["3p"]/r["3pa"])*100).toFixed(1) : "";
    const ftPct = r.fta>0 ? ((r.ft/r.fta)*100).toFixed(1) : "";
    tr.innerHTML = `<td>${r.date||""}</td><td>${r.team||""}</td><td>${r.opponent||r.opp||""}</td>
    <td>${r.min||""}</td><td>${r.fg||0}/${r.fga||0}</td><td>${r["3p"]||0}/${r["3pa"]||0}</td><td>${r.ft||0}/${r.fta||0}</td>
    <td>${r.or||0}</td><td>${r.dr||0}</td><td>${r.totrb||(+r.or||0)+(+r.dr||0)}</td>
    <td>${r.ass||r["hock ass"]||0}</td><td>${r.st||0}</td><td>${r.bs||0}</td><td>${r.to||0}</td><td>${r.pts||0}</td>`;
    tb.appendChild(tr);
  });
}

async function renderPlayerRank(me, teams, allPlayers){
  const host = document.getElementById("player-rankblock");
  if(!host) return;
  host.innerHTML = "";
  const controls = document.createElement("div"); controls.className="hstack";
  const statSel = document.createElement("select"); statSel.className="select";
  const opts = [['pts','Points'],['trb','Rebounds'],['ast','Assists'],['stl','Steals'],['blk','Blocks'],['fgm','FGM'],['fga','FGA'],['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']];
  opts.forEach(([k,l])=>{ const o=document.createElement("option"); o.value=k; o.textContent=l; statSel.appendChild(o); });
  statSel.value="pts";
  const modeBtn = document.createElement("button"); modeBtn.className="btn"; modeBtn.dataset.mode="avg"; modeBtn.textContent="Averages";
  const teamSel = document.createElement("select"); teamSel.className="select";
  (me.teams||[]).forEach(slug=>{ const o=document.createElement("option"); o.value=slug; o.textContent=slugToTitle(slug); teamSel.appendChild(o); });
  controls.appendChild(statSel); controls.appendChild(modeBtn); controls.appendChild(teamSel);
  host.appendChild(controls);
  const list = document.createElement("div"); list.className="section"; host.appendChild(list);

  async function fetchAgg(teamSlug){
    const team = teams.find(t=>t.slug===teamSlug);
    if(!team) return [];
    const out=[];
    for(const ps of (team.roster||[])){
      const p = allPlayers.find(x=>x.slug===ps);
      if(!p || !p.csvUrl) continue;
      try{
        const rows = await fetchCsv(p.csvUrl);
        const filt = rows.filter(r => teamMatches(r['team']||'', team.slug, team.name));
        const avg = computePlayerAverages(filt);
        const tot = filt.reduce((a,r)=>{
          const num = k => Number(r[k]||0);
          a.pts+=num('pts'); a.trb+=Number(r['totrb']||Number(r['or']||0)+Number(r['dr']||0));
          a.ast+=num('ass')||num('hock ass'); a.stl+=num('st'); a.blk+=num('bs'); a.tov+=num('to');
          a.fgm+=num('fg'); a.fga+=num('fga'); a['3pm']+=num('3p'); a['3pa']+=num('3pa'); a.oreb+=num('or'); a.dreb+=num('dr');
          return a;
        }, {pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,'3pm':0,'3pa':0,oreb:0,dreb:0});
        out.push({playerId:p.slug, name:p.name, avg, tot});
      }catch(e){ console.warn('CSV fail', p?.slug, e); }
    }
    return out;
  }

  async function refresh(){
    list.innerHTML = "";
    const mode = modeBtn.dataset.mode, stat = statSel.value, teamSlug = teamSel.value;
    if(!teamSlug){ list.textContent = "Choose a team"; return; }
    const data = await fetchAgg(teamSlug);
    if(!data.length){ list.textContent = "No data yet…"; return; }
    const rows = data.map(d=>({name:d.name, playerId:d.playerId, val: mode==='avg' ? (d.avg[stat]||0) : (d.tot[stat]||0)})).sort((a,b)=>b.val-a.val);
    const table = document.createElement("table"); table.className="table";
    table.innerHTML = "<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>";
    const tb = document.createElement("tbody");
    rows.forEach((r,i)=>{ const tr=document.createElement("tr"); tr.innerHTML = `<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(r.val*10)/10).toFixed(1)}</td>`; if(r.playerId===me.slug) tr.style.fontWeight="700"; tb.appendChild(tr); });
    table.appendChild(tb); list.appendChild(table);
  }

  statSel.addEventListener("change", refresh);
  modeBtn.addEventListener("click", ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages':'Totals'; refresh(); });
  teamSel.addEventListener("change", refresh);
  await refresh();
}

async function init(){
  initThemeToggle(); initSearch();
  const [players, teams] = await Promise.all([loadJSON("data/players.json"), loadJSON("data/teams.json")]);
  const slug = getParam("player");
  const me = players.find(p=>p.slug===slug);
  if(!me){ console.error("Player not found", slug); return; }

  // header
  document.getElementById("player-name").textContent = me.name;
  document.getElementById("player-img").src = me.image || "assets/player.png";
  const teamLinks = document.getElementById("player-teamlinks");
  teamLinks.innerHTML = ""; (me.teams||[]).forEach(t=>{ const a=document.createElement("a"); a.href=`team.html?team=${t}`; a.className="pill"; a.textContent=slugToTitle(t); teamLinks.appendChild(a); });
  const teamFilter = document.getElementById("team-filter");
  teamFilter.innerHTML = ""; const oAll=document.createElement("option"); oAll.value=""; oAll.textContent="All"; teamFilter.appendChild(oAll);
  (me.teams||[]).forEach(t=>{ const o=document.createElement("option"); o.value=t; o.textContent=slugToTitle(t); teamFilter.appendChild(o); });
  teamFilter.value = "";

  // data
  let rows = [];
  if(me.csvUrl){
    try { rows = await fetchCsv(me.csvUrl); } catch(e){ console.error("CSV fetch failed", e); }
  }

  function applyFilters(){
    const teamVal = teamFilter.value;
    const yearVal = document.getElementById("season-year")?.value || "";
    let filt = teamVal ? rows.filter(r => teamMatches(r['team']||'', teamVal, slugToTitle(teamVal))) : rows.slice();
    if(yearVal){
      const yr = Number(yearVal);
      filt = filt.filter(r => { const d = new Date(r['date']); const y = d.getFullYear(); return !isNaN(y) && y===yr; });
    }
    return filt;
  }

  function refreshKPIsAndLog(){
    const filt = applyFilters();
    const avg = computePlayerAverages(filt);
    fillKPIs(avg);
    // render game log
    const normalized = filt.map(r => ({
      date: r['date'],
      team: r['team'],
      opponent: r['opponent']||r['opp']||'',
      min: r['min']||'',
      fg: Number(r['fg']||0), fga: Number(r['fga']||0),
      '3p': Number(r['3p']||0), '3pa': Number(r['3pa']||0),
      ft: Number(r['ft']||0), fta: Number(r['fta']||0),
      or: Number(r['or']||0), dr: Number(r['dr']||0),
      totrb: Number(r['totrb']||0),
      ass: Number(r['ass']||r['hock ass']||0), st: Number(r['st']||0),
      bs: Number(r['bs']||0), to: Number(r['to']||0),
      pts: Number(r['pts']||0),
    }));
    renderLog(normalized);
  }

  document.getElementById("tab-career").addEventListener("click", ()=>{ document.getElementById("tab-career").classList.add("active"); refreshKPIsAndLog(); });
  if(document.getElementById("tab-season")) document.getElementById("tab-season").style.display = "none";
  teamFilter.addEventListener("change", refreshKPIsAndLog);
  if(document.getElementById("season-year")) document.getElementById("season-year").addEventListener("change", refreshKPIsAndLog);

  refreshKPIsAndLog();
  await renderPlayerRank(me, teams, players);
}

window.addEventListener("DOMContentLoaded", init);
