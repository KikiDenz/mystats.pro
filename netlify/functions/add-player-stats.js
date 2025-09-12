const { google } = require('googleapis');
const { GoogleAuth } = require('google-auth-library');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);

        // Updated required fields - now includes 'date', 'player_first', 'player_sur', 'team', 'opponent', 'min', 'pts'
        const requiredFields = [
            'game_id', 'date', 'player_first', 'player_sur', 'team', 'opponent', 'min', 'pts'
        ];
        for (const field of requiredFields) {
            if (!data[field]) {
                return { statusCode: 400, body: `Missing required field: ${field}` };
            }
        }

        const auth = new GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
        // Adjust range to cover all new columns (A to X for 'pts')
        const range = 'Player_Stats!A:X';

        const statEntryId = `S_${Date.now()}`;

        // Ensure all fields are included in the correct order, with defaults for numbers
        const values = [
            [
                statEntryId,
                data.game_id,
                data.date,          // New
                data.player_first,  // New
                data.player_sur,    // New
                data.position || '', // New, default to empty string
                data.team,          // Renamed from team_name
                data.opponent,      // New
                data.min || 0,      // Renamed from minutes_played
                data.fg || 0,       // New
                data.fga || 0,      // New
                data['3p'] || 0,    // New (use bracket notation for '3p')
                data['3pa'] || 0,   // New (use bracket notation for '3pa')
                data.ft || 0,       // New
                data.fta || 0,      // New
                data.or || 0,       // New
                data.dr || 0,       // New
                data.totrb || 0,    // Renamed from rebounds
                data.ast || 0,      // Renamed from assists
                data.ha || 0,       // NEW: Hockey Assists
                data.stl || 0,      // Renamed from steals
                data.blk || 0,      // Renamed from blocks
                data.to || 0,       // Renamed from turnovers
                data.pts || 0       // Renamed from points
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