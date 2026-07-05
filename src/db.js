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

function getRawSubscriptions() {
    try {
        const fileContent = fs.readFileSync(SUBSCRIPTIONS_FILE, 'utf8');
        const data = JSON.parse(fileContent);
        let subscribers = data.subscribers || {};
        
        // Migrate old array format if present
        if (Array.isArray(subscribers)) {
            const migrated = {};
            for (const item of subscribers) {
                if (typeof item === 'string') {
                    migrated[item] = {
                        weekend: true,
                        qualifying: false,
                        sprint: false,
                        race: false
                    };
                }
            }
            data.subscribers = migrated;
            fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify(data, null, 2));
            subscribers = migrated;
        }
        return subscribers;
    } catch (err) {
        console.error('Error reading subscriptions:', err.message);
        return {};
    }
}

function getSubscribers() {
    const subs = getRawSubscriptions();
    return Object.keys(subs);
}

function saveSubscribers(subscribers) {
    const currentSubs = getRawSubscriptions();
    const newSubs = {};
    for (const id of subscribers) {
        newSubs[id] = currentSubs[id] || {
            weekend: true,
            qualifying: false,
            sprint: false,
            race: false
        };
    }
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({ subscribers: newSubs }, null, 2));
}

function getUserSubscription(userId) {
    const subs = getRawSubscriptions();
    return subs[userId] || null;
}

function saveUserSubscription(userId, settings) {
    const subs = getRawSubscriptions();
    if (settings === null) {
        delete subs[userId];
    } else {
        subs[userId] = {
            weekend: settings.weekend !== undefined ? settings.weekend : true,
            qualifying: !!settings.qualifying,
            sprint: !!settings.sprint,
            race: !!settings.race
        };
    }
    fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({ subscribers: subs }, null, 2));
}

function getSubscribersForType(type) {
    const subs = getRawSubscriptions();
    const activeUserIds = [];
    for (const [userId, settings] of Object.entries(subs)) {
        if (settings[type]) {
            activeUserIds.push(userId);
        }
    }
    return activeUserIds;
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

function markReminderAsSent(round, type) {
    try {
        const data = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8'));
        if (!data.sentRoundReminders) data.sentRoundReminders = [];
        const reminderKey = type ? `${round}-${type}` : `${round}`;
        if (!data.sentRoundReminders.includes(reminderKey)) {
            data.sentRoundReminders.push(reminderKey);
            fs.writeFileSync(REMINDERS_FILE, JSON.stringify(data, null, 2));
        }
    } catch (err) {
        console.error('Error marking reminder as sent:', err.message);
    }
}

module.exports = {
    getSubscribers,
    saveSubscribers,
    getUserSubscription,
    saveUserSubscription,
    getSubscribersForType,
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
