const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

const DATA_DIR = path.join(__dirname, 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const INTERACTED_FILE = path.join(DATA_DIR, 'interacted.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const DRIVERS_FILE = path.join(DATA_DIR, 'drivers.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Ensure data files exist
if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({ subscribers: [] }));
}
if (!fs.existsSync(SCHEDULE_FILE)) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({}));
}
if (!fs.existsSync(INTERACTED_FILE)) {
    fs.writeFileSync(INTERACTED_FILE, JSON.stringify({ users: [] }));
}
if (!fs.existsSync(PREDICTIONS_FILE)) {
    fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify({}));
}
if (!fs.existsSync(LEADERBOARD_FILE)) {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify({ processedRounds: [], users: {} }));
}
if (!fs.existsSync(DRIVERS_FILE)) {
    fs.writeFileSync(DRIVERS_FILE, JSON.stringify({}));
}

// File Access Helpers
function getSubscribers() {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')).subscribers;
}

function saveSubscribers(subscribers) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({ subscribers }, null, 2));
}

function saveInteractedUser(userId) {
    const data = JSON.parse(fs.readFileSync(INTERACTED_FILE, 'utf8'));
    if (!data.users.includes(userId)) {
        data.users.push(userId);
        fs.writeFileSync(INTERACTED_FILE, JSON.stringify(data, null, 2));
        return true;
    }
    return false;
}

function getPredictions() {
    return JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
}

function savePredictions(predictions) {
    fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify(predictions, null, 2));
}

function getLeaderboard() {
    return JSON.parse(fs.readFileSync(LEADERBOARD_FILE, 'utf8'));
}

function saveLeaderboard(leaderboard) {
    fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify(leaderboard, null, 2));
}

function getDrivers() {
    return JSON.parse(fs.readFileSync(DRIVERS_FILE, 'utf8'));
}

function saveDrivers(drivers) {
    fs.writeFileSync(DRIVERS_FILE, JSON.stringify(drivers, null, 2));
}

// Driver Mapping & Normalization
const DRIVER_MAPPING = {
    'verstappen': 'verstappen', 'ver': 'verstappen',
    'norris': 'norris', 'nor': 'norris',
    'leclerc': 'leclerc', 'lec': 'leclerc',
    'piastri': 'piastri', 'pia': 'piastri',
    'sainz': 'sainz', 'sai': 'sainz',
    'hamilton': 'hamilton', 'ham': 'hamilton',
    'russell': 'russell', 'rus': 'russell',
    'perez': 'perez', 'per': 'perez',
    'alonso': 'alonso', 'alo': 'alonso',
    'stroll': 'stroll', 'str': 'stroll',
    'tsunoda': 'tsunoda', 'tsu': 'tsunoda',
    'hulkenberg': 'hulkenberg', 'hul': 'hulkenberg',
    'ricciardo': 'ricciardo', 'ric': 'ricciardo',
    'lawson': 'lawson', 'law': 'lawson',
    'magnussen': 'magnussen', 'mag': 'magnussen',
    'bearman': 'bearman', 'bea': 'bearman',
    'albon': 'albon', 'alb': 'albon',
    'colapinto': 'colapinto', 'col': 'colapinto',
    'sargeant': 'sargeant', 'sar': 'sargeant',
    'ocon': 'ocon', 'oco': 'ocon',
    'gasly': 'gasly', 'gas': 'gasly',
    'bottas': 'bottas', 'bot': 'bottas',
    'zhou': 'zhou', 'zho': 'zhou',
    'doohan': 'doohan', 'doo': 'doohan',
    'antonelli': 'antonelli', 'ant': 'antonelli',
    'hadjar': 'hadjar', 'had': 'hadjar',
    'borges': 'borges', 'bor': 'borges'
};

function normalizeDriverName(name) {
    if (!name) return '';
    const clean = name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const words = clean.split(/[^a-z0-9]+/);
    
    // 1. Try matching the entire string exactly first
    for (const key of Object.keys(DRIVER_MAPPING)) {
        if (clean === key) {
            return DRIVER_MAPPING[key];
        }
    }
    
    // 2. Check if any word matches a 3-letter code exactly
    for (const word of words) {
        if (word.length === 3 && DRIVER_MAPPING[word]) {
            return DRIVER_MAPPING[word];
        }
    }
    
    // 3. Check if any word matches a full driver key exactly (e.g. "verstappen")
    for (const word of words) {
        if (DRIVER_MAPPING[word]) {
            return DRIVER_MAPPING[word];
        }
    }
    
    // 4. Fallback: Check if any key starts with a word as a prefix
    for (const word of words) {
        for (const key of Object.keys(DRIVER_MAPPING)) {
            if (word.startsWith(key)) {
                return DRIVER_MAPPING[key];
            }
        }
    }
    
    const lastWord = words[words.length - 1];
    if (DRIVER_MAPPING[lastWord]) {
        return DRIVER_MAPPING[lastWord];
    }
    
    return lastWord || clean;
}

