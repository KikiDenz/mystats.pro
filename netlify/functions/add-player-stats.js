const { google } = require('googleapis');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);

        // You'll need to pass game_id from the frontend for linking
        const requiredFields = ['game_id', 'player_name', 'team_name', 'points', 'rebounds', 'assists', 'minutes_played']; // Adjust as needed
        for (const field of requiredFields) {
            if (!data[field]) {
                return { statusCode: 400, body: `Missing required field: ${field}` };
            }
        }

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
        const range = 'Player_Stats!A:L'; // Tab name and columns to append to

        // Generate a simple stat_entry_id
        const statEntryId = `S_${Date.now()}`;

        const values = [
            [
                statEntryId,
                data.game_id, // Important for linking
                data.player_name,
                data.team_name,
                data.points,
                data.rebounds,
                data.assists,
                data.steals || 0, // Default to 0 if not provided
                data.blocks || 0,
                data.turnovers || 0,
                data.minutes_played,
                data.fouls || 0
            ],
        ];

        await sheets.spreadsheets.values.append({
            spreadsheetId,
            range,
            valueInputOption: 'USER_ENTERED',
            resource: { values },
        });

        return {
            statusCode: 200,
            body: JSON.stringify({ message: 'Player stats added successfully!', statEntryId: statEntryId }),
        };
    } catch (error) {
        console.error('Error adding player stats:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to add player stats', details: error.message }),
        };
    }
};