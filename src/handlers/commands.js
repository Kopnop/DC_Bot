const fs = require('fs');
const {
    DRIVERS_FILE,
    SCHEDULE_FILE,
    COMMANDS_HELP_TEXT
} = require('../config');
const {
    getUpcomingRace,
    isPredictionLocked
} = require('../scheduler');
const {
    getSubscribers,
    saveSubscribers,
    saveInteractedUser,
    getPredictions,
    savePredictions,
    getLeaderboard
} = require('../db');
const {
    normalizeDriverName,
    formatToCET
} = require('../utils');
const {
    fetchDriverStandings,
    fetchTeamStandings
} = require('../api');

async function handleAutocomplete(interaction) {
    if (interaction.commandName === 'predict') {
        const focusedValue = interaction.options.getFocused().toLowerCase();
        const upcomingRace = getUpcomingRace();
        if (!upcomingRace) return interaction.respond([]);

        let driversData = {};
        try {
            driversData = JSON.parse(fs.readFileSync(DRIVERS_FILE, 'utf8'));
        } catch (err) { }

        const drivers = driversData.MRData?.DriverTable?.Drivers || [];

        const choices = drivers.map(d => ({
            name: `${d.givenName} ${d.familyName} (${d.code || d.driverId.toUpperCase().slice(0, 3)})`,
            value: d.driverId
        }));

        const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue)).slice(0, 25);
        await interaction.respond(filtered);
    }
}

