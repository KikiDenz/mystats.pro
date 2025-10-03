import { initThemeToggle, fetchCsv, computePlayerAverages, byYear, loadJSON, initSearch, pct, oneDec } from './app.js';

const REQUIRED_PLAYER_COLS = ['date','position','team','opponent','min','fg','fga','3p','3pa','ft','fta','or','dr','totrb','ass','pf','st','bs','to','pts'];
function validateColumns(rows, required){
  if (!rows || !rows.length) return required;
  const keys = Object.keys(rows[0]||{});
  return required.filter(k => !keys.includes(k));
}

function getParam(name) {
  const url = new URL(window.location.href);
  return url.searchParams.get(name);
}

function slugToTitle(slug){
  return (slug||'').replaceAll('-', ' ').replace(/\b\w/g, c=>c.toUpperCase());
}


  // robust team matching
  function __slugify(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,''); }
  function __norm(s){ return (s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim(); }
  function __teamMatches(cell, teamSlug, teamName){
    const cSlug = __slugify(cell), cNorm = __norm(cell);
    const tSlug = __slugify(teamSlug), tNorm = __norm(teamName);
    return !!(cSlug===tSlug || cSlug.includes(tSlug) || cNorm===tNorm || cNorm.includes(tNorm));
  }

function getSeasonParam() {
  const url = new URL(window.location.href);
  const s = url.searchParams.get('season');
  return s && /^\d{4}$/.test(s) ? s : null;
}

function fillCircles(stats){
  document.getElementById("c-pts").textContent = oneDec(stats.pts);
  document.getElementById("c-trb").textContent = oneDec(stats.trb);
  document.getElementById("c-ast").textContent = oneDec(stats.ast);
  document.getElementById("c-fg").textContent  = pct(stats.fgPct);
  document.getElementById("c-3p").textContent  = pct(stats.tpPct);
  document.getElementById("c-ft").textContent  = pct(stats.ftPct);
  const set = (id,val)=>{ const el=document.getElementById(id); if(el) el.textContent = oneDec(val||0); };
  set('c-stl', stats.stl);
  set('c-blk', stats.blk);
  set('c-fgm', stats.fgm);
  set('c-fga', stats.fga);
  set('c-3pm', stats["3pm"]);
  set('c-3pa', stats["3pa"]);
  set('c-or', stats.oreb);
  set('c-dr', stats.dreb);
  set('c-tov', stats.tov);
}

async function init() {
  initThemeToggle();
  initSearch();
  const slug = getParam("player");
  const players = await loadJSON("data/players.json");
  const me = players.find(p => p.slug === slug) || players[0];

  document.getElementById("player-name").textContent = me.name;
  document.getElementById("player-meta").textContent = `#${me.number} • ${me.position}`;
  document.getElementById("player-img").src = me.image;

  // Build team links pills
  const teamLinks = document.getElementById("player-teamlinks");
  if (teamLinks) {
    teamLinks.innerHTML = "";
    (me.teams||[]).forEach(slug => {
      const a = document.createElement('a');
      a.href = `team.html?team=${slug}`;
      a.className = 'pill';
      a.textContent = slugToTitle(slug);
      teamLinks.appendChild(a);
    });
  }

  // Load player CSV (if present)
  let rows = [];
  if (me.csvUrl) {
    rows = await fetchCsv(me.csvUrl);
  const missing = validateColumns(rows, REQUIRED_PLAYER_COLS);
  const v = document.getElementById('validator');
  if (missing.length) { v.style.display='block'; v.innerHTML = `<strong>Heads up:</strong> Missing columns in player sheet → ${missing.join(', ')}`;}
  }
  // Build team filter if multiple
  const teamSel = document.getElementById("team-filter");
  teamSel.innerHTML = "";
  (me.teams || []).forEach(t => {
    const opt = document.createElement("option");
    opt.value = t;
    opt.textContent = t.replaceAll('-', ' ').replace(/\b\w/g, c=>c.toUpperCase());
    teamSel.appendChild(opt);
  });

  // Year tabs (season vs career)
  const yearGroups = byYear(rows);
  const years = Object.keys(yearGroups).filter(y=>y !== 'Unknown').sort();
  const latest = years.length ? years[years.length-1] : null;

  // Tabs
  const tabCareer = document.getElementById("tab-career");
  const tabSeason = document.getElementById("tab-season");
  tabCareer.onclick = () => {
    tabCareer.classList.add("active"); tabSeason.classList.remove("active");
    fillCircles(computePlayerAverages(rows));
    renderGameLog(rows);
  };
  tabSeason.onclick = () => {
    tabSeason.classList.add("active"); tabCareer.classList.remove("active");
    const yr = document.getElementById("season-year").value;
    const subset = yearGroups[yr] || [];
    fillCircles(computePlayerAverages(subset));
    renderGameLog(subset);
  };

  // Season year dropdown
  const seasonYear = document.getElementById("season-year");
  seasonYear.innerHTML = "";
  years.reverse().forEach(y => {
    const opt = document.createElement("option");
    opt.value = y; opt.textContent = y;
    seasonYear.appendChild(opt);
  });
  const forced = getSeasonParam();
  if (forced && years.includes(forced)) seasonYear.value = forced; else if (latest) seasonYear.value = latest;
  seasonYear.onchange = () => tabSeason.click();

  // Initial view: Career or forced Season via ?season=YYYY
  const forcedSeason = getSeasonParam();
  if (forcedSeason && years.includes(forcedSeason)) {
    tabSeason.classList.add("active"); tabCareer.classList.remove("active");
    const subset = yearGroups[forcedSeason] || [];
    fillCircles(computePlayerAverages(subset));
    renderGameLog(subset);
  } else {
    tabCareer.classList.add("active");
    fillCircles(computePlayerAverages(rows));
    renderGameLog(rows);
  }

  // Team filter behavior (filters rows by team column)
  teamSel.onchange = () => {
    const val = teamSel.value;
    const filt = val ? rows.filter(r => (r['team']||'').toLowerCase().includes(val.replace('-', ' '))) : rows;
    // keep whatever tab is active
    if (tabSeason.classList.contains("active")) {
      const yr = seasonYear.value;
      const yrRows = filt.filter(r => (new Date(r['date'])).getFullYear() == yr);
      fillCircles(computePlayerAverages(yrRows));
      renderGameLog(yrRows);
    } else {
      fillCircles(computePlayerAverages(filt));
      renderGameLog(filt);
    }
  };


  // ----- Player Rank block (leaders within selected team) -----
  async function renderPlayerRank() {
    const host = document.getElementById('player-rankblock');
    if (!host) return;
    const teams = await loadJSON('data/teams.json');
    const allPlayers = await loadJSON('data/players.json');
    const meTeamSlugs = me.teams || [];
    if (!meTeamSlugs.length) { host.textContent = 'No teams found.'; return; }

    host.innerHTML = '';
    const controls = document.createElement('div');
    controls.className = 'hstack';
    const statSel = document.createElement('select'); statSel.className = 'select';
    const opts = [
      ['pts','Points'],['trb','Rebounds'],['ast','Assists'],
      ['stl','Steals'],['blk','Blocks'],['fgm','FGM'],['fga','FGA'],
      ['3pm','3PM'],['3pa','3PA'],['oreb','Off Reb'],['dreb','Def Reb'],['tov','Turnovers']
    ];
    opts.forEach(([k,l]) => { const o=document.createElement('option'); o.value=k; o.textContent=l; statSel.appendChild(o); });
    statSel.value = 'pts';
    const modeBtn = document.createElement('button'); modeBtn.className='btn'; modeBtn.textContent='Averages'; modeBtn.dataset.mode='avg';
    const teamSel2 = document.createElement('select'); teamSel2.className='select';
    meTeamSlugs.forEach(s => { const o=document.createElement('option'); o.value=s; o.textContent = slugToTitle(s); teamSel2.appendChild(o); });

    controls.appendChild(statSel); controls.appendChild(modeBtn); controls.appendChild(teamSel2);
    host.appendChild(controls);

    const list = document.createElement('div'); list.className='section'; host.appendChild(list);

    async function fetchRosterAgg(teamSlug) {
      const team = teams.find(t => t.slug === teamSlug);
      if (!team) return [];
      const rosterSlugs = team.roster || [];
      const entries = [];
      for (const ps of rosterSlugs) {
        const p = allPlayers.find(x => x.slug === ps);
        if (!p || !p.csvUrl) continue;
        try {
          const rows = await fetchCsv(p.csvUrl);
          // keep only rows for this team
          const filt = rows.filter(r => __teamMatches(r['team']||'', teamSlug, slugToTitle(teamSlug)));
          const avg = computePlayerAverages(filt);
          const totals = filt.reduce((a,r)=>{
            const num = k => Number(r[k]||0);
            a.pts+=num('pts'); a.trb+=Number(r['totrb']||Number(r['or']||0)+Number(r['dr']||0));
            a.ast+=num('ass')||num('hock ass'); a.stl+=num('st'); a.blk+=num('bs'); a.tov+=num('to');
            a.fgm+=num('fg'); a.fga+=num('fga'); a["3pm"]+=num('3p'); a["3pa"]+=num('3pa'); a.oreb+=num('or'); a.dreb+=num('dr');
            return a;
          }, {pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,"3pm":0,"3pa":0,oreb:0,dreb:0});
          entries.push({ playerId:p.slug, name:p.name, avg, tot:totals });
        } catch(e){ console.warn('csv fail', p.slug, e); }
      }
      return entries;
    }

    async function refresh(){
      const stat = statSel.value;
      const mode = modeBtn.dataset.mode; // avg | tot
      const teamSlug = teamSel2.value;
      list.innerHTML = '';
      const data = await fetchRosterAgg(teamSlug);
      if (!data.length) { list.textContent = 'No data yet…'; return; }
      const rows = data.map(d => ({ name:d.name, playerId:d.playerId, val: mode==='avg' ? (d.avg[stat] || 0) : (d.tot[stat] || 0) }));
      rows.sort((a,b)=> (b.val - a.val));
      // render
      const table = document.createElement('table'); table.className='table';
      table.innerHTML = '<thead><tr><th>#</th><th>Player</th><th>Value</th></tr></thead>';
      const tb=document.createElement('tbody');
      rows.forEach((r,i)=>{ const tr=document.createElement('tr'); tr.innerHTML = `<td>${i+1}</td><td>${r.name}</td><td>${(Math.round(r.val*10)/10).toFixed(1)}</td>`; tb.appendChild(tr); });
      table.appendChild(tb);
      list.appendChild(table);
    }
    controls.addEventListener('change', refresh);
    modeBtn.addEventListener('click', ()=>{ modeBtn.dataset.mode = modeBtn.dataset.mode==='avg' ? 'tot' : 'avg'; modeBtn.textContent = modeBtn.dataset.mode==='avg' ? 'Averages' : 'Totals'; refresh(); });
    await refresh();
  }
  // function currentRows(allRows, teamSel, tabSeason, seasonYear) {
  //   let out = allRows.slice();
  //   const t = teamSel.value;
  //   if (t) out = out.filter(r => (r.team || '').toLowerCase().includes(t.replace('-', ' ')));
  //   if (tabSeason.classList.contains("active")) {
  //     const yr = seasonYear.value;
  //     out = out.filter(r => (new Date(r.date)).getFullYear() == yr);
  //   }
  //   return out;
  // }


  function renderGameLog(rws) {
    const tbody = document.getElementById("gamelog-body");
    tbody.innerHTML = "";
    rws.forEach(r => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r['date']||''}</td>
        <td>${r['team']||''}</td>
        <td>${r['opponent']||''}</td>
        <td>${r['min']||''}</td>
        <td>${r['fg']||''}/${r['fga']||''}</td>
        <td>${r['3p']||''}/${r['3pa']||''}</td>
        <td>${r['ft']||''}/${r['fta']||''}</td>
        <td>${r['or']||0}</td>
        <td>${r['dr']||0}</td>
        <td>${r['totrb']|| ( (Number(r['or']||0))+ (Number(r['dr']||0)) )}</td>
        <td>${r['ass']||r['hock ass']||0}</td>
        <td>${r['st']||0}</td>
        <td>${r['bs']||0}</td>
        <td>${r['to']||0}</td>
        <td>${r['pts']||0}</td>
      `;
      tbody.appendChild(tr);
    });
  }
}

window.addEventListener("DOMContentLoaded", init);