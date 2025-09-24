// js/game.js
import { fetchCsv, initThemeToggle } from './app.js';

// theme toggle to keep dark/light consistent
initThemeToggle();

const qs = new URLSearchParams(location.search);
const gameId = qs.get('game_id');

// 🔗 PUBLISHED *Index* tab (File ▸ Share ▸ Publish to web → Link → CSV)
// Make sure this URL points to the Index tab's gid.
const INDEX_CSV =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSGdu88uH_BwBwrBtCZdnVGR1CNDWiazKjW_slOjBAvOMH7kOqJxNtWiNY1l3PIfLZhOyaPH43bZyb2/pub?gid=0&single=true&output=csv';

const headerEl = document.getElementById('game-header');
const tableEl  = document.getElementById('box-table');

function htm(str){const d=document.createElement('div');d.innerHTML=str.trim();return d.firstElementChild;}
const fmt = (v)=> (v === undefined || v === null || v === '' ? '—' : v);

(async function init() {
  if (!gameId) {
    headerEl.textContent = 'No game_id given';
    return;
  }

  // 1) read the Index, find our game
  const indexRows = await fetchCsv(INDEX_CSV);            // [{game_id,date,team1_slug,...,csv_url}]
  const entry = indexRows.find(r => (r.game_id || '').trim() === gameId);
  if (!entry) {
    headerEl.textContent = `Game not found: ${gameId}`;
    return;
  }

  // 2) read the per-game CSV
  const gameRows = await fetchCsv(entry.csv_url);

  // By our Python writer:
  // row0 => META, row1 => headers, row2+ => players
  const metaRow   = gameRows[0] || {};
  const headers   = Object.keys(gameRows[1] || {}); // not used, but helpful if you later want dynamic columns
  const players   = gameRows.slice(2);              // actual player lines

  // 3) header
  const t1 = entry.team1_slug, t2 = entry.team2_slug;
  const date = entry.date;
  const s1 = entry.score_team1, s2 = entry.score_team2;

  headerEl.innerHTML = '';
  headerEl.appendChild(htm(`
    <div class="title">${t1} <span class="muted">vs</span> ${t2}</div>
    <div class="pills">
      <span class="pill">Date: ${fmt(date)}</span>
      <span class="pill">Score: ${fmt(s1)} – ${fmt(s2)}</span>
    </div>
  `));

  // 4) table
  // choose a friendly set/order of columns for display
  const cols = [
    ['player_name','Player'],
    ['min','MIN'],
    ['fg','FG'], ['fga','FGA'],
    ['3p','3P'], ['3pa','3PA'],
    ['ft','FT'], ['fta','FTA'],
    ['or','OR'], ['dr','DR'], ['totrb','TRB'],
    ['ass','AST'], ['st','STL'], ['bs','BLK'], ['to','TOV'],
    ['pf','PF'], ['pts','PTS'],
  ];


  const table = document.createElement('table');
  table.className = 'table';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>${cols.map(([,label]) => `<th>${label}</th>`).join('')}</tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  players.forEach(p => {
    const tr = document.createElement('tr');
    tr.innerHTML = cols.map(([k]) => `<td>${fmt(p[k])}</td>`).join('');
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  tableEl.innerHTML = '';
  tableEl.appendChild(table);
})();