async function handleInteraction(interaction, client) {
    const isNew = saveInteractedUser(interaction.user.id);
    if (isNew) {
        try {
            await interaction.reply({
                content: "Welcome to the F1 Reminder Bot! 🏎️\nI will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n" + COMMANDS_HELP_TEXT,
                ephemeral: true
            });
        } catch (error) {
            console.error(`Failed to send welcome interaction reply to ${interaction.user.tag}:`, error.message);
        }
        return;
    }

    if (interaction.commandName === 'subscribe') {
        const subscribers = getSubscribers();
        if (!subscribers.includes(interaction.user.id)) {
            subscribers.push(interaction.user.id);
            saveSubscribers(subscribers);
            await interaction.reply({ content: 'You have successfully subscribed to F1 race notifications!', ephemeral: true });
        } else {
            await interaction.reply({ content: 'You are already subscribed.', ephemeral: true });
        }
    } else if (interaction.commandName === 'unsubscribe') {
        let subscribers = getSubscribers();
        if (subscribers.includes(interaction.user.id)) {
            subscribers = subscribers.filter(id => id !== interaction.user.id);
            saveSubscribers(subscribers);
            await interaction.reply({ content: 'You have been unsubscribed from F1 race notifications.', ephemeral: true });
        } else {
            await interaction.reply({ content: 'You are not currently subscribed.', ephemeral: true });
        }
    } else if (interaction.commandName === 'nextrace') {
        const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        const races = scheduleData.MRData?.RaceTable?.Races;

        if (!races) {
            return interaction.reply({ content: 'Race schedule data is not available yet. Please try again later.', ephemeral: true });
        }

        const now = new Date();
        const nextRace = races.find(race => new Date(`${race.date}T${race.time}`) > now);

        if (nextRace) {
            const raceDate = new Date(`${nextRace.date}T${nextRace.time}`);
            const timestamp = Math.floor(raceDate.getTime() / 1000);
            const formattedTime = formatToCET(raceDate);
            await interaction.reply({ content: `The next race is the **${nextRace.raceName}** on <t:${timestamp}:F> (${formattedTime}).`, ephemeral: true });
        } else {
            await interaction.reply({ content: 'There are no upcoming races in the current schedule.', ephemeral: true });
        }
    } else if (interaction.commandName === 'info') {
        await interaction.reply({
            content: "I will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n" + COMMANDS_HELP_TEXT,
            ephemeral: true
        });
    } else if (interaction.commandName === 'predict') {
        const upcomingRace = getUpcomingRace();
        if (!upcomingRace) {
            return interaction.reply({ content: 'There are no upcoming F1 races scheduled.', ephemeral: true });
        }

        if (isPredictionLocked(upcomingRace)) {
            return interaction.reply({ content: `Predictions for the **${upcomingRace.raceName}** are locked. They close at the race start time.`, ephemeral: true });
        }

        const p1 = interaction.options.getString('p1');
        const p2 = interaction.options.getString('p2');
        const p3 = interaction.options.getString('p3');

        if (p1 === p2 || p1 === p3 || p2 === p3) {
            return interaction.reply({ content: 'You must predict three different drivers for the podium!', ephemeral: true });
        }

        // Validate against drivers list
        let driversData = {};
        try {
            driversData = JSON.parse(fs.readFileSync(DRIVERS_FILE, 'utf8'));
        } catch (err) { }
        const drivers = driversData.MRData?.DriverTable?.Drivers || [];
        const driverIds = drivers.map(d => d.driverId);

        if (!driverIds.includes(p1) || !driverIds.includes(p2) || !driverIds.includes(p3)) {
            return interaction.reply({ content: 'One or more selected drivers are invalid or not participating this weekend.', ephemeral: true });
        }

        const round = upcomingRace.round;
        const predictions = getPredictions();
        if (!predictions[round]) {
            predictions[round] = {};
        }

        predictions[round][interaction.user.id] = {
            username: interaction.user.tag,
            p1,
            p2,
            p3,
            timestamp: new Date().toISOString()
        };
        savePredictions(predictions);

        const getPrettyName = (id) => id.charAt(0).toUpperCase() + id.slice(1);
        const raceDate = new Date(`${upcomingRace.date}T${upcomingRace.time}`);
        const formattedTime = formatToCET(raceDate);
        await interaction.reply({
            content: `🏎️ **Prediction Saved for the ${upcomingRace.raceName}!**\n\n` +
                `🥇 **P1:** ${getPrettyName(p1)}\n` +
                `🥈 **P2:** ${getPrettyName(p2)}\n` +
                `🥉 **P3:** ${getPrettyName(p3)}\n\n` +
                `*Note: Predictions lock at the race start time (on ${formattedTime}). You can run \`/predict\` again to update your choices.*`,
            ephemeral: true
        });
    } else if (interaction.commandName === 'mypredictions') {
        const upcomingRace = getUpcomingRace();
        if (!upcomingRace) {
            return interaction.reply({ content: 'There are no upcoming F1 races scheduled.', ephemeral: true });
        }

        const round = upcomingRace.round;
        const predictions = getPredictions();
        const userPred = predictions[round]?.[interaction.user.id];

        if (!userPred) {
            return interaction.reply({ content: `You have not placed any predictions for the **${upcomingRace.raceName}** yet. Use \`/predict\` to submit one!`, ephemeral: true });
        }

        const getPrettyName = (id) => id.charAt(0).toUpperCase() + id.slice(1);
        const isLocked = isPredictionLocked(upcomingRace);
        const raceDate = new Date(`${upcomingRace.date}T${upcomingRace.time}`);
        const formattedTime = formatToCET(raceDate);

        await interaction.reply({
            content: `📋 **Your Predictions for the ${upcomingRace.raceName}:**\n\n` +
                `🥇 **P1:** ${getPrettyName(userPred.p1)}\n` +
                `🥈 **P2:** ${getPrettyName(userPred.p2)}\n` +
                `🥉 **P3:** ${getPrettyName(userPred.p3)}\n\n` +
                `Status: ${isLocked ? '🔒 **Locked**' : `🔓 **Open (editable until ${formattedTime})**`}`,
            ephemeral: true
        });
    } else if (interaction.commandName === 'leaderboard') {
        const leaderboard = getLeaderboard();
        const users = leaderboard.users || {};

        const sorted = Object.entries(users)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.points - a.points);

        if (sorted.length === 0) {
            return interaction.reply({ content: 'The prediction leaderboard is currently empty.', ephemeral: true });
        }

        let leaderboardText = '🏆 **F1 Predictions Seasonal Leaderboard** 🏆\n\n';
        sorted.slice(0, 10).forEach((user, idx) => {
            let medal = `${idx + 1}.`;
            if (idx === 0) medal = '🥇';
            else if (idx === 1) medal = '🥈';
            else if (idx === 2) medal = '🥉';

            leaderboardText += `${medal} **${user.username}**: ${user.points} pts\n`;
        });

        await interaction.reply({ content: leaderboardText, ephemeral: true });
    } else if (interaction.commandName === 'driverstandings') {
        await interaction.deferReply({ ephemeral: true });
        const standingsText = await fetchDriverStandings();
        await interaction.editReply({ content: standingsText });
    } else if (interaction.commandName === 'teamstandings') {
        await interaction.deferReply({ ephemeral: true });
        const standingsText = await fetchTeamStandings();
        await interaction.editReply({ content: standingsText });
    }
}

