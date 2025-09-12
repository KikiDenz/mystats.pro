const { google } = require('googleapis');

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const data = JSON.parse(event.body);

        // Ensure all required fields are present
        const requiredFields = ['date', 'team1', 'team2', 'score_team1', 'score_team2', 'winner', 'loser', 'season'];
        for (const field of requiredFields) {
            if (!data[field]) {
                return { statusCode: 400, body: `Missing required field: ${field}` };
            }
        }

        const auth = new google.auth.GoogleAuth({
            credentials: {
                client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
                private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'), // Handle newline chars
            },
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const sheets = google.sheets({ version: 'v4', auth });

        const spreadsheetId = process.env.GOOGLE_SPREADSHEET_ID;
        const range = 'Games!A:I'; // Tab name and columns to append to

        // Generate a simple game_id (you might want a more robust one)
        const gameId = `G_${Date.now()}`;

        const values = [
            [
                gameId,
                data.date,
                data.team1,
                data.team2,
                data.score_team1,
                data.score_team2,
                data.winner,
                data.loser,
                data.season
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
            body: JSON.stringify({ message: 'Game added successfully!', gameId: gameId }),
        };
    } catch (error) {
        console.error('Error adding game:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: 'Failed to add game', details: error.message }),
        };
    }
};