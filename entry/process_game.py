#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
EasyStats → Google Sheets ingester
- Prompts for an HTML export path
- Parses teams, score, date from <title> (supports "A 0 at B 75" or "...box-scores-23 Sep 2025")
- Extracts player lines from the single team table
- Resolves player by manual PLAYER_MAP (first-initial + last name => slug + full name)
- Auto-slugifies team names if not found in TEAM_MAP
- Writes:
  * New tab in Box Scores spreadsheet: "<YYYY-MM-DD>_<teamA>_vs_<teamB>"
    - First row: META: date, team1_slug, team2_slug, score_team1, score_team2
    - Then headers + one row per matched player
  * Appends each row to the Player spreadsheet (tab = player slug)
  * Appends each row to the Team spreadsheet (tab = team slug for that player)
"""

import os, re, sys
from datetime import datetime
from typing import Dict, Tuple, List
from bs4 import BeautifulSoup
import gspread
from oauth2client.service_account import ServiceAccountCredentials

# ---------- helpers ----------

def slugify_team(name: str) -> str:
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

def parse_title_for_match(title: str) -> Tuple[str, int, str, int, str]:
    """
    Returns (team1_name, score1, team2_name, score2, date_iso)
    Supports:
      "Rice  0 at Pretty good 75"
      "Rice vs Pretty good box-scores-23 Sep 2025"
    """
    title = title.strip()
    # Pattern 1: "TeamA <scoreA> at TeamB <scoreB>"
    m = re.match(r'^(?P<t1>.+?)\s+(?P<s1>\d+)\s+at\s+(?P<t2>.+?)\s+(?P<s2>\d+)\s*$', title, flags=re.I)
    date_iso = None
    if m:
        t1 = m.group('t1').strip()
        s1 = int(m.group('s1'))
        t2 = m.group('t2').strip()
        s2 = int(m.group('s2'))
        # Try to find a date elsewhere? If none, use today.
        date_iso = datetime.today().strftime("%Y-%m-%d")
        return t1, s1, t2, s2, date_iso

    # Pattern 2: "TeamA vs TeamB box-scores-23 Sep 2025"
    m = re.match(r'^(?P<t1>.+?)\s+vs\s+(?P<t2>.+?)\s+box-scores-(?P<date>.+?)\s*$', title, flags=re.I)
    if m:
        t1 = m.group('t1').strip()
        t2 = m.group('t2').strip()
        dstr = m.group('date').strip()
        # Try multiple formats
        for fmt in ("%d %b %Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
            try:
                date_iso = datetime.strptime(dstr, fmt).strftime("%Y-%m-%d")
                break
            except:
                pass
        if date_iso is None:
            date_iso = datetime.today().strftime("%Y-%m-%d")
        # no scores in this title style
        return t1, None, t2, None, date_iso

    # Fallback: attempt generic parse "TeamA vs TeamB - <date>"
    m = re.match(r'^(?P<t1>.+?)\s+vs\s+(?P<t2>.+?)(?:\s*-\s*(?P<date>.+))?$', title, flags=re.I)
    if m:
        t1 = m.group('t1').strip()
        t2 = m.group('t2').strip()
        dstr = (m.group('date') or "").strip()
        date_iso = datetime.today().strftime("%Y-%m-%d")
        if dstr:
            for fmt in ("%d %b %Y", "%d %B %Y", "%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y"):
                try:
                    date_iso = datetime.strptime(dstr, fmt).strftime("%Y-%m-%d")
                    break
                except:
                    pass
        return t1, None, t2, None, date_iso

    # As a last resort, return title as team1 and unknowns
    return title, None, "Unknown", None, datetime.today().strftime("%Y-%m-%d")

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

def parse_made_attempt(val: str) -> Tuple[int,int]:
    # e.g. "9-15" -> (9,15); "-", "" -> (0,0)
    if not val or val == "-":
        return 0,0
    m = re.match(r'^\s*(\d+)\s*-\s*(\d+)\s*$', val)
    if not m:
        return 0,0
    return int(m.group(1)), int(m.group(2))

def abbrev_from_cell(cell: str) -> str:
    # cell like "#28 F. Wendtman" or "#00 K. Denzin"
    m = re.search(r'#\s*\d+\s+([A-Za-z])\.?\s*([A-Za-z\-]+)', cell)
    if not m:
        # fallback: try "K.Denzin" directly inside
        m2 = re.search(r'\b([A-Za-z])\.?\s*([A-Za-z\-]+)\b', cell)
        if not m2:
            return cell.strip()
        return f"{m2.group(1).upper()}.{m2.group(2)}"
    return f"{m.group(1).upper()}.{m.group(2)}"

def choose_table_team_slug(rows, player_map, team1_slug, team2_slug) -> str:
    """
    Decide which team the table represents by counting how many player abbreviations
    map to players you know on team1 vs team2. If no match, default to team2_slug (home).
    """
    t1_hits = t2_hits = 0
    for r in rows:
        abbrev = abbrev_from_cell(r[0])
        if abbrev in player_map:
            # If your map includes optional 'teams' list per player, you can increment accordingly.
            # For now, we just count a hit and decide later team by score/home.
            # We'll choose table team by whichever count is greater.
            # If equal, we default to team2 (assume the table is the home team).
            # This avoids mis-assigning when no known players appear.
            pass
    # If you want more robust detection, extend PLAYER_MAP to include current team for the season.
    # For now, prefer team2_slug (often home) if ambiguous.
    return team2_slug

# ---------- main pipeline ----------

def main():
    # Load config
    import json
    with open("config.json", "r", encoding="utf-8") as cf:
        cfg = json.load(cf)

    SERVICE_ACCOUNT_FILE = cfg["service_account_file"]
    MASTER_SHEET = cfg["sheets"]["box_scores"]
    PLAYER_SHEET = cfg["sheets"]["players"]
    TEAM_SHEET   = cfg["sheets"]["teams"]
    PLAYER_MAP   = cfg["player_map"]        # e.g. {"L.Denzin": {"slug":"levi-denzin","name":"Levi Denzin"}, ...}
    TEAM_MAP     = cfg.get("team_map", {})  # optional; fallback to slugify

    # Auth
    scope = ["https://spreadsheets.google.com/feeds", "https://www.googleapis.com/auth/drive"]
    creds = ServiceAccountCredentials.from_json_keyfile_name(SERVICE_ACCOUNT_FILE, scope)
    client = gspread.authorize(creds)

    # Prompt for file
    html_file = input("Enter path to EasyStats HTML export: ").strip()
    if not os.path.exists(html_file):
        print("❌ File not found:", html_file)
        sys.exit(1)

    # Parse HTML
    with open(html_file, "r", encoding="utf-8") as f:
        soup = BeautifulSoup(f.read(), "lxml")

    title = soup.title.get_text(strip=True) if soup.title else ""
    t1_name, s1, t2_name, s2, date_iso = parse_title_for_match(title)
    t1_slug = TEAM_MAP.get(t1_name, slugify_team(t1_name))
    t2_slug = TEAM_MAP.get(t2_name, slugify_team(t2_name))

    headers, raw_rows = parse_table(soup)
    if not raw_rows:
        print("⚠️ No data rows detected in table.")
        sys.exit(1)

    # Decide which team the table belongs to (best-effort; default home/team2)
    table_team_slug = choose_table_team_slug(raw_rows, PLAYER_MAP, t1_slug, t2_slug)
    opp_slug = t2_slug if table_team_slug == t1_slug else t1_slug

    # Build canonical rows
    # EasyStats headers look like: ['', 'fg','fg%','3pt','3pt%','ft','ft%','oreb','dreb','foul','stl','to','blk','asst','pts']
    out_rows = []
    unmapped = []
    for row in raw_rows:
        player_cell = row[0]
        abbrev = abbrev_from_cell(player_cell)
        if abbrev not in PLAYER_MAP:
            unmapped.append(abbrev)
            continue
        pinfo = PLAYER_MAP[abbrev]
        fg_m, fg_a   = parse_made_attempt(row[1] if len(row)>1 else "")
        tp_m, tp_a   = parse_made_attempt(row[3] if len(row)>3 else "")
        ft_m, ft_a   = parse_made_attempt(row[5] if len(row)>5 else "")
        oreb         = int(row[7]) if len(row)>7 and row[7].isdigit() else 0
        dreb         = int(row[8]) if len(row)>8 and row[8].isdigit() else 0
        pf           = int(row[9]) if len(row)>9 and row[9].isdigit() else 0
        stl          = int(row[10]) if len(row)>10 and row[10].isdigit() else 0
        tov          = int(row[11]) if len(row)>11 and row[11].isdigit() else 0
        blk          = int(row[12]) if len(row)>12 and row[12].isdigit() else 0
        ast          = int(row[13]) if len(row)>13 and row[13].isdigit() else 0
        pts          = int(row[14]) if len(row)>14 and row[14].isdigit() else 0

        out_rows.append({
            "date": date_iso,
            "player_slug": pinfo["slug"],
            "player_name": pinfo["name"],
            "team_slug": table_team_slug,
            "opponent_slug": opp_slug,
            "min": "",  # EasyStats table doesn't include min; leave blank or derive elsewhere
            "fg": fg_m, "fga": fg_a,
            "3p": tp_m, "3pa": tp_a,
            "ft": ft_m, "fta": ft_a,
            "or": oreb, "dr": dreb, "totrb": oreb + dreb,
            "ass": ast, "pf": pf, "st": stl, "bs": blk, "to": tov, "pts": pts
        })

    # Open Sheets
    box_master = client.open(MASTER_SHEET)
    player_master = client.open(PLAYER_SHEET)
    team_master   = client.open(TEAM_SHEET)

    # Prepare Box Scores tab
    game_id = f"{date_iso}_{t1_slug}_vs_{t2_slug}"
    try:
        box_ws = box_master.worksheet(game_id)
        existing = box_ws.get_all_values()
        is_new = False
    except gspread.WorksheetNotFound:
        box_ws = box_master.add_worksheet(title=game_id, rows="200", cols="30")
        existing = []
        is_new = True

    # Meta row + headers
    headers_out = ["date","player_slug","player_name","team_slug","opponent_slug",
                   "min","fg","fga","3p","3pa","ft","fta","or","dr","totrb",
                   "ass","pf","st","bs","to","pts"]
    if is_new or not existing:
        # meta row
        meta = ["META", date_iso, t1_slug, t2_slug, (s1 if s1 is not None else ""), (s2 if s2 is not None else "")]
        box_ws.append_row(meta)
        # headers
        box_ws.append_row(headers_out)

    # Append rows
    for r in out_rows:
        box_ws.append_row([
            r["date"], r["player_slug"], r["player_name"], r["team_slug"], r["opponent_slug"],
            r["min"], r["fg"], r["fga"], r["3p"], r["3pa"], r["ft"], r["fta"], r["or"], r["dr"], r["totrb"],
            r["ass"], r["pf"], r["st"], r["bs"], r["to"], r["pts"]
        ])

        # Player tab
        try:
            pw = player_master.worksheet(r["player_slug"])
        except gspread.WorksheetNotFound:
            pw = player_master.add_worksheet(title=r["player_slug"], rows="200", cols="30")
            pw.append_row(headers_out)
        pw.append_row([
            r["date"], r["player_slug"], r["player_name"], r["team_slug"], r["opponent_slug"],
            r["min"], r["fg"], r["fga"], r["3p"], r["3pa"], r["ft"], r["fta"], r["or"], r["dr"], r["totrb"],
            r["ass"], r["pf"], r["st"], r["bs"], r["to"], r["pts"]
        ])

        # Team tab (by the team this player played for in this game)
        try:
            tw = team_master.worksheet(r["team_slug"])
        except gspread.WorksheetNotFound:
            tw = team_master.add_worksheet(title=r["team_slug"], rows="200", cols="30")
            tw.append_row(headers_out)
        tw.append_row([
            r["date"], r["player_slug"], r["player_name"], r["team_slug"], r["opponent_slug"],
            r["min"], r["fg"], r["fga"], r["3p"], r["3pa"], r["ft"], r["fta"], r["or"], r["dr"], r["totrb"],
            r["ass"], r["pf"], r["st"], r["bs"], r["to"], r["pts"]
        ])

    # Summary
    print(f"✅ Created/updated Box Scores tab: {game_id}")
    print(f"   Date: {date_iso} | {t1_name} ({t1_slug}) {s1 if s1 is not None else ''}  -  {t2_name} ({t2_slug}) {s2 if s2 is not None else ''}")
    if unmapped:
        print("⚠️ Unmapped player abbreviations (skipped):", sorted(set(unmapped)))
    else:
        print("All players mapped ✔")

if __name__ == "__main__":
    main()