async function handleMessage(message, client) {
    if (message.author.bot) return;

    if (!message.guild) {
        const content = message.content.trim();
        const args = content.split(/\s+/);
        const command = args[0].toLowerCase();

        const isNew = saveInteractedUser(message.author.id);
        if (isNew) {
            try {
                await message.author.send("Welcome to the F1 Reminder Bot! 🏎️\nI will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n" + COMMANDS_HELP_TEXT);
            } catch (error) {
                console.error(`Failed to send welcome DM to ${message.author.tag}:`, error.message);
            }
            return;
        }

        if (command === 'predict') {
            const upcomingRace = getUpcomingRace();
            if (!upcomingRace) {
                return message.reply('There are no upcoming F1 races scheduled.');
            }
            if (isPredictionLocked(upcomingRace)) {
                return message.reply(`Predictions for the **${upcomingRace.raceName}** are locked.`);
            }

            if (args.length < 4) {
                return message.reply('To predict, please use the format: `predict [p1] [p2] [p3]` (e.g. `predict ver nor lec`).\nAlternatively, you can use the slash command `/predict`.');
            }

            const p1 = normalizeDriverName(args[1]);
            const p2 = normalizeDriverName(args[2]);
            const p3 = normalizeDriverName(args[3]);

            if (p1 === p2 || p1 === p3 || p2 === p3) {
                return message.reply('You must predict three different drivers for the podium!');
            }

            // Validate drivers list
            let driversData = {};
            try {
                driversData = JSON.parse(fs.readFileSync(DRIVERS_FILE, 'utf8'));
            } catch (err) { }
            const drivers = driversData.MRData?.DriverTable?.Drivers || [];
            const driverIds = drivers.map(d => d.driverId);

            if (!driverIds.includes(p1) || !driverIds.includes(p2) || !driverIds.includes(p3)) {
                // Return a clean list of driver abbreviations
                const validCodes = drivers.map(d => d.code || d.driverId.toUpperCase().slice(0, 3)).join(', ');
                return message.reply(`One or more of your driver entries are invalid. Valid drivers this weekend are: ${validCodes}`);
            }

            const round = upcomingRace.round;
            const predictions = getPredictions();
            if (!predictions[round]) {
                predictions[round] = {};
            }
            predictions[round][message.author.id] = {
                username: message.author.tag,
                p1,
                p2,
                p3,
                timestamp: new Date().toISOString()
            };
            savePredictions(predictions);

            const getPrettyName = (id) => id.charAt(0).toUpperCase() + id.slice(1);
            const raceDate = new Date(`${upcomingRace.date}T${upcomingRace.time}`);
            const formattedTime = formatToCET(raceDate);
            await message.reply(
                `🏎️ **Prediction Saved for the ${upcomingRace.raceName}!**\n\n` +
                `🥇 **P1:** ${getPrettyName(p1)}\n` +
                `🥈 **P2:** ${getPrettyName(p2)}\n` +
                `🥉 **P3:** ${getPrettyName(p3)}\n\n` +
                `You can run this command again to update your predictions before the race starts (closes on ${formattedTime}).`
            );
        } else if (command === 'mypredictions' || command === 'mypredict') {
            const upcomingRace = getUpcomingRace();
            if (!upcomingRace) {
                return message.reply('There are no upcoming F1 races scheduled.');
            }
            const round = upcomingRace.round;
            const predictions = getPredictions();
            const userPred = predictions[round]?.[message.author.id];

            if (!userPred) {
                return message.reply(`You have not placed any predictions for the **${upcomingRace.raceName}** yet. Type \`predict [p1] [p2] [p3]\` to submit one!`);
            }

            const getPrettyName = (id) => id.charAt(0).toUpperCase() + id.slice(1);
            const isLocked = isPredictionLocked(upcomingRace);
            const myraceDate = new Date(`${upcomingRace.date}T${upcomingRace.time}`);
            const myformattedTime = formatToCET(myraceDate);
            await message.reply(
                `📋 **Your Predictions for the ${upcomingRace.raceName}:**\n\n` +
                `🥇 **P1:** ${getPrettyName(userPred.p1)}\n` +
                `🥈 **P2:** ${getPrettyName(userPred.p2)}\n` +
                `🥉 **P3:** ${getPrettyName(userPred.p3)}\n\n` +
                `Status: ${isLocked ? '🔒 **Locked**' : `🔓 **Open (editable until ${myformattedTime})**`}`
            );
        } else if (command === 'leaderboard') {
            const leaderboard = getLeaderboard();
            const users = leaderboard.users || {};

            const sorted = Object.entries(users)
                .map(([id, data]) => ({ id, ...data }))
                .sort((a, b) => b.points - a.points);

            if (sorted.length === 0) {
                return message.reply('The prediction leaderboard is currently empty.');
            }

            let leaderboardText = '🏆 **F1 Predictions Seasonal Leaderboard** 🏆\n\n';
            sorted.slice(0, 10).forEach((user, idx) => {
                let medal = `${idx + 1}.`;
                if (idx === 0) medal = '🥇';
                else if (idx === 1) medal = '🥈';
                else if (idx === 2) medal = '🥉';

                leaderboardText += `${medal} **${user.username}**: ${user.points} pts\n`;
            });
            await message.reply(leaderboardText);
        } else if (content === 'subscribe') {
            const subscribers = getSubscribers();
            if (!subscribers.includes(message.author.id)) {
                subscribers.push(message.author.id);
                saveSubscribers(subscribers);
                await message.reply('You have successfully subscribed to F1 race notifications!');
            } else {
                await message.reply('You are already subscribed.');
            }
        } else if (content === 'unsubscribe') {
            let subscribers = getSubscribers();
            if (subscribers.includes(message.author.id)) {
                subscribers = subscribers.filter(id => id !== message.author.id);
                saveSubscribers(subscribers);
                await message.reply('You have been unsubscribed from F1 race notifications.');
            } else {
                await message.reply('You are not currently subscribed.');
            }
        } else if (content === 'nextrace' || content === 'next') {
            const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
            const races = scheduleData.MRData?.RaceTable?.Races;

            if (!races) {
                return message.reply('Race schedule data is not available yet. Please try again later.');
            }

            const now = new Date();
            const nextRace = races.find(race => new Date(`${race.date}T${race.time}`) > now);

            if (nextRace) {
                const raceDate = new Date(`${nextRace.date}T${nextRace.time}`);
                const timestamp = Math.floor(raceDate.getTime() / 1000);
                const formattedTime = formatToCET(raceDate);
                await message.reply(`The next race is the **${nextRace.raceName}** on <t:${timestamp}:F> (${formattedTime}).`);
            } else {
                await message.reply('There are no upcoming races in the current schedule.');
            }
        } else if (command === 'driverstandings' || command === '/driverstandings' || command === 'drivers') {
            const standingsText = await fetchDriverStandings();
            await message.reply(standingsText);
        } else if (command === 'teamstandings' || command === '/teamstandings' || command === 'teams') {
            const standingsText = await fetchTeamStandings();
            await message.reply(standingsText);
        } else if (content === 'info' || content === 'help') {
            await message.reply("I will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n" + COMMANDS_HELP_TEXT);
        } else {
            await message.reply("Hello! You can DM me the following commands:\n" + COMMANDS_HELP_TEXT + "\n\nYou can also use slash commands (e.g. `/predict`).");
        }
    }
}

module.exports = {
    handleAutocomplete,
    handleInteraction,
    handleMessage
};
