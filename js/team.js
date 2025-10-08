import { initThemeToggle, loadJSON, fetchCsv, computePlayerAverages } from './app.js';

// ---------- tiny utils ----------
const Q = s => document.querySelector(s);
const fmt = v => (v==null || v==='') ? '—' : v;
const slugify = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const norm    = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

// ---------- index csv (for record + game log) ----------
const INDEX_CSV = "https://docs.google.com/spreadsheets/d/15zxpQZJamQfEz07qFtZAI_738cI2rjc2qrrz-q-8Bo0/export?format=csv&gid=0";

function parseRows(text){
  const lines = text.trim().split(/\r?\n/);
  const heads = lines[0].split(',').map(h=>h.trim());
  const out=[];
  for(let i=1;i<lines.length;i++){
    const cols = lines[i].split(',').map(s=>s.trim());
    const obj={};
    heads.forEach((h,ix)=> obj[h] = cols[ix] ?? '');
    out.push(obj);
  }
  return out;
}
async function loadIndex(){
  const res = await fetch(INDEX_CSV, {cache:'no-store'});
  const txt = await res.text();
  return parseRows(txt);
}

// ---------- logo wiring ----------
function setTeamLogo(team){
  const el = document.getElementById('team-logo')
        || document.querySelector('[data-team-logo]')
        || document.querySelector('#team-header img')
        || document.querySelector('.team-banner img');
  if(!el) return;
  const src = team.logo || team.logoUrl || team.image || `assets/logos/${team.slug}.png`;
  el.alt = `${team.name} logo`;
  el.src = src;
  el.onerror = () => { el.onerror = null; el.src = 'assets/logo-placeholder.png'; };
}

// ---------- roster ----------
async function renderRoster(team, players){
  const grid = Q('#roster') || Q('#roster-grid'); if(!grid) return;
  grid.innerHTML='';
  (team.roster||[]).forEach(sl => {
    const p = players.find(x=>x.slug===sl); if(!p) return;
    const a = document.createElement('a');
    a.className='player-tile'; a.href=`player.html?player=${p.slug}`;
    a.innerHTML = `<img src="${p.image||'assets/player.png'}" alt=""><div><div class="nm">${p.name}</div><div class="num">#${p.number||''}</div></div>`;
    grid.appendChild(a);
  });
}

// ---------- record + game log ----------
async function renderHeaderAndLog(team){
  const games = await loadIndex();

  const title = Q('#team-name') || Q('.team-title');
  if(title) title.textContent = team.name;
  setTeamLogo(team);

  const rec = games.reduce((acc,g)=>{
    const is1 = g.team1_slug===team.slug, is2 = g.team2_slug===team.slug;
    if(!(is1||is2)) return acc;
    const s1 = Number(g.score_team1||0), s2 = Number(g.score_team2||0);
    const win = is1 ? s1>s2 : s2>s1;
    if(win) acc.w++; else acc.l++; return acc;
  }, {w:0,l:0});
  const recEl = Q('#record') || Q('#team-record'); if(recEl) recEl.textContent = `Record: ${rec.w}-${rec.l}`;

  function gameIdOf(g){
    return g.id || g.game_id || g.gid || g.uid || g.key || `${g.date||''}_${g.team1_slug||g.team||''}_${g.team2_slug||g.opp||''}`;
  }

  const tb = Q('#gamelog-body') || Q('#team-games-body'); if(tb){
    tb.innerHTML='';
    games.filter(g => g.team1_slug===team.slug || g.team2_slug===team.slug).forEach(g => {
      const tr = document.createElement('tr');
      const score = `${g.score_team1||0} - ${g.score_team2||0}`;
      const win = (g.team1_slug===team.slug) ? (Number(g.score_team1||0) > Number(g.score_team2||0))
                                             : (Number(g.score_team2||0) > Number(g.score_team1||0));
      const gid = gameIdOf(g);
      tr.innerHTML = `<td>${fmt(g.date)}</td><td><a href="game.html?game_id=${gid}">${fmt(`${g.team1_slug} vs ${g.team2_slug}`)}</a></td><td>${score}</td><td>${win?'<span class="badge-win">W</span>':'<span class="badge-loss">L</span>'}</td><td>${fmt(g.season)}</td>`;
      tb.appendChild(tr);
    });
  }
}

