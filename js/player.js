import { initThemeToggle, loadJSON, fetchCsv, computePlayerAverages, pct, oneDec } from './app.js';

// ---------- utils ----------
const Q = s => document.querySelector(s);
const slugify = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const norm    = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const title   = s => (s||'').replaceAll('-', ' ').replace(/\b\w/g,c=>c.toUpperCase());
const fmt0    = v => (v==null || v==='') ? '0' : v;

// prefer v1 if defined/positive, otherwise v2
const valOr = (v1, v2) => (v1!=null && v1!=='' && !Number.isNaN(v1) && Number(v1)!==0) ? v1 : v2;

// Merge two average objects (leaders first, then csv) to avoid zeros for missing keys
function mergeAvg(pref, fallback){
  const keys = ['pts','trb','ast','stl','blk','tov','fgm','fga','3pm','3pa','oreb','dreb','fgPct','tpPct','ftPct'];
  const out = {};
  keys.forEach(k => out[k] = valOr(Number(pref?.[k]), Number(fallback?.[k])) || 0);
  return out;
}

function setText(id, v){ const el=Q('#'+id); if(el) el.textContent=v; }

function fillKPIsFromAvg(avg){
  setText('c-pts', oneDec(avg.pts));
  setText('c-trb', oneDec(avg.trb));
  setText('c-ast', oneDec(avg.ast));
  setText('c-fg',  pct(avg.fgPct));
  setText('c-3p',  pct(avg.tpPct));
  setText('c-ft',  pct(avg.ftPct));
  setText('c-stl', oneDec(avg.stl));
  setText('c-blk', oneDec(avg.blk));
  setText('c-fgm', oneDec(avg.fgm));
  setText('c-fga', oneDec(avg.fga));
  setText('c-3pm', oneDec(avg['3pm']));
  setText('c-3pa', oneDec(avg['3pa']));
  setText('c-or',  oneDec(avg.oreb));
  setText('c-dr',  oneDec(avg.dreb));
  setText('c-tov', oneDec(avg.tov));
}

function renderLog(rows){
  const tb = Q('#gamelog-body'); if(!tb) return;
  tb.innerHTML='';
  rows.forEach(r=>{
    const gid = r.game_id || r.id || r.gid || r.uid || r.key || `${r.date||''}_${r.team||''}_${r.opponent||r.opp||''}`;
    const tr = document.createElement('tr');
    tr.innerHTML = `<td>${fmt0(r.date)}</td><td>${fmt0(r.team)}</td>
      <td><a href="game.html?game_id=${gid}">${fmt0(r.opponent||r.opp)}</a></td>
      <td>${fmt0(r.min)}</td><td>${fmt0(r.fg)}/${fmt0(r.fga)}</td><td>${fmt0(r['3p'])}/${fmt0(r['3pa'])}</td><td>${fmt0(r.ft)}/${fmt0(r.fta)}</td>
      <td>${fmt0(r.or)}</td><td>${fmt0(r.dr)}</td><td>${fmt0(r.totrb||((+r.or||0)+(+r.dr||0)))}</td>
      <td>${fmt0(r.ass||r['hock ass'])}</td><td>${fmt0(r.st)}</td><td>${fmt0(r.bs)}</td><td>${fmt0(r.to)}</td><td>${fmt0(r.pts)}</td>`;
    tb.appendChild(tr);
  });
}

// fuzzy team key from leaders.json
function findLeadersTeamKey(teamsObj, wantSlug, wantName){
  const keys = Object.keys(teamsObj||{});
  const ws = slugify(wantSlug||'');
  const wn = norm(wantName||'');
  return keys.find(k => k===ws)
      || keys.find(k => k.includes(ws))
      || keys.find(k => norm(k.replace(/-/g,' '))===wn)
      || null;
}

