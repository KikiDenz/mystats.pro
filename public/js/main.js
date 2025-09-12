// public/js/main.js

// Replace these with the actual "Published to web" CSV URLs for your Google Sheet tabs
const TEAM_GAMES_CSV_URL = 'YOUR_PUBLISHED_TEAM_GAMES_CSV_URL';
const PLAYER_STATS_CSV_URL = 'YOUR_PUBLISHED_PLAYER_STATS_CSV_URL';

/**
 * Fetches CSV data from a given URL and parses it using PapaParse.
 * @param {string} url - The URL of the CSV file.
 * @returns {Promise<Array<Object>>} - A promise that resolves with an array of objects representing the CSV data.
 */
async function fetchCsvData(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const csvText = await response.text();
        return PapaParse.parse(csvText, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
    } catch (error) {
        console.error(`Error fetching CSV from ${url}:`, error);
        return []; // Return empty array on error
    }
}

/**
 * Loads and displays player statistics on the player page.
 * @param {string} playerName - The name of the player to display stats for.
 */
async function loadPlayerPage(playerName) {
    const playerStatsData = await fetchCsvData(PLAYER_STATS_CSV_URL);
    const gameStatsData = await fetchCsvData(TEAM_GAMES_CSV_URL);

    // Filter stats for the current player (using player_first and player_sur for full name)
    const filteredPlayerStats = playerStatsData.filter(stat =>
        `${stat.player_first} ${stat.player_sur}`.trim() === playerName.trim()
    );

    // --- Calculate Career Totals ---
    let careerTotals = {
        games: 0,
        pts: 0,
        totrb: 0,
        ast: 0,
        ha: 0, // NEW
        stl: 0,
        blk: 0,
        to: 0,
        min: 0,
        fg: 0, fga: 0,
        '3p': 0, '3pa': 0,
        ft: 0, fta: 0,
        or: 0, dr: 0
    };

    const playedGameIds = new Set(); // To count unique games played

    filteredPlayerStats.forEach(stat => {
        if (stat.game_id && !playedGameIds.has(stat.game_id)) {
            careerTotals.games++;
            playedGameIds.add(stat.game_id);
        }
        careerTotals.pts += stat.pts || 0;
        careerTotals.totrb += stat.totrb || 0;
        careerTotals.ast += stat.ast || 0;
        careerTotals.ha += stat.ha || 0; // NEW
        careerTotals.stl += stat.stl || 0;
        careerTotals.blk += stat.blk || 0;
        careerTotals.to += stat.to || 0;
        careerTotals.min += stat.min || 0;
        careerTotals.fg += stat.fg || 0;
        careerTotals.fga += stat.fga || 0;
        careerTotals['3p'] += stat['3p'] || 0;
        careerTotals['3pa'] += stat['3pa'] || 0;
        careerTotals.ft += stat.ft || 0;
        careerTotals.fta += stat.fta || 0;
        careerTotals.or += stat.or || 0;
        careerTotals.dr += stat.dr || 0;
    });

    // Update the player name display (already handled in player.html script)
    // document.getElementById('player-name-display').innerText = playerName;

    // Update career total elements (example IDs, adjust as needed in HTML)
    document.getElementById('career-points')?.innerText = careerTotals.pts.toFixed(0);
    document.getElementById('career-assists')?.innerText = careerTotals.ast.toFixed(0);
    document.getElementById('career-rebounds')?.innerText = careerTotals.totrb.toFixed(0);
    document.getElementById('career-ha')?.innerText = careerTotals.ha.toFixed(0); // NEW: Display Hockey Assists
    // You can add more elements for other totals like steals, blocks, etc.

    // --- Populate Player Game Log Table ---
    const playerGameLogTableBody = document.querySelector('#player-game-log tbody');
    if (playerGameLogTableBody) {
        playerGameLogTableBody.innerHTML = ''; // Clear existing rows

        // Sort stats by date
        filteredPlayerStats.sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first

        filteredPlayerStats.forEach(stat => {
            const row = playerGameLogTableBody.insertRow();
            row.insertCell().innerText = stat.date;
            row.insertCell().innerText = stat.opponent; // Opponent is now directly in player stats
            row.insertCell().innerText = `${stat.team === gameStatsData.find(g => g.game_id === stat.game_id)?.winner ? 'W' : 'L'}`; // Simplified W/L logic (needs actual game score logic for score)
            row.insertCell().innerText = stat.pts;
            row.insertCell().innerText = stat.totrb;
            row.insertCell().innerText = stat.ast;
            row.insertCell().innerText = stat.ha; // NEW: Display HA
            row.insertCell().innerText = stat.min;
            // Add more cells for other stats if your table has them, e.g., fg, fga, 3p, 3pa, etc.
        });
    }

    // --- Placeholder for Season Totals (can expand on this) ---
    // You'd need to group filteredPlayerStats by season and calculate totals for each season.
}

/**
 * Loads and displays team statistics on the team page.
 * @param {string} teamName - The name of the team to display stats for.
 */
async function loadTeamPage(teamName) {
    const gameStatsData = await fetchCsvData(TEAM_GAMES_CSV_URL);
    const playerStatsData = await fetchCsvData(PLAYER_STATS_CSV_URL);

    // Filter games involving this team
    const teamGames = gameStatsData.filter(game => game.team1 === teamName || game.team2 === teamName);

    // Calculate Win/Loss Record
    let wins = 0;
    let losses = 0;
    teamGames.forEach(game => {
        if (game.winner === teamName) wins++;
        else losses++;
    });
    document.getElementById('team-record')?.innerText = `${wins}-${losses}`;

    // Update team name display
    const teamNameElement = document.getElementById('team-name-display');
    if (teamNameElement) teamNameElement.innerText = teamName;


    // --- Populate Team Game Log Table ---
    const teamGameLogTableBody = document.querySelector('#team-game-log tbody');
    if (teamGameLogTableBody) {
        teamGameLogTableBody.innerHTML = '';

        teamGames.sort((a, b) => new Date(b.date) - new Date(a.date)); // Most recent first

        teamGames.forEach(game => {
            const row = teamGameLogTableBody.insertRow();
            row.insertCell().innerText = game.date;
            row.insertCell().innerText = game.team1 === teamName ? game.team2 : game.team1; // Opponent
            row.insertCell().innerText = `${game.score_team1}-${game.score_team2}`;
            row.insertCell().innerText = (game.winner === teamName) ? 'W' : 'L';
            // Add more cells like season if needed
        });
    }

    // --- Populate Roster (Example) ---
    const teamRosterList = document.getElementById('team-roster');
    if (teamRosterList) {
        teamRosterList.innerHTML = '';
        const teamPlayers = new Set(playerStatsData.filter(p => p.team === teamName).map(p => `${p.player_first} ${p.player_sur}`));
        teamPlayers.forEach(player => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="player.html?name=${encodeURIComponent(player)}">${player}</a>`;
            teamRosterList.appendChild(li);
        });
    }
}

// --- Form Submission Handlers (unchanged, still in add-game.html and add-player-stats.html script blocks) ---