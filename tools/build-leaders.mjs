// tools/build-leaders.mjs
// Precomputes team leaders from players' CSVs into data/leaders.json
// Usage:  node tools/build-leaders.mjs

import fs from "node:fs/promises";

const PLAYERS_JSON = "data/players.json";
const TEAMS_JSON = "data/teams.json";
const OUT_JSON = "data/leaders.json";

const slugify = s => (s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
const norm = s => (s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const teamMatch = (cell, slug, name) => {
  const cSlug = slugify(cell), cNorm = norm(cell);
  const tSlug = slugify(slug), tNorm = norm(name);
  return cSlug===tSlug || cSlug.includes(tSlug) || cNorm===tNorm || cNorm.includes(tNorm);
};

async function parseCsv(url){
  // bust Google cache so the latest game is always included
  const cacheBusted = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`;

  // small retry-once helper in case of a transient 5xx
  async function fetchText(u){
    const res = await fetch(u, { cache: "no-store", headers: { "Cache-Control": "no-cache" } });
    if (!res.ok) throw new Error(`Fetch failed ${res.status} ${u}`);
    return res.text();
  }

  let text;
  try {
    console.log("Fetching CSV:", cacheBusted);
    text = await fetchText(cacheBusted);
  } catch (e) {
    console.warn("Fetch failed once, retrying:", e.message);
    const retryUrl = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()+1}`;
    text = await fetchText(retryUrl);
  }

  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(s=>s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (!lines[i]) continue;
    const parts = lines[i].split(",");
    const row = {};
    headers.forEach((h, idx) => row[h] = (parts[idx] || "").trim());
    rows.push(row);
  }
  return rows;
}

function computeAvg(rows){
  const acc = rows.reduce((a,r)=>{
    const n = k => Number(r[k]||0);
    a.games++;
    a.pts+=n("pts");
    a.trb+=Number(r["totrb"]||n("or")+n("dr"));
    a.ast+=Number(r["ass"]||r["hock ass"]||0);
    a.stl+=n("st"); a.blk+=n("bs"); a.tov+=n("to");
    a.fgm+=n("fg"); a.fga+=n("fga"); a.tp+=n("3p"); a.tpa+=n("3pa");
    a.oreb+=n("or"); a.dreb+=n("dr");
    a.ftm+=n("ft"); a.fta+=n("fta");
    return a;
  }, {games:0,pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,tp:0,tpa:0,oreb:0,dreb:0,ftm:0,fta:0});
  const avg = k => acc.games ? acc[k]/acc.games : 0;
  return {
    pts: avg("pts"), trb: avg("trb"), ast: avg("ast"), stl: avg("stl"), blk: avg("blk"), tov: avg("tov"),
    fgm: avg("fgm"), fga: avg("fga"), "3pm": avg("tp"), "3pa": avg("tpa"),
    oreb: avg("oreb"), dreb: avg("dreb"),
    fgPct: acc.fga ? acc.fgm/acc.fga : 0,
    tpPct: acc.tpa ? acc.tp/acc.tpa : 0,
    ftPct: acc.fta ? acc.ftm/acc.fta : 0
  };
}

function computeTot(rows){
  const z = {pts:0,trb:0,ast:0,stl:0,blk:0,tov:0,fgm:0,fga:0,"3pm":0,"3pa":0,oreb:0,dreb:0};
  for(const r of rows){
    const n = k => Number(r[k]||0);
    z.pts+=n("pts");
    z.trb+=Number(r["totrb"]||n("or")+n("dr"));
    z.ast+=Number(r["ass"]||r["hock ass"]||0);
    z.stl+=n("st"); z.blk+=n("bs"); z.tov+=n("to");
    z.fgm+=n("fg"); z.fga+=n("fga"); z["3pm"]+=n("3p"); z["3pa"]+=n("3pa");
    z.oreb+=n("or"); z.dreb+=n("dr");
  }
  return z;
}

const STAT_KEYS = ["pts","trb","ast","stl","blk","tov","fgm","fga","3pm","3pa","oreb","dreb"];

async function main(){
  const [players, teams] = await Promise.all([
    fs.readFile(PLAYERS_JSON, "utf-8").then(JSON.parse),
    fs.readFile(TEAMS_JSON, "utf-8").then(JSON.parse)
  ]);

  // Pre-fetch all player CSVs in parallel
  const rosterPlayers = players.filter(p => p.csvUrl);
  const csvMap = new Map();
  await Promise.all(rosterPlayers.map(async p => {
    try{
      const rows = await parseCsv(p.csvUrl);
      csvMap.set(p.slug, rows);
    }catch(e){
      console.warn("Failed CSV:", p.slug, e.message);
      csvMap.set(p.slug, []);
    }
  }));

  const out = {
    generated_at: new Date().toISOString(),
    version: 1,
    teams: {}
  };

  for(const team of teams){
    const roster = (team.roster || []).map(slug => players.find(p=>p.slug===slug)).filter(Boolean);
    const entries = [];
    for(const p of roster){
      const rows = (csvMap.get(p.slug) || []).filter(r => teamMatch(r["team"]||"", team.slug, team.name));
      const avg = computeAvg(rows);
      const tot = computeTot(rows);
      entries.push({ playerId: p.slug, name: p.name, avg, tot });
    }
    // Build leaders per stat
    const leaders = { avg: {}, tot: {} };
    for(const key of STAT_KEYS){
      leaders.avg[key] = [...entries].map(e => ({ playerId:e.playerId, name:e.name, value: e.avg[key] || 0 })).sort((a,b)=>b.value-a.value);
      leaders.tot[key] = [...entries].map(e => ({ playerId:e.playerId, name:e.name, value: e.tot[key] || 0 })).sort((a,b)=>b.value-a.value);
    }
    out.teams[team.slug] = {
      name: team.name,
      players: entries,
      leaders
    };
  }

  await fs.writeFile(OUT_JSON, JSON.stringify(out, null, 2), "utf-8");
  console.log(`Wrote ${OUT_JSON} with ${Object.keys(out.teams).length} teams.`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