async function renderRank(me, teams, leadersObj){
  const host = Q('#player-rankblock'); if(!host) return;
  host.innerHTML='';
  const controls = document.createElement('div'); controls.className='hstack';
  const statSel = document.createElement('select'); statSel.className='select';
  [['pts','Points'],['trb','Rebounds'],['ast','Assists'],['stl','Steals'],['blk','Blocks'],['fgm','FGM'],['fga','FGA'],['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']]
    .forEach(([k,l])=>{ const o=document.createElement('option'); o.value=k; o.textContent=l; statSel.appendChild(o); });
  statSel.value='pts';
  const modeBtn = document.createElement('button'); modeBtn.className='btn'; modeBtn.dataset.mode='avg'; modeBtn.textContent='Averages';
  const teamSel = document.createElement('select'); teamSel.className='select';
  (me.teams||[]).forEach(sl=>{ const t=teams.find(x=>x.slug===sl); const o=document.createElement('option'); o.value=sl; o.textContent=title(t?.name||sl); teamSel.appendChild(o); });
  controls.appendChild(statSel); controls.appendChild(modeBtn); controls.appendChild(teamSel);
  host.appendChild(controls);
  const list = document.createElement('div'); list.className='section'; host.appendChild(list);

  function refresh(){
    list.innerHTML='';
    const stat=statSel.value, mode=modeBtn.dataset.mode, teamSlug=teamSel.value;
    const teamMeta = teams.find(t=>t.slug===teamSlug);
    const key = leadersObj ? findLeadersTeamKey(leadersObj, teamSlug, teamMeta?.name) : null;
    const teamBlock = (key && leadersObj?.[key]) ? leadersObj[key] : null;
    if(teamBlock?.leaders){
      const arr = (teamBlock.leaders?.[mode]?.[stat] || []).map(r=>({name:r.name, playerId:r.playerId, val:Number(r.value||0)}));
      if(!arr.length){ list.innerHTML='<div class="text-sm text-muted">No data for this stat.</div>'; return; }
      const rows = arr.sort((a,b)=>b.val-a.val);
      const tbl = document.createElement('table'); tbl.className='table';
      tbl.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>';
      const tb = document.createElement('tbody');
      rows.forEach((r,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(r.val*10)/10).toFixed(1)}</td>`; if(r.playerId===me.slug) tr.style.fontWeight='700'; tb.appendChild(tr); });
      tbl.appendChild(tb); list.appendChild(tbl);
      return;
    }
    list.innerHTML='<div class="text-sm text-muted">Leaders unavailable for this team.</div>';
  }

  statSel.addEventListener('change', refresh);
  modeBtn.addEventListener('click', ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals'; refresh(); });
  teamSel.addEventListener('change', refresh);
  refresh();
}

async function init(){
  initThemeToggle();
  const [players, teams] = await Promise.all([loadJSON('data/players.json'), loadJSON('data/teams.json')]);

  const slug = new URL(location.href).searchParams.get('player');
  const me = players.find(p=>p.slug===slug);
  if(!me) return;

  // header
  Q('#player-name').textContent = me.name;
  Q('#player-img').src = me.image || 'assets/player.png';

  // chips + filter
  const chip = Q('#player-teamlinks'); chip.innerHTML='';
  (me.teams||[]).forEach(sl=>{ const t=teams.find(x=>x.slug===sl); const a=document.createElement('a'); a.className='pill'; a.href=`team.html?team=${sl}`; a.textContent=(t?.name||title(sl)); chip.appendChild(a); });
  const teamSel = Q('#team-filter'); teamSel.innerHTML=''; const ao=document.createElement('option'); ao.value=''; ao.textContent='All'; teamSel.appendChild(ao);
  ;(me.teams||[]).forEach(sl=>{ const t=teams.find(x=>x.slug===sl); const o=document.createElement('option'); o.value=sl; o.textContent=(t?.name||title(sl)); teamSel.appendChild(o); });
  teamSel.value='';

  // leaders (optional)
  let leadersTeams=null;
  try { const lj = await loadJSON('data/leaders.json'); leadersTeams = lj?.teams || null; } catch(e){ leadersTeams=null; }

  // CSV (for game log & as fallback to fill missing KPI fields)
  let csvRows=[];
  if(me.csvUrl){
    try { csvRows = await fetchCsv(me.csvUrl); } catch(e){ csvRows=[]; }
  }

  const teamKeyOf = (slugVal) => {
    const tMeta = teams.find(t=>t.slug===slugVal);
    return leadersTeams ? findLeadersTeamKey(leadersTeams, slugVal, tMeta?.name) : null;
  };

  function applyFilters(){
    const teamVal = teamSel.value;
    const filteredRows = teamVal ? csvRows.filter(r => {
      const cSlug = slugify(r.team||'');
      return cSlug===slugify(teamVal) || cSlug.includes(slugify(teamVal));
    }) : csvRows;

    const csvAvg = computePlayerAverages(filteredRows);
    if(teamVal && leadersTeams){
      const key = teamKeyOf(teamVal);
      const block = key ? leadersTeams[key] : null;
      const entry = block?.players?.find(p=>p.playerId===me.slug);
      if(entry){
        return { avg: mergeAvg(entry.avg||{}, csvAvg), rows: filteredRows };
      }
    }
    return { avg: csvAvg, rows: filteredRows };
  }

  function refresh(){
    const {avg, rows} = applyFilters();
    fillKPIsFromAvg(avg);
    renderLog(rows);
  }

  teamSel.addEventListener('change', refresh);
  refresh();

  await renderRank(me, teams, leadersTeams);
}

window.addEventListener('DOMContentLoaded', init);
