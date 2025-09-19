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