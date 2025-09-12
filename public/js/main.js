// public/js/main.js

// Replace these with the actual "Published to web" CSV URLs for your Google Sheet tabs
const TEAM_GAMES_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=1049036746&single=true&output=csv';
const PLAYER_STATS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQsO8Qs1fCs3bth-xMxciqAX0CchbqLYOpQbfOQvf8xJdpSkNl3109OEwuvfWYehtQX5a6LUqeIFdsg/pub?gid=0&single=true&output=csv';

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

    // Filter stats for the current player
    const filteredPlayerStats = playerStatsData.filter(stat => stat.player_name === playerName);

    // --- Calculate Career Totals ---
    let careerTotals = {
        games: 0,
        points: 0,
        rebounds: 0,
        assists: 0,
        steals: 0,
        blocks: 0,
        turnovers: 0,
        minutes_played: 0,
        fouls: 0
    };

    const playedGameIds = new Set(); // To count unique games played

    filteredPlayerStats.forEach(stat => {
        if (stat.game_id && !playedGameIds.has(stat.game_id)) {
            careerTotals.games++;
            playedGameIds.add(stat.game_id);
        }
        careerTotals.points += stat.points || 0;
        careerTotals.rebounds += stat.rebounds || 0;
        careerTotals.assists += stat.assists || 0;
        careerTotals.steals += stat.steals || 0;
        careerTotals.blocks += stat.blocks || 0;
        careerTotals.turnovers += stat.turnovers || 0;
        careerTotals.minutes_played += stat.minutes_played || 0;
        careerTotals.fouls += stat.fouls || 0;
    });

    // Update the player name display
    const playerNameElement = document.getElementById('player-name-display');
    if (playerNameElement) playerNameElement.innerText = playerName;

    // Update career total elements (example IDs, adjust as needed in HTML)
    document.getElementById('career-points')?.innerText = careerTotals.points.toFixed(1); // Avg or Total?
    document.getElementById('career-assists')?.innerText = careerTotals.assists.toFixed(1); // Avg or Total?
    // You can add more elements for other totals like rebounds, blocks, etc.

    // --- Populate Player Game Log Table ---
    const playerGameLogTableBody = document.querySelector('#player-game-log tbody');
    if (playerGameLogTableBody) {
        playerGameLogTableBody.innerHTML = ''; // Clear existing rows

        // Sort stats by date (assuming gameStatsData has dates)
        filteredPlayerStats.sort((a, b) => {
            const gameA = gameStatsData.find(g => g.game_id === a.game_id);
            const gameB = gameStatsData.find(g => g.game_id === b.game_id);
            if (gameA && gameB) {
                return new Date(gameB.date) - new Date(gameA.date); // Most recent first
            }
            return 0;
        });

        filteredPlayerStats.forEach(stat => {
            const game = gameStatsData.find(g => g.game_id === stat.game_id);
            if (game) {
                const row = playerGameLogTableBody.insertRow();
                row.insertCell().innerText = game.date;
                row.insertCell().innerText = game.team1 === stat.team_name ? game.team2 : game.team1; // Opponent
                row.insertCell().innerText = `${game.score_team1}-${game.score_team2}`; // Final Score
                row.insertCell().innerText = stat.points;
                row.insertCell().innerText = stat.rebounds;
                row.insertCell().innerText = stat.assists;
                // Add more cells for other stats if your table has them
            }
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
    const playerStatsData = await fetchCsvData(PLAYER_STATS_CSV_URL); // Useful for roster info

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
        const teamPlayers = new Set(playerStatsData.filter(p => p.team_name === teamName).map(p => p.player_name));
        teamPlayers.forEach(player => {
            const li = document.createElement('li');
            li.innerHTML = `<a href="player.html?name=${encodeURIComponent(player)}">${player}</a>`;
            teamRosterList.appendChild(li);
        });
    }
}

// --- Form Submission Handlers (same as before) ---
// These will be in the add-game.html and add-player-stats.html <script> tags directly for simplicity.
// No changes needed from the previous add-game.html and add-player-stats.html script blocks.