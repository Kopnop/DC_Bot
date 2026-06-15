const path = require('path');
const { SlashCommandBuilder } = require('discord.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const INTERACTED_FILE = path.join(DATA_DIR, 'interacted.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const DRIVERS_FILE = path.join(DATA_DIR, 'drivers.json');
const REMINDERS_FILE = path.join(DATA_DIR, 'sent_reminders.json');

const COMMANDS_HELP_TEXT = 
    "- **/subscribe** (or type **subscribe**): Subscribe to race reminders.\n" +
    "- **/unsubscribe** (or type **unsubscribe**): Stop receiving reminders.\n" +
    "- **/nextrace** (or type **next**): Get details for the upcoming race.\n" +
    "- **/predict** (or type **predict [p1] [p2] [p3]**): Submit podium predictions *(Scoring: +2 pts exact match, +1 pt podium match)*.\n" +
    "- **/mypredictions** (or type **mypredictions**): View your current predictions.\n" +
    "- **/leaderboard** (or type **leaderboard**): View seasonal prediction standings.\n" +
    "- **/driverstandings** (or type **driverstandings** or **drivers**): View current F1 driver standings.\n" +
    "- **/teamstandings** (or type **teamstandings** or **teams**): View current F1 team standings.\n" +
    "- **/info** (or type **info** or **help**): Show this command list.";

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
        .setDescription('View the seasonal F1 predictions leaderboard.'),
    new SlashCommandBuilder()
        .setName('driverstandings')
        .setDescription('Show current F1 driver championship standings.'),
    new SlashCommandBuilder()
        .setName('teamstandings')
        .setDescription('Show current F1 team championship standings.')
].map(command => command.toJSON());

module.exports = {
    DATA_DIR,
    SUBSCRIPTIONS_FILE,
    SCHEDULE_FILE,
    INTERACTED_FILE,
    PREDICTIONS_FILE,
    LEADERBOARD_FILE,
    DRIVERS_FILE,
    REMINDERS_FILE,
    COMMANDS_HELP_TEXT,
    DRIVER_MAPPING,
    commands
};