// ---------- TEAM LEADERS (JSON-first, fuzzy match, alias keys, CSV fallback) ----------
async function renderLeaders(team){
  // mount
  let host = document.getElementById('team-leaders');
  if(!host){
    host = document.createElement('section');
    host.id = 'team-leaders';
    host.className = 'card';
    (document.querySelector('#roster')?.parentElement || document.querySelector('.team-section') || document.body)
      .appendChild(host);
  }
  host.innerHTML = '<h3>Team Leaders</h3>';

  // controls
  const controls = document.createElement('div'); controls.className='hstack';
  const statSel = document.createElement('select'); statSel.className='select';
  const STAT_OPTIONS = [
    ['pts','Points'],['trb','Rebounds'],['ast','Assists'],['stl','Steals'],['blk','Blocks'],
    ['fgm','FGM'],['fga','FGA'],['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']
  ];
  STAT_OPTIONS.forEach(([k,l])=>{ const o=document.createElement('option'); o.value=k; o.textContent=l; statSel.appendChild(o); });
  statSel.value='pts';
  const modeBtn=document.createElement('button'); modeBtn.className='btn'; modeBtn.dataset.mode='avg'; modeBtn.textContent='Averages';
  controls.appendChild(statSel); controls.appendChild(modeBtn); host.appendChild(controls);
  const list=document.createElement('div'); list.className='section'; host.appendChild(list);

  // helpers
  const renderTable = (rows) => {
    list.innerHTML = '';
    const tbl = document.createElement('table'); tbl.className='table';
    tbl.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>';
    const tb = document.createElement('tbody');
    rows.forEach((r,i)=>{
      const v = Number(r.value ?? r.val ?? 0);
      const tr=document.createElement('tr');
      tr.innerHTML = `<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(v*10)/10).toFixed(1)}</td>`;
      tb.appendChild(tr);
    });
    tbl.appendChild(tb);
    list.appendChild(tbl);
  };

  // try leaders.json (with fuzzy team key + stat aliases)
  let pre=null, reason='';
  try{
    const lj = await loadJSON('data/leaders.json');
    const teamsObj = lj?.teams || {};
    const keys = Object.keys(teamsObj);
    const wantSlug = slugify(team.slug);
    const wantName = norm(team.name);

    const key =
      keys.find(k => k===wantSlug) ||
      keys.find(k => k.includes(wantSlug)) ||
      keys.find(k => norm(k.replace(/-/g,' '))===wantName) || null;

    pre = key ? teamsObj[key] : null;
    if(!pre) reason = `leaders.json has no team matching "${team.slug}"`;
  }catch(e){
    // ignore; will fallback
  }

  const STAT_ALIASES = { reb:'trb', rebs:'trb', rbd:'trb', assists:'ast', steals:'stl', blocks:'blk', threes:'3pm', '3ptm':'3pm', '3pt':'3pm' };
  const resolveStatKey = (k, mode) => {
    if(!pre?.leaders) return k;
    if (pre.leaders[mode]?.[k]) return k;
    const alt = STAT_ALIASES[k] || k;
    if (pre.leaders[mode]?.[alt]) return alt;
    return pre.leaders[mode]?.['pts'] ? 'pts' : k;
  };

  if (pre?.leaders){
    const refreshFromPre = () => {
      const mode = modeBtn.dataset.mode; 
      const pick = resolveStatKey(statSel.value, mode);
      const arr = pre.leaders?.[mode]?.[pick] || [];
      if (!arr.length) {
        list.innerHTML = `<div class="text-sm text-muted">No leaders for "${pick}" (${mode}). ${reason || ''}</div>`;
        return;
      }
      renderTable(arr);
    };
    statSel.addEventListener('change', refreshFromPre);
    modeBtn.addEventListener('click', ()=>{ 
      modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg';
      modeBtn.textContent  = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals';
      refreshFromPre();
    });
    refreshFromPre();
    return;
  }

  // Fallback: compute live from roster CSVs
  try{
    const players = await loadJSON('data/players.json');
    const matchTeam = (cell) => {
      const cSlug=slugify(cell), cNorm=norm(cell), tSlug=slugify(team.slug), tNorm=norm(team.name);
      return cSlug===tSlug || cSlug.includes(tSlug) || cNorm===tNorm || cNorm.includes(tNorm);
    };
    const roster=(team.roster||[]).map(sl=>players.find(p=>p.slug===sl)).filter(Boolean);
    const csvs = await Promise.all(roster.map(p=>p?.csvUrl?fetchCsv(p.csvUrl):Promise.resolve([])));
    const preAgg = roster.map((p,i)=>{
      const rows=(csvs[i]||[]).filter(r=>matchTeam(r.team||''));
      const avg=computePlayerAverages(rows);
      const tot=rows.reduce((a,r)=>{ const n=k=>Number(r[k]||0);
        a.pts+=n('pts'); a.trb+=Number(r['totrb']||n('or')+n('dr')); a.ast+=n('ass')||n('hock ass');
        a.stl+=n('st'); a.blk+=n('bs'); a.tov+=n('to'); a.fgm+=n('fg'); a.fga+=n('fga');
        a['3pm']+=n('3p'); a['3pa']+=n('3pa'); a.oreb+=n('or'); a.dreb+=n('dr');
        return a;
      }, {pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,'3pm':0,'3pa':0,oreb:0,dreb:0});
      return {name:p.name, avg, tot};
    });
    const refreshCsv = ()=>{
      const mode=modeBtn.dataset.mode, stat=statSel.value;
      const rows = preAgg.map(d=>({name:d.name, value: mode==='avg'?(d.avg[stat]||0):(d.tot[stat]||0)})).sort((a,b)=>b.value-a.value);
      renderTable(rows);
    };
    statSel.addEventListener('change', refreshCsv);
    modeBtn.addEventListener('click', ()=>{ 
      modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg';
      modeBtn.textContent  = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals';
      refreshCsv();
    });
    refreshCsv();
  }catch(err){
    list.innerHTML = '<div class="text-sm text-muted">Leaders unavailable (CSV fallback failed).</div>';
    console.error('leaders CSV fallback failed:', err);
  }
}

// ---------- boot ----------
async function init(){
  initThemeToggle();
  const [teams, players] = await Promise.all([loadJSON('data/teams.json'), loadJSON('data/players.json')]);
  const slug = new URL(location.href).searchParams.get('team');
  const team = teams.find(t=>t.slug===slug);
  if(!team) return;

  await renderHeaderAndLog(team);
  await renderRoster(team, players);
  await renderLeaders(team);
}
window.addEventListener('DOMContentLoaded', init);
