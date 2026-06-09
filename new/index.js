const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cron = require('node-cron');
require('dotenv').config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

const SUBSCRIPTIONS_FILE = path.join(__dirname, 'data', 'subscriptions.json');
const SCHEDULE_FILE = path.join(__dirname, 'data', 'schedule.json');

// Ensure data files exist
if (!fs.existsSync(SUBSCRIPTIONS_FILE)) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({ subscribers: [] }));
}
if (!fs.existsSync(SCHEDULE_FILE)) {
    fs.writeFileSync(SCHEDULE_FILE, JSON.stringify({}));
}

function getSubscribers() {
    return JSON.parse(fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8')).subscribers;
}

function saveSubscribers(subscribers) {
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({ subscribers }, null, 2));
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
        .setDescription('Get the date and time of the next F1 race.')
].map(command => command.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Fetch F1 Schedule
async function fetchF1Schedule() {
    try {
        console.log('Fetching F1 schedule...');
        const response = await axios.get('https://api.jolpi.ca/ergast/f1/current.json');
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(response.data, null, 2));
        console.log('F1 schedule updated successfully.');
    } catch (error) {
        console.error('Error fetching F1 schedule:', error.message);
    }
}

// Check for upcoming races
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

            // Check if race is exactly between 24 and 25 hours away to ensure we ping once
            if (hoursDiff > 24 && hoursDiff <= 25) {
                const subscribers = getSubscribers();
                if (subscribers.length > 0) {
                    const channel = await client.channels.fetch(process.env.NOTIFICATION_CHANNEL_ID);
                    if (channel) {
                        const mentions = subscribers.map(id => `<@${id}>`).join(' ');
                        const message = `${mentions}\n🏎️ **Reminder!** The **${nextRace.raceName}** starts in exactly 24 hours!`;
                        await channel.send(message);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Error checking upcoming races:', error);
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

    // Initial fetch if schedule is empty
    const scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
    if (!scheduleData.MRData) {
        await fetchF1Schedule();
    }

    // Schedule Cron Jobs
    // Fetch schedule every Monday at 12:00
    cron.schedule('0 12 * * 1', fetchF1Schedule);

    // Check for races every hour
    cron.schedule('0 * * * *', checkUpcomingRaces);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

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
            // Use Discord timestamp formatting for local time conversion
            const timestamp = Math.floor(raceDate.getTime() / 1000);
            await interaction.reply({ content: `The next race is the **${nextRace.raceName}** on <t:${timestamp}:F>.`, ephemeral: true });
        } else {
            await interaction.reply({ content: 'There are no upcoming races in the current schedule.', ephemeral: true });
        }
    }
});

// Start the bot (Requires token in .env)
if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your_discord_bot_token_here') {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.error('Please configure your .env file with a valid DISCORD_TOKEN.');
}
