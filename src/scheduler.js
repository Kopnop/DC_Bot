const fs = require('fs');
const cron = require('node-cron');
const axios = require('axios');
const { SCHEDULE_FILE } = require('./config');
const { fetchF1Schedule } = require('./api');
const {
    getSubscribers,
    getSentReminders,
    markReminderAsSent,
    getLeaderboard,
    saveLeaderboard,
    getPredictions,
    savePredictions
} = require('./db');
const { formatToCET } = require('./utils');

// Helper to get next race
function getUpcomingRace() {
    try {
        const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        const races = scheduleData.MRData?.RaceTable?.Races;
        if (!races) return null;
        const now = new Date();
        return races.find(race => new Date(`${race.date}T${race.time}`) > now);
    } catch (err) {
        console.error('Error getting upcoming race:', err.message);
        return null;
    }
}

// Helper to check lock state
function isPredictionLocked(upcomingRace) {
    if (!upcomingRace) return true;
    const now = new Date();
    const raceStart = new Date(`${upcomingRace.date}T${upcomingRace.time}`);
    return now >= raceStart;
}

// Check for upcoming races and update reminders
async function checkUpcomingRaces(client) {
    try {
        const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        const races = scheduleData.MRData?.RaceTable?.Races;

        if (!races || races.length === 0) return;

        const now = new Date();
        const nextRace = races.find(race => new Date(`${race.date}T${race.time}`) > now);

        if (nextRace) {
            const raceDate = new Date(`${nextRace.date}T${nextRace.time}`);
            const timeDiffMs = raceDate - now;
            const hoursDiff = timeDiffMs / (1000 * 60 * 60);

            // Send 24h DM reminder
            if (hoursDiff <= 24.5 && hoursDiff > 22.5) {
                const sentReminders = getSentReminders();
                if (!sentReminders.includes(nextRace.round)) {
                    const subscribers = getSubscribers();
                    const formattedTime = formatToCET(raceDate);
                    for (const userId of subscribers) {
                        try {
                            const user = await client.users.fetch(userId);
                            await user.send(`🏎️ **Reminder!** The **${nextRace.raceName}** starts in exactly 24 hours (on ${formattedTime})! Make sure to submit your podium predictions using \`/predict\`!`);
                            console.log(`Sent F1 race reminder DM to ${user.tag} (${userId})`);
                        } catch (err) {
                            console.error(`Failed to send DM to user ${userId}:`, err.message);
                        }
                    }
                    markReminderAsSent(nextRace.round);
                }
            }

            // Sync schedule & drivers after qualifying ends to capture any driver line-up updates (e.g. reserve drivers)
            if (nextRace.Qualifying) {
                const qualStart = new Date(`${nextRace.Qualifying.date}T${nextRace.Qualifying.time}`);
                const qualEnd = new Date(qualStart.getTime() + 1.5 * 60 * 60 * 1000);
                const qualHoursAgo = (now - qualEnd) / (1000 * 60 * 60);

                if (qualHoursAgo > 0 && qualHoursAgo <= 1) {
                    console.log('Qualifying ended recently. Syncing schedule and drivers to check for reserve driver updates...');
                    await fetchF1Schedule();
                }
            }
        }
    } catch (error) {
        console.error('Error checking upcoming races:', error);
    }
}

