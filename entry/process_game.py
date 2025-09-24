#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EasyStats → Google Sheets ingester (v3)
- Prompts (or accepts CLI arg) for an HTML export path; sanitises quotes/whitespace; makes absolute
- Loads config.json relative to this script's folder (no CWD issues)
- Uses Spreadsheet IDs (open_by_key) to avoid Drive API dependency
- Parses teams/score/date from <title>, and player stats from the first <table>
- Creates/updates a per-game tab in Box Scores with META row
- Maintains an Index tab in Box Scores with a csv_url to the exact game tab
- Appends to legacy Players/Teams sheets using your existing tab names & column order
"""

from __future__ import annotations
import os, re, sys, json
from pathlib import Path
from datetime import datetime
from typing import Tuple, List, Dict, Any

from bs4 import BeautifulSoup
import gspread
from oauth2client.service_account import ServiceAccountCredentials


# ------------------------- helpers -------------------------

def slugify_team(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', (name or "").lower()).strip('-')

def parse_title_for_match(title: str) -> Tuple[str, int | None, str, int | None, str]:
    """
    Returns (team1_name, score1 or None, team2_name, score2 or None, date_iso)
    Supports:
      "TeamA 45 at TeamB 60"
      "TeamA vs TeamB box-scores-23 Sep 2025"
      "TeamA vs TeamB - 23 Sep 2025"
    """
    title = (title or "").strip()

    # Pattern 1: "TeamA <scoreA> at TeamB <scoreB>"
    m = re.match(r'^(?P<t1>.+?)\s+(?P<s1>\d+)\s+at\s+(?P<t2>.+?)\s+(?P<s2>\d+)\s*$', title, flags=re.I)
    if m:
        t1 = m.group('t1').strip(); s1 = int(m.group('s1'))
        t2 = m.group('t2').strip(); s2 = int(m.group('s2'))
        date_iso = datetime.today().strftime("%Y-%m-%d")
        return t1, s1, t2, s2, date_iso

    # Pattern 2: "TeamA vs TeamB box-scores-23 Sep 2025"
    m = re.match(r'^(?P<t1>.+?)\s+vs\s+(?P<t2>.+?)\s+box-scores-(?P<date>.+?)\s*$', title, flags=re.I)
    if m:
        t1 = m.group('t1').strip()
        t2 = m.group('t2').strip()
        dstr = m.group('date').strip()
        date_iso = None
        for fmt in ("%d %b %Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                date_iso = datetime.strptime(dstr, fmt).strftime("%Y-%m-%d")
                break
            except Exception:
                pass
        if date_iso is None:
            date_iso = datetime.today().strftime("%Y-%m-%d")
        return t1, None, t2, None, date_iso

    # Pattern 3: fallback "TeamA vs TeamB - <date>"
    m = re.match(r'^(?P<t1>.+?)\s+vs\s+(?P<t2>.+?)(?:\s*-\s*(?P<date>.+))?$', title, flags=re.I)
    if m:
        t1 = m.group('t1').strip(); t2 = m.group('t2').strip()
        dstr = (m.group('date') or "").strip()
        date_iso = datetime.today().strftime("%Y-%m-%d")
        if dstr:
            for fmt in ("%d %b %Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
                try:
                    date_iso = datetime.strptime(dstr, fmt).strftime("%Y-%m-%d")
                    break
                except Exception:
                    pass
        return t1, None, t2, None, date_iso

    # Last-resort fallback
    return title or "Unknown", None, "Unknown", None, datetime.today().strftime("%Y-%m-%d")

def parse_table(soup: BeautifulSoup) -> Tuple[List[str], List[List[str]]]:
    table = soup.find('table')
    if not table:
        raise RuntimeError("No <table> found in the HTML")
    headers = [th.get_text(strip=True).lower() for th in table.find_all('th')]
    rows = []
    for tr in table.find_all('tr')[1:]:
        tds = tr.find_all('td')
        if not tds:
            continue
        rows.append([td.get_text(strip=True) for td in tds])
    return headers, rows

def parse_made_attempt(val: str) -> Tuple[int, int]:
    # e.g., "9-15" -> (9,15); "-", "" -> (0,0)
    if not val or val == "-":
        return 0, 0
    m = re.match(r'^\s*(\d+)\s*-\s*(\d+)\s*$', val)
    if not m:
        return 0, 0
    return int(m.group(1)), int(m.group(2))

def abbrev_from_cell(cell: str) -> str:
    # e.g., "#28 F. Wendtman" or "#00 K. Denzin"
    m = re.search(r'#\s*\d+\s+([A-Za-z])\.?\s*([A-Za-z\-]+)', cell)
    if not m:
        m2 = re.search(r'\b([A-Za-z])\.?\s*([A-Za-z\-]+)\b', cell)  # fallback: "K.Denzin"
        if not m2:
            return cell.strip()
        return f"{m2.group(1).upper()}.{m2.group(2)}"
    return f"{m.group(1).upper()}.{m.group(2)}"

def pct(made: int, att: int) -> float:
    return round((made / att) * 100, 6) if att else 0.0


# ------------------------- main -------------------------

def main():
    # ---------- resolve paths/config ----------
    BASE = Path(__file__).resolve().parent

    with open(BASE / "config.json", "r", encoding="utf-8") as cf:
        cfg: Dict[str, Any] = json.load(cf)

    sa_path = cfg["service_account_file"]
    sa_path = (BASE / sa_path) if not Path(sa_path).is_absolute() else Path(sa_path)
    SERVICE_ACCOUNT_FILE = str(sa_path)

    PLAYER_MAP: Dict[str, Dict[str, str]] = cfg["player_map"]
    TEAM_MAP:   Dict[str, str] = cfg.get("team_map", {})
    TAB_NAMES:  Dict[str, Dict[str, str]] = cfg.get("tab_names", {})
    PLAYER_TAB = TAB_NAMES.get("players", {})
    TEAM_TAB   = TAB_NAMES.get("teams", {})

    # Auth (Sheets + Drive scope OK; we mainly use Sheets API)
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(SERVICE_ACCOUNT_FILE, scope)
    client = gspread.authorize(creds)

    # ---------- input HTML path (sanitised) ----------
    raw = sys.argv[1] if len(sys.argv) > 1 else input("Enter path to EasyStats HTML export: ")
    html_file = raw.strip().strip('"').strip("'")
    html_file = os.path.expanduser(html_file)
    html_file = os.path.abspath(html_file)
    if not os.path.exists(html_file):
        print("❌ File not found:", html_file)
        sys.exit(1)

    # ---------- parse HTML ----------
    with open(html_file, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "lxml")

    title = soup.title.get_text(strip=True) if soup.title else ""
    t1_name, s1, t2_name, s2, date_iso = parse_title_for_match(title)

    def team_slug_from_name(name: str) -> str:
        return TEAM_MAP.get(name, slugify_team(name))

    t1_slug = team_slug_from_name(t1_name)
    t2_slug = team_slug_from_name(t2_name)

    headers, raw_rows = parse_table(soup)
    if not raw_rows:
        print("⚠️ No data rows detected in table.")
        sys.exit(1)

    # Assume the table is the home/second team (adjust if needed)
    table_team_slug = t2_slug
    opp_slug = t1_slug

    # ---------- canonical rows ----------
    out_rows: List[Dict[str, Any]] = []
    unmapped: List[str] = []

    for row in raw_rows:
        player_cell = row[0]
        abbrev = abbrev_from_cell(player_cell)
        if abbrev not in PLAYER_MAP:
            unmapped.append(abbrev)
            continue

        pinfo = PLAYER_MAP[abbrev]
        fg_m, fg_a = parse_made_attempt(row[1] if len(row) > 1 else "")
        tp_m, tp_a = parse_made_attempt(row[3] if len(row) > 3 else "")
        ft_m, ft_a = parse_made_attempt(row[5] if len(row) > 5 else "")

        oreb = int(row[7])  if len(row) > 7  and row[7].isdigit()  else 0
        dreb = int(row[8])  if len(row) > 8  and row[8].isdigit()  else 0
        pf   = int(row[9])  if len(row) > 9  and row[9].isdigit()  else 0
        stl  = int(row[10]) if len(row) > 10 and row[10].isdigit() else 0
        tov  = int(row[11]) if len(row) > 11 and row[11].isdigit() else 0
        blk  = int(row[12]) if len(row) > 12 and row[12].isdigit() else 0
        ast  = int(row[13]) if len(row) > 13 and row[13].isdigit() else 0
        pts  = int(row[14]) if len(row) > 14 and row[14].isdigit() else 0

        out_rows.append({
            "date": date_iso,
            "player_slug": pinfo["slug"],
            "player_name": pinfo["name"],
            "position": pinfo.get("position", ""),
            "team_slug": table_team_slug,
            "opponent_slug": opp_slug,
            "min": "",
            "fg": fg_m, "fga": fg_a,
            "3p": tp_m, "3pa": tp_a,
            "ft": ft_m, "fta": ft_a,
            "or": oreb, "dr": dreb, "totrb": oreb + dreb,
            "ass": ast, "pf": pf, "st": stl, "bs": blk, "to": tov, "pts": pts
        })

    # ---------- open spreadsheets by ID (preferred) ----------
    sheets_cfg = cfg["sheets"]
    BOX_ID  = sheets_cfg.get("box_scores_id")
    PLY_ID  = sheets_cfg.get("players_id")
    TEAM_ID = sheets_cfg.get("teams_id")

    if not (BOX_ID and PLY_ID and TEAM_ID):
        # Fallback to titles (requires Drive API to search)
        SHEET_BOX     = sheets_cfg.get("box_scores")
        SHEET_PLAYERS = sheets_cfg.get("players")
        SHEET_TEAMS   = sheets_cfg.get("teams")
        try:
            box_ss     = client.open(SHEET_BOX)
            players_ss = client.open(SHEET_PLAYERS)
            teams_ss   = client.open(SHEET_TEAMS)
        except Exception as e:
            raise RuntimeError(
                "Drive API search failed. Either enable Drive API or provide spreadsheet IDs in config.json "
                '("box_scores_id","players_id","teams_id"). Original error: ' + str(e)
            )
    else:
        box_ss     = client.open_by_key(BOX_ID)
        players_ss = client.open_by_key(PLY_ID)
        teams_ss   = client.open_by_key(TEAM_ID)

    spreadsheet_id = box_ss.id
    game_id = f"{date_iso}_{t1_slug}_vs_{t2_slug}"

    # ---------- Box Scores: create/ensure game tab ----------
    headers_out = ["date","player_slug","player_name","team_slug","opponent_slug",
                   "min","fg","fga","3p","3pa","ft","fta","or","dr","totrb",
                   "ass","pf","st","bs","to","pts"]

    try:
        game_ws = box_ss.worksheet(game_id)
        new_tab = False
    except gspread.WorksheetNotFound:
        game_ws = box_ss.add_worksheet(title=game_id, rows="200", cols="30")
        new_tab = True

    if new_tab:
        meta = ["META", date_iso, t1_slug, t2_slug, (s1 if s1 is not None else ""), (s2 if s2 is not None else "")]
        game_ws.append_row(meta)
        game_ws.append_row(headers_out)

    # Batch append to game tab
    for r in out_rows:
        game_ws.append_row([
            r["date"], r["player_slug"], r["player_name"], r["team_slug"], r["opponent_slug"],
            r["min"], r["fg"], r["fga"], r["3p"], r["3pa"], r["ft"], r["fta"], r["or"], r["dr"], r["totrb"],
            r["ass"], r["pf"], r["st"], r["bs"], r["to"], r["pts"]
        ])

    # ---------- Maintain Index tab with per-tab CSV URL ----------
    gid = getattr(game_ws, "id", None)
    if gid is None:
        for ws in box_ss.worksheets():
            if ws.title == game_id:
                gid = ws.id
                break
    csv_url = f"https://docs.google.com/spreadsheets/d/{spreadsheet_id}/export?format=csv&gid={gid}"

    INDEX_TITLE = "Index"
    try:
        index_ws = box_ss.worksheet(INDEX_TITLE)
        values = index_ws.get_all_values()
    except gspread.WorksheetNotFound:
        index_ws = box_ss.add_worksheet(title=INDEX_TITLE, rows="200", cols="10")
        values = []
        index_ws.append_row(["game_id","date","team1_slug","team2_slug","score_team1","score_team2","csv_url"])

    if not values:
        index_ws.append_row(["game_id","date","team1_slug","team2_slug","score_team1","score_team2","csv_url"])

    # upsert index record
    found_row_idx = None
    for i, row in enumerate(index_ws.get_all_values()):
        if i == 0:
            continue
        if row and row[0] == game_id:
            found_row_idx = i + 1
            break

    record = [game_id, date_iso, t1_slug, t2_slug, (s1 if s1 is not None else ""), (s2 if s2 is not None else ""), csv_url]
    if found_row_idx:
        index_ws.update(f"A{found_row_idx}:G{found_row_idx}", [record])
    else:
        index_ws.append_row(record)

    # ---------- Append to legacy Players sheet (per-player tabs) ----------
    def player_tab_title(player_slug: str, default_name: str) -> str:
        # prefer explicit mapping; else use the player's full name (from player_map)
        return PLAYER_TAB.get(player_slug, default_name)

    def team_tab_title(team_slug: str, fallback_name: str) -> str:
        return TEAM_TAB.get(team_slug, fallback_name)

    PLAYER_HEADERS_LEGACY = [
        "date","position","team","opponent","min","fg","fga","fg%","3p","3pa","3p%","ft","fta","ft%","or","dr","totrb","ass","pf","st","bs","to","pts"
    ]

    for r in out_rows:
        # resolve display names
        # get pinfo back from slug (reverse lookup)
        pinfo = None
        for k, v in PLAYER_MAP.items():
            if v.get("slug") == r["player_slug"]:
                pinfo = v
                break
        position    = (pinfo or {}).get("position", "")
        player_name = r["player_name"]
        team_disp   = team_tab_title(r["team_slug"],   r["team_slug"])
        opp_disp    = team_tab_title(r["opponent_slug"], r["opponent_slug"])

        row_legacy = [
            r["date"],
            position,
            team_disp,
            opp_disp,
            r["min"],
            r["fg"],
            r["fga"],
            pct(r["fg"], r["fga"]),
            r["3p"],
            r["3pa"],
            pct(r["3p"], r["3pa"]),
            r["ft"],
            r["fta"],
            pct(r["ft"], r["fta"]),
            r["or"],
            r["dr"],
            r["totrb"],
            r["ass"],
            r["pf"],
            r["st"],
            r["bs"],
            r["to"],
            r["pts"],
        ]

        p_title = player_tab_title(r["player_slug"], player_name)
        try:
            pw = players_ss.worksheet(p_title)
        except gspread.WorksheetNotFound:
            pw = players_ss.add_worksheet(title=p_title, rows="200", cols=str(len(PLAYER_HEADERS_LEGACY)))
            pw.append_row(PLAYER_HEADERS_LEGACY)
        pw.append_row(row_legacy)

    # ---------- Append to legacy Teams sheet (per-team tabs) ----------
    team1_display = team_tab_title(t1_slug, t1_name)
    team2_display = team_tab_title(t2_slug, t2_name)

    score1 = s1 if s1 is not None else ""
    score2 = s2 if s2 is not None else ""
    winner = ""
    loser  = ""
    if isinstance(s1, int) and isinstance(s2, int):
        if s1 > s2:
            winner = team1_display; loser = team2_display
        elif s2 > s1:
            winner = team2_display; loser = team1_display

    season = date_iso.split("-")[0]  # YYYY
    TEAM_HEADERS_LEGACY = ["date","team1","team2","score_team1","score_team2","winner","loser","season"]
    team_row = [date_iso, team1_display, team2_display, score1, score2, winner, loser, season]

    for team_disp_name in (team1_display, team2_display):
        try:
            tw = teams_ss.worksheet(team_disp_name)
        except gspread.WorksheetNotFound:
            tw = teams_ss.add_worksheet(title=team_disp_name, rows="200", cols=str(len(TEAM_HEADERS_LEGACY)))
            tw.append_row(TEAM_HEADERS_LEGACY)
        tw.append_row(team_row)

    # ---------- summary ----------
    print(f"✅ Box Scores tab updated: {game_id}")
    print(f"   Index updated. CSV: {csv_url}")
    if unmapped:
        print("⚠️ Unmapped player abbreviations (skipped):", sorted(set(unmapped)))
    else:
        print("All players mapped ✔")


if __name__ == "__main__":
    main()
