import { fetchCsv } from './app.js';

const qs = new URLSearchParams(location.search);
const gameId = (qs.get('game_id') || '').trim();
const debug = qs.get('debug') === '1';

function show(msg) {
  if (!debug) return;
  const host = document.getElementById('game-header') || document.body;
  host.insertAdjacentHTML('beforeend', `<div style="
      margin:.5rem 0;padding:.5rem .75rem;border:1px dashed #bbb;
      font:12px/1.35 ui-monospace,monospace;background:rgba(0,0,0,.03)
    ">${msg}</div>`);
  console.log('[game]', msg);
}

function errorOut(msg) {
  const h = document.getElementById('game-header');
  if (h) h.textContent = msg;
  show('ERROR: ' + msg);
}

// 👉 PASTE YOUR *Index tab* published CSV here (export?format=csv&gid=<index_gid>)
const INDEX_CSV =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vSGdu88uH_BwBwrBtCZdnVGR1CNDWiazKjW_slOjBAvOMH7kOqJxNtWiNY1l3PIfLZhOyaPH43bZyb2/pub?gid=0&single=true&output=csv';

async function init() {
  if (!gameId) {
    errorOut('No game_id given');
    return;
  }
  show('game_id: ' + gameId);
  show('INDEX_CSV: ' + INDEX_CSV);

  // 1) Load Index
  let indexRows;
  try {
    indexRows = await fetchCsv(INDEX_CSV);
    show('Loaded index rows: ' + indexRows.length);
    if (!indexRows.length) {
      errorOut('Index CSV returned no rows. Is the link the Index tab CSV?');
      return;
    }
  } catch (e) {
    errorOut('Failed to fetch Index CSV: ' + e);
    return;
  }

  // 2) Find matching game row
  const entry = indexRows.find(r => (r.game_id || '').trim() === gameId);
  if (!entry) {
    errorOut('Game not found in Index: ' + gameId);
    return;
  }
  const gameCsvUrl = (entry.csv_url || '').trim();
  if (!gameCsvUrl) {
    errorOut('csv_url empty for ' + gameId);
    return;
  }
  show('gameCsvUrl: ' + gameCsvUrl);

  // 3) Fetch the per-game CSV
  let gameRows;
  try {
    // Add tiny cachebuster
    const url = gameCsvUrl + (gameCsvUrl.includes('?') ? '&' : '?') + 'cb=' + Date.now();
    gameRows = await fetchCsv(url);
    show('Loaded game rows: ' + gameRows.length);
  } catch (e) {
    errorOut('Failed to fetch game CSV: ' + e);
    return;
  }

  // First row is META (from the Python script)
  const meta = gameRows.find(r => (r.date || r.META || '').toString().toUpperCase() === 'META')
           || gameRows[0];

  // Render header
  document.getElementById('game-header').innerHTML = `
    <div class="title">${entry.team1_slug} vs ${entry.team2_slug}</div>
    <div class="pill">Date: ${entry.date}</div>
    <div class="pill">Score: ${entry.score_team1} – ${entry.score_team2}</div>
  `;

  // Render a very simple table for now (you can keep your richer renderer below)
  const table = document.getElementById('box-table');
  if (!table) return;
  if (!meta) { table.textContent = 'No META/rows in game CSV.'; return; }

  const head = Object.keys(gameRows[1] || {}).filter(k => k && k !== 'META'); // skip meta
  const thead = `<thead><tr>${head.map(h => `<th>${h.toUpperCase()}</th>`).join('')}</tr></thead>`;
  const bodyRows = gameRows.filter(r => (r.player_slug || r.player_name));
  const tbody = `<tbody>${bodyRows.map(r =>
      `<tr>${head.map(h => `<td>${r[h] ?? ''}</td>`).join('')}</tr>`
    ).join('')}</tbody>`;

  table.innerHTML = `<table class="card">${thead}${tbody}</table>`;
}

init();
