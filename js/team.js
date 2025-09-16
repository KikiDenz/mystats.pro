import { CSV, $, renderTable, bindThemeToggle } from "./util.js";

// Google Sheet CSV tabs provided by the user
const SHEETS = {
  sweatyAlready: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7JWJjsx4iZtJtf6PTOR6_adf9pdbtFlglN8aX2_3QynveLtg427bYcD0OzlFpxEoNaMFYwaIFj12T/pub?gid=972116953&single=true&output=csv",
  prettyGood: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7JWJjsx4iZtJtf6PTOR6_adf9pdbtFlglN8aX2_3QynveLtg427bYcD0OzlFpxEoNaMFYwaIFj12T/pub?gid=0&single=true&output=csv",
  duncles: "https://docs.google.com/spreadsheets/d/e/2PACX-1vR7JWJjsx4iZtJtf6PTOR6_adf9pdbtFlglN8aX2_3QynveLtg427bYcD0OzlFpxEoNaMFYwaIFj12T/pub?gid=2055150665&single=true&output=csv"
};

// Minimal roster metadata (extend as you like)
const ROSTER = [
  { name: "Kyle Denzin", number: 22, pos: "G", team: "sweatyAlready",
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=0&single=true&output=csv" },
  { name: "Levi Denzin", number: 28, pos: "G/F", team: "sweatyAlready",
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=2091114860&single=true&output=csv" },
  { name: "Findlay Wendtman", number: 1, pos: "F", team: "sweatyAlready",
    csv: "https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=863688176&single=true&output=csv" },
];

async function loadTeam(teamKey){
  const url = SHEETS[teamKey];
  $("#gamesTable").innerHTML = "Loading games…";
  const { header, rows } = await CSV.fetch(url);

  // Try to compute W-L record heuristically if columns exist
  let wins = 0, losses = 0;
  const resultKey = header.find(h => /result/i.test(h)) || null;
  if (resultKey){
    for (const r of rows){
      const v = (r[resultKey] || "").toString().trim().toUpperCase();
      if (v.startsWith("W")) wins++;
      else if (v.startsWith("L")) losses++;
    }
  }
  $("#recordValue").textContent = (wins+losses) ? `${wins}-${losses}` : "—";

  // Render games table using whatever headers are present
  renderTable("#gamesTable", header, rows);

  // Roster
  const roster = ROSTER.filter(p => p.team === teamKey);
  $("#rosterList").innerHTML = roster.map(p => `
    <a class="person" href="./player.html?name=${encodeURIComponent(p.name)}">
      <div class="pill">#${p.number}</div>
      <div>
        <div class="name">${p.name}</div>
        <div class="meta">${p.pos}</div>
      </div>
    </a>
  `).join("");
}

function init(){
  bindThemeToggle();
  const teamSelect = $("#teamSelect");
  loadTeam(teamSelect.value);
  teamSelect.addEventListener("change", e => loadTeam(e.target.value));
}

init();
