import { initThemeToggle, loadJSON, fetchCsv, computePlayerAverages, pct, oneDec } from './app.js';

const Q = s => document.querySelector(s);
const slugify = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const teamMatch = (cell, slug, name) => {
  const cSlug=slugify(cell), cNorm=norm(cell), tSlug=slugify(slug), tNorm=norm(name);
  return cSlug===tSlug || cSlug.includes(tSlug) || cNorm===tNorm || cNorm.includes(tNorm);
};
const title = s => (s||'').replaceAll('-', ' ').replace(/\b\w/g,c=>c.toUpperCase());

function setText(id, v){ const el=Q('#'+id); if(el) el.textContent=v; }

function fillKPIsFromAvg(avg){
  setText('c-pts', oneDec(avg.pts));
  setText('c-trb', oneDec(avg.trb));
  setText('c-ast', oneDec(avg.ast));
  setText('c-fg', pct(avg.fgPct));
  setText('c-3p', pct(avg.tpPct));
  setText('c-ft', pct(avg.ftPct));
  setText('c-stl', oneDec(avg.stl));
  setText('c-blk', oneDec(avg.blk));
  setText('c-fgm', oneDec(avg.fgm));
  setText('c-fga', oneDec(avg.fga));
  setText('c-3pm', oneDec(avg['3pm']));
  setText('c-3pa', oneDec(avg['3pa']));
  setText('c-or', oneDec(avg.oreb));
  setText('c-dr', oneDec(avg.dreb));
  setText('c-tov', oneDec(avg.tov));
}

function renderLog(rows){
  const tb = Q('#player-log-body'); if(!tb) return;
  tb.innerHTML='';
  rows.forEach(r=>{
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${r.date||''}</td><td>${r.team||''}</td><td>${r.opponent||r.opp||''}</td>
      <td>${r.min||''}</td><td>${r.fg||0}/${r.fga||0}</td><td>${r['3p']||0}/${r['3pa']||0}</td><td>${r.ft||0}/${r.fta||0}</td>
      <td>${r.or||0}</td><td>${r.dr||0}</td><td>${r.totrb||((+r.or||0)+(+r.dr||0))}</td>
      <td>${r.ass||r['hock ass']||0}</td><td>${r.st||0}</td><td>${r.bs||0}</td><td>${r.to||0}</td><td>${r.pts||0}</td>`;
    tb.appendChild(tr);
  });
}

async function renderRank(me, teams){
  const host = Q('#player-rankblock'); if(!host) return;
  host.innerHTML='';
  const controls = document.createElement('div'); controls.className='hstack';
  const statSel = document.createElement('select'); statSel.className='select';
  [['pts','Points'],['trb','Rebounds'],['ast','Assists'],['stl','Steals'],['blk','Blocks'],['fgm','FGM'],['fga','FGA'],['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']].forEach(([k,l])=>{ const o=document.createElement('option'); o.value=k; o.textContent=l; statSel.appendChild(o); });
  statSel.value='pts';
  const modeBtn = document.createElement('button'); modeBtn.className='btn'; modeBtn.dataset.mode='avg'; modeBtn.textContent='Averages';
  const teamSel = document.createElement('select'); teamSel.className='select';
  (me.teams||[]).forEach(sl=>{ const o=document.createElement('option'); o.value=sl; o.textContent=title(sl); teamSel.appendChild(o); });
  controls.appendChild(statSel); controls.appendChild(modeBtn); controls.appendChild(teamSel);
  host.appendChild(controls);
  const list = document.createElement('div'); list.className='section'; host.appendChild(list);

  let leaders=null;
  try { const lj = await loadJSON('data/leaders.json'); leaders = lj?.teams || null; } catch(e){ leaders=null; }

  async function refresh(){
    list.innerHTML='';
    const teamSlug = teamSel.value, stat=statSel.value, mode=modeBtn.dataset.mode;
    if(leaders && leaders[teamSlug]?.leaders){
      const arr = (leaders[teamSlug].leaders?.[mode]?.[stat] || []).map(r=>({name:r.name, playerId:r.playerId, val:Number(r.value||0)}));
      const rows = arr.sort((a,b)=>b.val-a.val);
      const tbl = document.createElement('table'); tbl.className='table';
      tbl.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>';
      const tb = document.createElement('tbody');
      rows.forEach((r,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(r.val*10)/10).toFixed(1)}</td>`; if(r.playerId===me.slug) tr.style.fontWeight='700'; tb.appendChild(tr); });
      tbl.appendChild(tb); list.appendChild(tbl);
      return;
    }
    list.textContent = 'No data yet…';
  }

  statSel.addEventListener('change', refresh);
  modeBtn.addEventListener('click', ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals'; refresh(); });
  teamSel.addEventListener('change', refresh);
  await refresh();
}

async function init(){
  initThemeToggle();
  const [players, teams] = await Promise.all([loadJSON('data/players.json'), loadJSON('data/teams.json')]);
  const slug = new URL(location.href).searchParams.get('player');
  const me = players.find(p=>p.slug===slug);
  if(!me) return;

  Q('#player-name').textContent = me.name;
  Q('#player-img').src = me.image || 'assets/player.png';

  // chips + filter
  const chip = Q('#player-teamlinks'); chip.innerHTML='';
  (me.teams||[]).forEach(sl=>{ const a=document.createElement('a'); a.className='pill'; a.href=`team.html?team=${sl}`; a.textContent=title(sl); chip.appendChild(a); });
  const teamSel = Q('#team-filter'); teamSel.innerHTML=''; const ao=document.createElement('option'); ao.value=''; ao.textContent='All'; teamSel.appendChild(ao);
  (me.teams||[]).forEach(sl=>{ const o=document.createElement('option'); o.value=sl; o.textContent=title(sl); teamSel.appendChild(o); });
  teamSel.value='';

  // leaders.json for per-team KPIs; CSV for game log / "All"
  let leaders=null; try { const lj = await loadJSON('data/leaders.json'); leaders = lj?.teams || null; } catch(e){ leaders=null; }
  let csvRows=[];
  if(me.csvUrl){
    try { csvRows = await fetchCsv(me.csvUrl); } catch(e){ csvRows=[]; }
  }

  function applyFilters(){
    const teamVal = teamSel.value;
    if(teamVal && leaders?.[teamVal]){
      const entry = leaders[teamVal].players.find(p=>p.playerId===me.slug);
      if(entry) return {avg: entry.avg, rows: csvRows.filter(r => teamMatch(r.team||'', teamVal, title(teamVal)))};
    }
    const filt = teamVal ? csvRows.filter(r => teamMatch(r.team||'', teamVal, title(teamVal))) : csvRows;
    return {avg: computePlayerAverages(filt), rows: filt};
  }

  function refresh(){
    const {avg, rows} = applyFilters();
    fillKPIsFromAvg(avg);
    renderLog(rows);
  }

  teamSel.addEventListener('change', refresh);
  refresh();
  await renderRank(me, teams);
}
window.addEventListener('DOMContentLoaded', init);
