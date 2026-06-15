const fs = require('fs');
const {
    DATA_DIR,
    SUBSCRIPTIONS_FILE,
    SCHEDULE_FILE,
    INTERACTED_FILE,
    PREDICTIONS_FILE,
    LEADERBOARD_FILE,
    DRIVERS_FILE,
    REMINDERS_FILE
} = require('./config');

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
if (!fs.existsSync(REMINDERS_FILE)) {
    fs.writeFileSync(REMINDERS_FILE, JSON.stringify({ sentRoundReminders: [] }));
}

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

function getSentReminders() {
    try {
        return JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')).sentRoundReminders || [];
    } catch (err) {
        return [];
    }
}

function markReminderAsSent(round) {
    try {
        const data = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
        if (!data.sentRoundReminders) data.sentRoundReminders = [];
        if (!data.sentRoundReminders.includes(round)) {
            data.sentRoundReminders.push(round);
            fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Error marking reminder as sent:', err.message);
    }
}

module.exports = {
    getSubscribers,
    saveSubscribers,
    saveInteractedUser,
    getPredictions,
    savePredictions,
    getLeaderboard,
    saveLeaderboard,
    getDrivers,
    saveDrivers,
    getSentReminders,
    markReminderAsSent
};
