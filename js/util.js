// Utilities: CSV fetch & parse, table rendering, theme, number helpers

const CSV = {
  async fetch(url){
    const res = await fetch(url, { cache: "no-store" });
    if(!res.ok) throw new Error("Failed to fetch CSV: " + url);
    const text = await res.text();
    return CSV.parse(text);
  },
  // Very small parser that handles commas and newlines; quotes basic
  parse(text){
    const rows = [];
    let cur = [], cell = "", inQ = false;
    for (let i=0;i<text.length;i++){
      const c = text[i], n = text[i+1];
      if (c === '"' && inQ && n === '"'){ cell += '"'; i++; continue; }
      if (c === '"'){ inQ = !inQ; continue; }
      if (c === ',' && !inQ){ cur.push(cell.trim()); cell=""; continue; }
      if ((c === '\n' || c === '\r') && !inQ){
        if (cell!=="" || cur.length){ cur.push(cell.trim()); rows.push(cur); cur=[]; cell=""; }
        continue;
      }
      cell += c;
    }
    if (cell!=="" || cur.length) { cur.push(cell.trim()); rows.push(cur); }
    if (!rows.length) return {header:[], rows:[]};
    const header = rows.shift().map(h => h.trim());
    const objs = rows.filter(r=>r.length && r.some(x=>x!=="")).map(r => {
      const o = {}; header.forEach((h,idx)=>o[h]=r[idx] ?? ""); return o;
    });
    return { header, rows: objs };
  }
};

function $(sel, root=document){ return root.querySelector(sel); }
function $all(sel, root=document){ return Array.from(root.querySelectorAll(sel)); }

function renderTable(container, header, rows){
  const el = (typeof container === "string") ? $(container) : container;
  const cols = header;
  const htmlHeader = cols.map(c=>`<th>${c}</th>`).join("");
  const htmlRows = rows.map(r=>{
    const tds = cols.map(c=>`<td>${(r[c] ?? "")}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  el.innerHTML = `<table><thead><tr>${htmlHeader}</tr></thead><tbody>${htmlRows}</tbody></table>`;
}

function toggleTheme(){
  const isDark = document.body.classList.toggle("theme-dark");
  if (isDark) this.textContent = "Light"; else this.textContent = "Dark";
}
function bindThemeToggle(){
  const btn = $("#themeToggle");
  if (btn) btn.addEventListener("click", toggleTheme);
}

function groupBy(arr, keyFn){
  return arr.reduce((acc, item)=>{
    const k = keyFn(item);
    (acc[k] = acc[k] || []).push(item);
    return acc;
  }, {});
}

// numeric helpers: attempt to coerce strings to numbers when possible
function toNum(v){
  if (v === null || v === undefined) return NaN;
  const x = parseFloat(String(v).replace(/[^0-9\.\-]/g,""));
  return Number.isFinite(x) ? x : NaN;
}

function sum(arr, key){ return arr.reduce((a,b)=>a + (toNum(key?b[key]:b) || 0), 0); }
function avg(arr, key){ if (!arr.length) return 0; return sum(arr,key) / arr.length; }
function maxBy(arr, key){ let m = -Infinity, ret=null; for(const r of arr){ const v = toNum(r[key]); if (v>m){ m=v; ret=r; } } return {max:m, row:ret}; }

export { CSV, $, $all, renderTable, bindThemeToggle, groupBy, sum, avg, maxBy, toNum };
