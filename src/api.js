const axios = require('axios');
const fs = require('fs');
const { SCHEDULE_FILE, DRIVERS_FILE } = require('./config');

async function fetchF1Schedule() {
    try {
        console.log('Fetching F1 schedule...');
        const scheduleResponse = await axios.get('https://api.jolpi.ca/ergast/f1/current.json');
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(scheduleResponse.data, null, 2));
        console.log('F1 schedule updated successfully.');

        console.log('Fetching active F1 drivers...');
        const driversResponse = await axios.get('https://api.jolpi.ca/ergast/f1/current/drivers.json');
        fs.writeFileSync(DRIVERS_FILE, JSON.stringify(driversResponse.data, null, 2));
        console.log('F1 drivers list updated successfully.');
    } catch (error) {
        console.error('Error fetching F1 schedule or drivers:', error.message);
    }
}

async function fetchDriverStandings() {
    try {
        const response = await axios.get('https://api.jolpi.ca/ergast/f1/current/driverStandings.json');
        const standingsList = response.data.MRData?.StandingsTable?.StandingsLists?.[0]?.DriverStandings;
        if (!standingsList || standingsList.length === 0) {
            return 'Driver standings are currently not available.';
        }

        let standingsText = '🏆 **F1 Driver Championship Standings** 🏆\n\n';
        standingsList.slice(0, 15).forEach((item) => {
            const pos = item.position;
            let medal = `${pos}.`;
            if (pos === '1') medal = '🥇';
            else if (pos === '2') medal = '🥈';
            else if (pos === '3') medal = '🥉';

            const driver = item.Driver;
            const constructor = item.Constructors?.[0]?.name || 'Unknown';
            standingsText += `${medal} **${driver.givenName} ${driver.familyName}** (${constructor}) - **${item.points} pts**${item.wins > 0 ? ` (${item.wins} win${item.wins > 1 ? 's' : ''})` : ''}\n`;
        });
        return standingsText;
    } catch (err) {
        console.error('Error fetching driver standings:', err.message);
        return 'Failed to retrieve driver standings. Please try again later.';
    }
}

async function fetchTeamStandings() {
    try {
        const response = await axios.get('https://api.jolpi.ca/ergast/f1/current/constructorStandings.json');
        const standingsList = response.data.MRData?.StandingsTable?.StandingsLists?.[0]?.ConstructorStandings;
        if (!standingsList || standingsList.length === 0) {
            return 'Team standings are currently not available.';
        }

        let standingsText = '🏆 **F1 Team Championship Standings** 🏆\n\n';
        standingsList.forEach((item) => {
            const pos = item.position;
            let medal = `${pos}.`;
            if (pos === '1') medal = '🥇';
            else if (pos === '2') medal = '🥈';
            else if (pos === '3') medal = '🥉';

            const team = item.Constructor;
            standingsText += `${medal} **${team.name}** - **${item.points} pts**${item.wins > 0 ? ` (${item.wins} win${item.wins > 1 ? 's' : ''})` : ''}\n`;
        });
        return standingsText;
    } catch (err) {
        console.error('Error fetching team standings:', err.message);
        return 'Failed to retrieve team standings. Please try again later.';
    }
}

module.exports = {
    fetchF1Schedule,
    fetchDriverStandings,
    fetchTeamStandings
};