// Process finished race results and award points
async function processRaceResults(client) {
    try {
        const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        const races = scheduleData.MRData?.RaceTable?.Races;
        if (!races || races.length === 0) return;

        const now = new Date();

        // Races completed over 3 hours ago
        const completedRaces = races.filter(race => {
            const raceTime = new Date(`${race.date}T${race.time}`);
            return (now - raceTime) > (3 * 60 * 60 * 1000);
        });

        if (completedRaces.length === 0) return;

        // Get the latest completed race
        completedRaces.sort((a, b) => new Date(`${b.date}T${b.time}`) - new Date(`${a.date}T${a.time}`));
        const lastFinishedRace = completedRaces[0];
        const round = lastFinishedRace.round;

        const leaderboard = getLeaderboard();
        if (!leaderboard.processedRounds) leaderboard.processedRounds = [];
        if (!leaderboard.users) leaderboard.users = {};

        if (leaderboard.processedRounds.includes(round)) return;

        console.log(`Processing results for completed Round ${round} (${lastFinishedRace.raceName})...`);

        let resultsRes;
        try {
            resultsRes = await axios.get(`https://api.jolpi.ca/ergast/f1/current/${round}/results.json`);
        } catch (err) {
            console.error(`Error fetching results for Round ${round}:`, err.message);
            return;
        }

        const raceResults = resultsRes.data?.MRData?.RaceTable?.Races[0]?.Results;
        if (!raceResults || raceResults.length < 3) {
            console.log(`Results for Round ${round} are not available yet.`);
            return;
        }

        const a1 = raceResults[0].Driver.driverId;
        const a2 = raceResults[1].Driver.driverId;
        const a3 = raceResults[2].Driver.driverId;
        const actualPodium = [a1, a2, a3];

        const getDriverName = (idx) => `${raceResults[idx].Driver.givenName} ${raceResults[idx].Driver.familyName}`;

        const predictions = getPredictions();
        const roundPredictions = predictions[round] || {};
        const userIds = Object.keys(roundPredictions);

        if (userIds.length === 0) {
            console.log(`No predictions for Round ${round}. Setting as processed.`);
            leaderboard.processedRounds.push(round);
            saveLeaderboard(leaderboard);
            return;
        }

        for (const userId of userIds) {
            const pred = roundPredictions[userId];
            let pointsEarned = 0;

            // Exact Match (P1=P1, P2=P2, P3=P3) = 2 points
            if (pred.p1 === a1) pointsEarned += 2;
            if (pred.p2 === a2) pointsEarned += 2;
            if (pred.p3 === a3) pointsEarned += 2;

            // Wrong Position Podium Match = 1 point
            if (pred.p1 !== a1 && actualPodium.includes(pred.p1)) pointsEarned += 1;
            if (pred.p2 !== a2 && actualPodium.includes(pred.p2)) pointsEarned += 1;
            if (pred.p3 !== a3 && actualPodium.includes(pred.p3)) pointsEarned += 1;

            if (!leaderboard.users[userId]) {
                leaderboard.users[userId] = { username: pred.username || 'Unknown', points: 0 };
            }
            leaderboard.users[userId].points += pointsEarned;
            leaderboard.users[userId].username = pred.username || leaderboard.users[userId].username;

            try {
                const user = await client.users.fetch(userId);
                const getPrettyName = (id) => id.charAt(0).toUpperCase() + id.slice(1);

                await user.send(
                    `🏁 **F1 Predictions Results: ${lastFinishedRace.raceName}** 🏁\n\n` +
                    `**Actual Podium:**\n` +
                    `🥇 **P1:** ${getDriverName(0)}\n` +
                    `🥈 **P2:** ${getDriverName(1)}\n` +
                    `🥉 **P3:** ${getDriverName(2)}\n\n` +
                    `**Your Predictions:**\n` +
                    `🥇 **P1:** ${getPrettyName(pred.p1)} ${pred.p1 === a1 ? '✅ (+2 pts Exact Match!)' : actualPodium.includes(pred.p1) ? '✔️ (+1 pt Podium Match)' : '❌ (0 pts)'}\n` +
                    `🥈 **P2:** ${getPrettyName(pred.p2)} ${pred.p2 === a2 ? '✅ (+2 pts Exact Match!)' : actualPodium.includes(pred.p2) ? '✔️ (+1 pt Podium Match)' : '❌ (0 pts)'}\n` +
                    `🥉 **P3:** ${getPrettyName(pred.p3)} ${pred.p3 === a3 ? '✅ (+2 pts Exact Match!)' : actualPodium.includes(pred.p3) ? '✔️ (+1 pt Podium Match)' : '❌ (0 pts)'}\n\n` +
                    `You earned **${pointsEarned} points** in this round!\n` +
                    `Your total score is now **${leaderboard.users[userId].points} points**.`
                );
            } catch (err) {
                console.error(`Failed to DM results to ${userId}:`, err.message);
            }
        }

        leaderboard.processedRounds.push(round);
        saveLeaderboard(leaderboard);
        console.log(`Scored results for Round ${round}.`);
    } catch (error) {
        console.error('Error in processRaceResults:', error);
    }
}

function initSchedulers(client) {
    // Schedule weekly schedule & drivers sync on Mondays at 12:00 PM
    cron.schedule('0 12 * * 1', fetchF1Schedule);

    // Check races & process finished race results every hour
    cron.schedule('0 * * * *', async () => {
        await checkUpcomingRaces(client);
        await processRaceResults(client);
    });
}

module.exports = {
    getUpcomingRace,
    isPredictionLocked,
    checkUpcomingRaces,
    processRaceResults,
    initSchedulers
};