// Commands Definition
const commands = [
    new SlashCommandBuilder()
        .setName('subscribe')
        .setDescription('Subscribe to get notified 24h before an F1 race.'),
    new SlashCommandBuilder()
        .setName('unsubscribe')
        .setDescription('Unsubscribe from F1 race notifications.'),
    new SlashCommandBuilder()
        .setName('nextrace')
        .setDescription('Get the date and time of the next F1 race.'),
    new SlashCommandBuilder()
        .setName('info')
        .setDescription('Get information about the F1 Reminder Bot and available commands.'),
    new SlashCommandBuilder()
        .setName('predict')
        .setDescription('Predict the podium (P1, P2, P3) for the upcoming F1 race.')
        .addStringOption(option =>
            option.setName('p1')
                .setDescription('Select the driver you predict to finish P1')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('p2')
                .setDescription('Select the driver you predict to finish P2')
                .setRequired(true)
                .setAutocomplete(true))
        .addStringOption(option =>
            option.setName('p3')
                .setDescription('Select the driver you predict to finish P3')
                .setRequired(true)
                .setAutocomplete(true)),
    new SlashCommandBuilder()
        .setName('mypredictions')
        .setDescription('View your predictions for the upcoming F1 race.'),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the seasonal F1 predictions leaderboard.')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Fetch F1 Schedule and Active Drivers List from Jolpi/Ergast
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
async function checkUpcomingRaces() {
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
            if (hoursDiff > 24 && hoursDiff <= 25) {
                const subscribers = getSubscribers();
                for (const userId of subscribers) {
                    try {
                        const user = await client.users.fetch(userId);
                        await user.send(`🏎️ **Reminder!** The **${nextRace.raceName}** starts in exactly 24 hours! Make sure to submit your podium predictions using \`/predict\`!`);
                        console.log(`Sent F1 race reminder DM to ${user.tag} (${userId})`);
                    } catch (err) {
                        console.error(`Failed to send DM to user ${userId}:`, err.message);
                    }
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
async function processRaceResults() {
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

client.on('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);

    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands },
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }

    const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    const driversData = JSON.parse(fs.readFileSync(DRIVERS_FILE, 'utf8'));
    
    // Initial fetch if schedule or drivers cache is empty
    if (!scheduleData.MRData || !driversData.MRData) {
        await fetchF1Schedule();
    }

    // Schedule Cron Jobs
    cron.schedule('0 12 * * 1', fetchF1Schedule); // Schedule weekly schedule & drivers sync
    
    // Check races & process finished race results every hour
    cron.schedule('0 * * * *', async () => {
        await checkUpcomingRaces();
        await processRaceResults();
    });
});

client.on('interactionCreate', async interaction => {
    // Autocomplete Handler
    if (interaction.isAutocomplete()) {
        if (interaction.commandName === 'predict') {
            const focusedValue = interaction.options.getFocused().toLowerCase();
            const upcomingRace = getUpcomingRace();
            if (!upcomingRace) return interaction.respond([]);
            
            let driversData = {};
            try {
                driversData = JSON.parse(fs.readFileSync(DRIVERS_FILE, 'utf8'));
            } catch (err) {}
            
            const drivers = driversData.MRData?.DriverTable?.Drivers || [];
            
            const choices = drivers.map(d => ({
                name: `${d.givenName} ${d.familyName} (${d.code || d.driverId.toUpperCase().slice(0,3)})`,
                value: d.driverId
            }));
            
            const filtered = choices.filter(choice => choice.name.toLowerCase().includes(focusedValue)).slice(0, 25);
            await interaction.respond(filtered);
        }
        return;
    }

    if (!interaction.isChatInputCommand()) return;

    const isNew = saveInteractedUser(interaction.user.id);
    if (isNew && interaction.commandName !== 'info') {
        try {
            await interaction.user.send("Welcome to the F1 Reminder Bot! 🏎️\nI will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n- **/subscribe** (or type **subscribe**): Subscribe to race reminders.\n- **/unsubscribe** (or type **unsubscribe**): Stop receiving reminders.\n- **/nextrace** (or type **next**): Get details for the upcoming race.\n- **/predict** (or type **predict [p1] [p2] [p3]**): Submit podium predictions *(Scoring: +2 pts exact match, +1 pt podium match)*.\n- **/mypredictions** (or type **mypredictions**): View your current predictions.\n- **/leaderboard** (or type **leaderboard**): View seasonal prediction standings.\n- **/info** (or type **info** or **help**): Show this command list.");
        } catch (error) {
            console.error(`Failed to send welcome DM to ${interaction.user.tag}:`, error.message);
        }
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
            await interaction.reply({ content: `The next race is the **${nextRace.raceName}** on <t:${timestamp}:F>.`, ephemeral: true });
        } else {
            await interaction.reply({ content: 'There are no upcoming races in the current schedule.', ephemeral: true });
        }
    } else if (interaction.commandName === 'info') {
        await interaction.reply({
            content: "I will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n- **/subscribe** (or type **subscribe**): Subscribe to race reminders.\n- **/unsubscribe** (or type **unsubscribe**): Stop receiving reminders.\n- **/nextrace** (or type **next**): Get details for the upcoming race.\n- **/predict** (or type **predict [p1] [p2] [p3]**): Submit podium predictions *(Scoring: +2 pts exact match, +1 pt podium match)*.\n- **/mypredictions** (or type **mypredictions**): View your current predictions.\n- **/leaderboard** (or type **leaderboard**): View seasonal prediction standings.\n- **/info** (or type **info** or **help**): Show this command list.",
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
        } catch (err) {}
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
        await interaction.reply({
            content: `🏎️ **Prediction Saved for the ${upcomingRace.raceName}!**\n\n` +
                     `🥇 **P1:** ${getPrettyName(p1)}\n` +
                     `🥈 **P2:** ${getPrettyName(p2)}\n` +
                     `🥉 **P3:** ${getPrettyName(p3)}\n\n` +
                     `*Note: Predictions lock at the race start time (when they close). You can run \`/predict\` again to update your choices.*`,
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
        
        await interaction.reply({
            content: `📋 **Your Predictions for the ${upcomingRace.raceName}:**\n\n` +
                     `🥇 **P1:** ${getPrettyName(userPred.p1)}\n` +
                     `🥈 **P2:** ${getPrettyName(userPred.p2)}\n` +
                     `🥉 **P3:** ${getPrettyName(userPred.p3)}\n\n` +
                     `Status: ${isLocked ? '🔒 **Locked**' : '🔓 **Open (editable)**'}`,
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
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;

    if (!message.guild) {
        const content = message.content.trim();
        const args = content.split(/\s+/);
        const command = args[0].toLowerCase();
        
        const isNew = saveInteractedUser(message.author.id);
        if (isNew && command !== 'info' && command !== 'help') {
            try {
                await message.author.send("Welcome to the F1 Reminder Bot! 🏎️\nI will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n- **/subscribe** (or type **subscribe**): Subscribe to race reminders.\n- **/unsubscribe** (or type **unsubscribe**): Stop receiving reminders.\n- **/nextrace** (or type **next**): Get details for the upcoming race.\n- **/predict** (or type **predict [p1] [p2] [p3]**): Submit podium predictions *(Scoring: +2 pts exact match, +1 pt podium match)*.\n- **/mypredictions** (or type **mypredictions**): View your current predictions.\n- **/leaderboard** (or type **leaderboard**): View seasonal prediction standings.\n- **/info** (or type **info** or **help**): Show this command list.");
            } catch (error) {
                console.error(`Failed to send welcome DM to ${message.author.tag}:`, error.message);
            }
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
            } catch (err) {}
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
            await message.reply(
                `🏎️ **Prediction Saved for the ${upcomingRace.raceName}!**\n\n` +
                `🥇 **P1:** ${getPrettyName(p1)}\n` +
                `🥈 **P2:** ${getPrettyName(p2)}\n` +
                `🥉 **P3:** ${getPrettyName(p3)}\n\n` +
                `You can run this command again to update your predictions before the race starts.`
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
            await message.reply(
                `📋 **Your Predictions for the ${upcomingRace.raceName}:**\n\n` +
                `🥇 **P1:** ${getPrettyName(userPred.p1)}\n` +
                `🥈 **P2:** ${getPrettyName(userPred.p2)}\n` +
                `🥉 **P3:** ${getPrettyName(userPred.p3)}\n\n` +
                `Status: ${isLocked ? '🔒 **Locked**' : '🔓 **Open (editable)**'}`
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
                await message.reply(`The next race is the **${nextRace.raceName}** on <t:${timestamp}:F>.`);
            } else {
                await message.reply('There are no upcoming races in the current schedule.');
            }
        } else if (content === 'info' || content === 'help') {
            await message.reply("I will send you a DM 24 hours before each F1 race starts so you never miss a race.\n\nHere are all available commands:\n- **/subscribe** (or type **subscribe**): Subscribe to race reminders.\n- **/unsubscribe** (or type **unsubscribe**): Stop receiving reminders.\n- **/nextrace** (or type **next**): Get details for the upcoming race.\n- **/predict** (or type **predict [p1] [p2] [p3]**): Submit podium predictions *(Scoring: +2 pts exact match, +1 pt podium match)*.\n- **/mypredictions** (or type **mypredictions**): View your current predictions.\n- **/leaderboard** (or type **leaderboard**): View seasonal prediction standings.\n- **/info** (or type **info** or **help**): Show this command list.");
        } else {
            await message.reply("Hello! You can DM me the following commands:\n- **/subscribe** (or type **subscribe**): Subscribe to race reminders.\n- **/unsubscribe** (or type **unsubscribe**): Stop receiving reminders.\n- **/nextrace** (or type **next**): Get details for the upcoming race.\n- **/predict** (or type **predict [p1] [p2] [p3]**): Submit podium predictions *(Scoring: +2 pts exact match, +1 pt podium match)*.\n- **/mypredictions** (or type **mypredictions**): View your current predictions.\n- **/leaderboard** (or type **leaderboard**): View seasonal prediction standings.\n- **/info** (or type **info** or **help**): Show this command list.\n\nYou can also use slash commands (e.g. `/predict`).");
        }
    }
});

// Start the bot
if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your_discord_bot_token_here') {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.error('Please configure your .env file with a valid DISCORD_TOKEN.');
}
