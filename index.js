const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const fs = require('fs');
const { SCHEDULE_FILE, DRIVERS_FILE, commands } = require('./src/config');
const { fetchF1Schedule } = require('./src/api');
const { initSchedulers } = require('./src/scheduler');
const { handleAutocomplete, handleInteraction, handleMessage, handleButton } = require('./src/handlers/commands');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.MessageContent
    ],
    partials: [Partials.Channel, Partials.Message, Partials.User]
});

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

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
        console.error('Error refreshing slash commands:', error);
    }

    // Initial fetch if schedule or drivers cache is empty
    let scheduleData = {};
    let driversData = {};
    try {
        scheduleData = JSON.parse(fs.readFileSync(SCHEDULE_FILE, 'utf8'));
        driversData = JSON.parse(fs.readFileSync(DRIVERS_FILE, 'utf8'));
    } catch (err) {}

    if (!scheduleData.MRData || !driversData.MRData) {
        await fetchF1Schedule();
    }

    // Start all background cron jobs
    initSchedulers(client);
    console.log('Schedulers initialized.');
});

client.on('interactionCreate', async interaction => {
    if (interaction.isAutocomplete()) {
        try {
            await handleAutocomplete(interaction);
        } catch (err) {
            console.error('Error in autocomplete handler:', err);
        }
        return;
    }

    if (interaction.isChatInputCommand()) {
        try {
            await handleInteraction(interaction, client);
        } catch (err) {
            console.error('Error handling interaction command:', err);
        }
    }

    if (interaction.isButton()) {
        try {
            await handleButton(interaction);
        } catch (err) {
            console.error('Error handling button interaction:', err);
        }
    }
});

client.on('messageCreate', async message => {
    try {
        await handleMessage(message, client);
    } catch (err) {
        console.error('Error handling message command:', err);
    }
});

// Start the bot
if (process.env.DISCORD_TOKEN && process.env.DISCORD_TOKEN !== 'your_discord_bot_token_here') {
    client.login(process.env.DISCORD_TOKEN);
} else {
    console.error('Please configure your .env file with a valid DISCORD_TOKEN.');
}
