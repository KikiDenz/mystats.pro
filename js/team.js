import { initThemeToggle, loadJSON, fetchCsv, computePlayerAverages } from './app.js';

const Q = s => document.querySelector(s);
const fmt = v => (v==null || v==='') ? '—' : v;

const INDEX_CSV = "https://docs.google.com/spreadsheets/d/15zxpQZJamQfEz07qFtZAI_738cI2rjc2qrrz-q-8Bo0/export?format=csv&gid=0";

function parseRows(text){
  const lines = text.trim().split(/\r?\n/);
  const heads = lines[0].split(',').map(h=>h.trim().toLowerCase());
  const out=[];
  for(let i=1;i<lines.length;i++){
    if(!lines[i]) continue;
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

const slugify = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const norm = s => (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const matchTeam = (cell, team) => {
  const cSlug=slugify(cell), cNorm=norm(cell), tSlug=slugify(team.slug), tNorm=norm(team.name);
  return cSlug===tSlug || cSlug.includes(tSlug) || cNorm===tNorm || cNorm.includes(tNorm);
};

function ensureLeadersContainer(){
  let sec = Q('#team-leaders-section');
  if(!sec){
    const main = Q('main.container') || document.body;
    sec = document.createElement('section'); sec.className='section'; sec.id='team-leaders-section';
    const h = document.createElement('h3'); h.textContent='Team Leaders'; sec.appendChild(h);
    const wrap = document.createElement('div'); wrap.id='team-leaders'; sec.appendChild(wrap);
    main.appendChild(sec);
  }
  return Q('#team-leaders');
}

async function renderRoster(team, players){
  const grid = Q('#roster'); if(!grid) return;
  grid.innerHTML='';
  (team.roster||[]).forEach(sl => {
    const p = players.find(x=>x.slug===sl); if(!p) return;
    const a = document.createElement('a');
    a.className='player-tile'; a.href=`player.html?player=${p.slug}`;
    a.innerHTML = `<img src="${p.image||'assets/player.png'}" alt=""><div><div class="nm">${p.name}</div><div class="num">#${p.number||''}</div></div>`;
    grid.appendChild(a);
  });
}

async function renderHeaderAndLog(team){
  const games = await loadIndex();
  const title = Q('#team-name'); if(title) title.textContent = team.name;

  const rec = games.reduce((acc,g)=>{
    const is1 = g.team1_slug===team.slug, is2 = g.team2_slug===team.slug;
    if(!(is1||is2)) return acc;
    const s1 = Number(g.score_team1||0), s2 = Number(g.score_team2||0);
    const win = is1 ? s1>s2 : s2>s1;
    if(win) acc.w++; else acc.l++; return acc;
  }, {w:0,l:0});
  const recEl = Q('#record'); if(recEl) recEl.textContent = `${rec.w}-${rec.l}`;

  const tb = Q('#gamelog-body'); if(tb){
    tb.innerHTML='';
    games.filter(g => g.team1_slug===team.slug || g.team2_slug===team.slug).forEach(g => {
      const tr = document.createElement('tr');
      const score = `${g.score_team1||0} - ${g.score_team2||0}`;
      const win = (g.team1_slug===team.slug) ? (Number(g.score_team1||0) > Number(g.score_team2||0))
                                             : (Number(g.score_team2||0) > Number(g.score_team1||0));
      tr.innerHTML = `<td>${fmt(g.date)}</td><td>${fmt(`${g.team1_slug} vs ${g.team2_slug}`)}</td><td>${score}</td><td>${win?'<span class="badge-win">W</span>':'<span class="badge-loss">L</span>'}</td><td>${fmt(g.season)}</td>`;
      tb.appendChild(tr);
    });
  }
}

async function renderLeaders(team){
  const host = ensureLeadersContainer(); if(!host) return;
  host.innerHTML='';

  const controls = document.createElement('div'); controls.className='hstack';
  const statSel = document.createElement('select'); statSel.className='select';
  [['pts','Points'],['trb','Rebounds'],['ast','Assists'],['stl','Steals'],['blk','Blocks'],['fgm','FGM'],['fga','FGA'],['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']].forEach(([k,l])=>{
    const o=document.createElement('option'); o.value=k; o.textContent=l; statSel.appendChild(o);
  });
  statSel.value='pts';
  const modeBtn = document.createElement('button'); modeBtn.className='btn'; modeBtn.dataset.mode='avg'; modeBtn.textContent='Averages';
  controls.appendChild(statSel); controls.appendChild(modeBtn);
  host.appendChild(controls);
  const list = document.createElement('div'); list.className='card'; host.appendChild(list);

  // leaders.json first
  let pre=null;
  try { const lj = await loadJSON('data/leaders.json'); pre = lj?.teams?.[team.slug] || null; } catch(e){ pre=null; }

  if(pre?.leaders){
    function refresh(){
      list.innerHTML='';
      const mode=modeBtn.dataset.mode, stat=statSel.value;
      const arr = pre.leaders?.[mode]?.[stat] || [];
      const tbl = document.createElement('table'); tbl.className='table';
      tbl.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>';
      const tb = document.createElement('tbody');
      arr.forEach((r,i)=>{
        const tr=document.createElement('tr');
        const val = Number(r.value||0);
        tr.innerHTML=`<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(val*10)/10).toFixed(1)}</td>`;
        tb.appendChild(tr);
      });
      tbl.appendChild(tb); list.appendChild(tbl);
    }
    statSel.addEventListener('change', refresh);
    modeBtn.addEventListener('click', ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals'; refresh(); });
    refresh();
    return;
  }

  // fallback live path
  const players = await loadJSON('data/players.json');
  const roster=(team.roster||[]).map(sl=>players.find(p=>p.slug===sl)).filter(Boolean);
  const csvs = await Promise.all(roster.map(p=>p.csvUrl?fetchCsv(p.csvUrl):Promise.resolve([])));
  const preAgg = roster.map((p,i)=>{
    const rows=(csvs[i]||[]).filter(r=>matchTeam(r.team||'', team));
    const avg=computePlayerAverages(rows);
    const tot=rows.reduce((a,r)=>{
      const n=k=>Number(r[k]||0);
      a.pts+=n('pts'); a.trb+=Number(r['totrb']||n('or')+n('dr')); a.ast+=n('ass')||n('hock ass');
      a.stl+=n('st'); a.blk+=n('bs'); a.tov+=n('to'); a.fgm+=n('fg'); a.fga+=n('fga');
      a['3pm']+=n('3p'); a['3pa']+=n('3pa'); a.oreb+=n('or'); a.dreb+=n('dr');
      return a;
    }, {pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,'3pm':0,'3pa':0,oreb:0,dreb:0});
    return {name:p.name, avg, tot};
  });
  function refresh(){
    list.innerHTML='';
    const mode=modeBtn.dataset.mode, stat=statSel.value;
    const arr = preAgg.map(d=>({name:d.name, value: mode==='avg'?(d.avg[stat]||0):(d.tot[stat]||0)})).sort((a,b)=>b.value-a.value);
    const tbl = document.createElement('table'); tbl.className='table';
    tbl.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>';
    const tb = document.createElement('tbody');
    arr.forEach((r,i)=>{ const tr=document.createElement('tr'); tr.innerHTML=`<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(r.value*10)/10).toFixed(1)}</td>`; tb.appendChild(tr); });
    tbl.appendChild(tb); list.appendChild(tbl);
  }
  statSel.addEventListener('change', refresh);
  modeBtn.addEventListener('click', ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals'; refresh(); });
  refresh();
}

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
