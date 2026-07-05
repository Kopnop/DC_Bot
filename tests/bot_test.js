const fs = require('fs');
const path = require('path');
const assert = require('assert').strict;
const axios = require('axios');

// Set up paths matching config
const DATA_DIR = path.join(__dirname, '..', 'data');
const SCHEDULE_FILE = path.join(DATA_DIR, 'schedule.json');
const SUBSCRIPTIONS_FILE = path.join(DATA_DIR, 'subscriptions.json');
const REMINDERS_FILE = path.join(DATA_DIR, 'sent_reminders.json');
const PREDICTIONS_FILE = path.join(DATA_DIR, 'predictions.json');
const LEADERBOARD_FILE = path.join(DATA_DIR, 'leaderboard.json');
const DRIVERS_FILE = path.join(DATA_DIR, 'drivers.json');
const INTERACTED_FILE = path.join(DATA_DIR, 'interacted.json');

// Mock axios.get for external APIs
const originalGet = axios.get;
axios.get = async (url) => {
    if (url.includes('driverStandings.json')) {
        return {
            data: {
                MRData: {
                    StandingsTable: {
                        StandingsLists: [{
                            DriverStandings: [
                                { position: '1', points: '156', wins: '5', Driver: { givenName: 'Andrea Kimi', familyName: 'Antonelli' }, Constructors: [{ name: 'Mercedes' }] },
                                { position: '2', points: '115', wins: '1', Driver: { givenName: 'Lewis', familyName: 'Hamilton' }, Constructors: [{ name: 'Ferrari' }] }
                            ]
                        }]
                    }
                }
            }
        };
    }
    if (url.includes('constructorStandings.json')) {
        return {
            data: {
                MRData: {
                    StandingsTable: {
                        StandingsLists: [{
                            ConstructorStandings: [
                                { position: '1', points: '262', wins: '6', Constructor: { name: 'Mercedes' } },
                                { position: '2', points: '190', wins: '1', Constructor: { name: 'Ferrari' } }
                            ]
                        }]
                    }
                }
            }
        };
    }
    return originalGet(url);
};

// Require our refactored bot logic
const { getUpcomingRace, checkUpcomingRaces, isPredictionLocked } = require('../src/scheduler');
const { handleInteraction, handleMessage, handleAutocomplete } = require('../src/handlers/commands');
const { getUserSubscription, saveUserSubscription, getSubscribersForType } = require('../src/db');

// Backup original database files so testing doesn't affect user's local data
const backups = {};
const filesToBackup = [SCHEDULE_FILE, SUBSCRIPTIONS_FILE, REMINDERS_FILE, PREDICTIONS_FILE, LEADERBOARD_FILE, DRIVERS_FILE, INTERACTED_FILE];

function backupFiles() {
    filesToBackup.forEach(file => {
        if (fs.existsSync(file)) {
            backups[file] = fs.readFileSync(file);
        } else {
            backups[file] = null;
        }
    });
}

function restoreFiles() {
    filesToBackup.forEach(file => {
        if (backups[file] !== null) {
            fs.writeFileSync(file, backups[file]);
        } else if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    });
}

// Mock Discord client and message objects
class MockUser {
    constructor(id, tag) {
        this.id = id;
        this.tag = tag;
        this.receivedMessages = [];
    }
    async send(content) {
        this.receivedMessages.push(content);
        return true;
    }
}

class MockClient {
    constructor() {
        this.users = {
            fetch: async (id) => {
                if (this.usersMap.has(id)) {
                    return this.usersMap.get(id);
                }
                throw new Error('User not found');
            }
        };
        this.usersMap = new Map();
    }
    addUser(id, tag) {
        const u = new MockUser(id, tag);
        this.usersMap.set(id, u);
        return u;
    }
}

class MockInteraction {
    constructor(commandName, userId, userTag, options = {}) {
        this.commandName = commandName;
        this.user = { id: userId, tag: userTag };
        this._options = options;
        this.replies = [];
        this.deferred = false;
    }
    options = {
        getString: (name) => this._options[name] || null,
        getFocused: () => this._options.focused || ''
    };
    isAutocomplete() {
        return this._options.isAutocomplete || false;
    }
    isChatInputCommand() {
        return !this._options.isAutocomplete;
    }
    async reply(response) {
        this.replies.push(response);
        return response;
    }
    async deferReply(options) {
        this.deferred = true;
        return true;
    }
    async editReply(response) {
        this.replies.push(response);
        return response;
    }
    async respond(choices) {
        this.choices = choices;
        return true;
    }
}

class MockMessage {
    constructor(content, authorId, authorTag) {
        this.content = content;
        this.author = { id: authorId, tag: authorTag, bot: false };
        this.guild = null;
        this.replies = [];
    }
    async reply(content) {
        this.replies.push(content);
        return content;
    }
}

// Main test harness runner
async function runTests() {
    console.log('--- STARTING F1 BOT TEST HARNESS ---\n');
    backupFiles();

    try {
        // Prepare initial databases
        fs.writeFileSync(SUBSCRIPTIONS_FILE, JSON.stringify({ subscribers: ['12345'] }));
        fs.writeFileSync(REMINDERS_FILE, JSON.stringify({ sentRoundReminders: [] }));
        fs.writeFileSync(PREDICTIONS_FILE, JSON.stringify({}));
        fs.writeFileSync(LEADERBOARD_FILE, JSON.stringify({ processedRounds: [], users: {} }));
        fs.writeFileSync(DRIVERS_FILE, JSON.stringify({
            MRData: {
                DriverTable: {
                    Drivers: [
                        { driverId: 'verstappen', givenName: 'Max', familyName: 'Verstappen', code: 'VER' },
                        { driverId: 'hamilton', givenName: 'Lewis', familyName: 'Hamilton', code: 'HAM' },
                        { driverId: 'russell', givenName: 'George', familyName: 'Russell', code: 'RUS' }
                    ]
                }
            }
        }));
        fs.writeFileSync(INTERACTED_FILE, JSON.stringify({ users: ['12345', '67890'] })); // Prevent triggering welcome flow initially

        const client = new MockClient();
        const user = client.addUser('12345', 'Robin#1234');

        // ==========================================
        // 1. TIMING AND REMINDER TESTS
        // ==========================================
        console.log('1. Testing Database Migration and Subscriptions API...');
        
        // Trigger a read to run the migration
        const initialSubs = getSubscribersForType('weekend');
        assert.deepEqual(initialSubs, ['12345'], 'Migration should convert old array to settings object');
        
        const settings12345 = getUserSubscription('12345');
        assert.ok(settings12345, 'Settings for 12345 should exist');
        assert.equal(settings12345.weekend, true, 'Weekend setting should be true by default');
        assert.equal(settings12345.qualifying, false, 'Qualifying setting should be false by default');
        console.log('   - DB Migration: OK');

        console.log('\nTesting Race Reminder Scheduling (Friday morning)...');

        // CASE A: Race is far away (next weekend) -> Friday 9am is in the future.
        // Today is Sunday, July 5. Let's make the race next Sunday, July 12.
        // Friday of that week is July 10.
        // So Friday 9am is in the future. Reminder should NOT send.
        const timeFutureRace = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days in the future
        let mockSchedule = {
            MRData: {
                RaceTable: {
                    Races: [
                        { 
                            round: '1', 
                            raceName: 'Australian Grand Prix', 
                            date: timeFutureRace.toISOString().split('T')[0], 
                            time: timeFutureRace.toISOString().split('T')[1].split('.')[0] + 'Z',
                            Qualifying: {
                                date: new Date(timeFutureRace.getTime() - 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                                time: '05:00:00Z'
                            }
                        }
                    ]
                }
            }
        };
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));
        
        await checkUpcomingRaces(client);
        assert.equal(user.receivedMessages.length, 0, 'Weekend reminder should not send if Friday 9am is in the future');
        console.log('   - Future Friday timing window: OK');

        // CASE B: Race is soon (e.g. tomorrow) -> Friday 9am is in the past.
        // Since today is Sunday, Friday of this week is in the past. Reminder SHOULD send.
        const timeSoonRace = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours in the future
        mockSchedule.MRData.RaceTable.Races[0].date = timeSoonRace.toISOString().split('T')[0];
        mockSchedule.MRData.RaceTable.Races[0].time = timeSoonRace.toISOString().split('T')[1].split('.')[0] + 'Z';
        // Qualifying is also in the past relative to now, but let's place it far in past so it doesn't trigger qual reminder yet
        mockSchedule.MRData.RaceTable.Races[0].Qualifying = {
            date: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            time: '05:00:00Z'
        };
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));

        await checkUpcomingRaces(client);
        assert.equal(user.receivedMessages.length, 1, 'Weekend reminder should send if Friday 9am is in the past');
        assert.match(user.receivedMessages[0], /starts on/, 'Weekend reminder message must have correct text');
        
        let sentReminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')).sentRoundReminders;
        assert.ok(sentReminders.includes('1-weekend'), 'Weekend reminder should be recorded as sent in database');
        console.log('   - Past Friday timing window: OK');

        // CASE C: Duplicate Check -> Weekend reminder should NOT duplicate
        await checkUpcomingRaces(client);
        assert.equal(user.receivedMessages.length, 1, 'Duplicate weekend reminders should be blocked');
        console.log('   - Weekend duplicate block: OK');

        // CASE D: Qualifying 1h Reminder
        // Add a user who has opted in to qualifying
        saveUserSubscription('67890', { weekend: false, qualifying: true, sprint: false, race: false });
        const userQual = client.addUser('67890', 'QualUser#1234');

        // Position qualifying exactly 1 hour in the future (55 minutes)
        const timeQual = new Date(Date.now() + 55 * 60 * 1000);
        mockSchedule.MRData.RaceTable.Races[0].Qualifying = {
            date: timeQual.toISOString().split('T')[0],
            time: timeQual.toISOString().split('T')[1].split('.')[0] + 'Z'
        };
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));

        await checkUpcomingRaces(client);
        assert.equal(userQual.receivedMessages.length, 1, 'Qualifying reminder should send to opted-in users 1 hour before');
        assert.match(userQual.receivedMessages[0], /Qualifying.*starts in 1 hour/, 'Qualifying reminder content check');
        
        // User '12345' (not opted in to qualifying) should not receive it
        assert.equal(user.receivedMessages.length, 1, 'Qualifying reminder should not send to non-opted-in users');
        
        sentReminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')).sentRoundReminders;
        assert.ok(sentReminders.includes('1-qualifying'), 'Qualifying reminder should be recorded as sent in database');
        console.log('   - Qualifying 1h timing window and opt-in: OK');

        // CASE E: Sprint 1h Reminder
        saveUserSubscription('55555', { weekend: false, qualifying: false, sprint: true, race: false });
        const userSprint = client.addUser('55555', 'SprintUser#1234');

        const timeSprint = new Date(Date.now() + 55 * 60 * 1000);
        mockSchedule.MRData.RaceTable.Races[0].Sprint = {
            date: timeSprint.toISOString().split('T')[0],
            time: timeSprint.toISOString().split('T')[1].split('.')[0] + 'Z'
        };
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));

        await checkUpcomingRaces(client);
        assert.equal(userSprint.receivedMessages.length, 1, 'Sprint reminder should send to opted-in users');
        assert.match(userSprint.receivedMessages[0], /Sprint.*starts in 1 hour/, 'Sprint reminder content check');
        
        sentReminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')).sentRoundReminders;
        assert.ok(sentReminders.includes('1-sprint'), 'Sprint reminder should be recorded as sent in database');
        console.log('   - Sprint 1h timing window and opt-in: OK');

        // CASE F: Race 1h Reminder
        saveUserSubscription('77777', { weekend: false, qualifying: false, sprint: false, race: true });
        const userRace1h = client.addUser('77777', 'Race1hUser#1234');

        const timeRace1h = new Date(Date.now() + 55 * 60 * 1000);
        mockSchedule.MRData.RaceTable.Races[0].date = timeRace1h.toISOString().split('T')[0];
        mockSchedule.MRData.RaceTable.Races[0].time = timeRace1h.toISOString().split('T')[1].split('.')[0] + 'Z';
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));

        await checkUpcomingRaces(client);
        assert.equal(userRace1h.receivedMessages.length, 1, 'Race 1h reminder should send to opted-in users');
        assert.match(userRace1h.receivedMessages[0], /starts in 1 hour/, 'Race 1h reminder content check');
        
        sentReminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')).sentRoundReminders;
        assert.ok(sentReminders.includes('1-race'), 'Race 1h reminder should be recorded as sent in database');
        console.log('   - Race 1h timing window and opt-in: OK');

        // CASE G: Toggling Settings via Button Handler
        console.log('\nTesting UI Button Toggles...');
        class MockButtonInteraction {
            constructor(customId, userId, userTag) {
                this.customId = customId;
                this.user = { id: userId, tag: userTag };
                this.replies = [];
            }
            isButton() { return true; }
            async update(options) {
                this.replies.push(options);
                return options;
            }
        }

        const buttonHandler = require('../src/handlers/commands').handleButton;
        const interactionButton = new MockButtonInteraction('toggle_reminder_qualifying', '12345', 'Robin#1234');
        
        await buttonHandler(interactionButton);
        const updatedSettings = getUserSubscription('12345');
        assert.equal(updatedSettings.qualifying, true, 'Qualifying reminder should be toggled to true');
        console.log('   - Button toggle setting: OK');

        // ==========================================
        // 2. STANDINGS COMMANDS TESTS
        // ==========================================
        console.log('\n2. Testing Standings Commands...');

        // Slash command: /driverstandings
        let interaction = new MockInteraction('driverstandings', '12345', 'Robin#1234');
        await handleInteraction(interaction, client);
        assert.ok(interaction.deferred, 'Driver standings command must defer response');
        assert.match(interaction.replies[0].content, /Driver Championship Standings/, 'Should return driver standings content');
        console.log('   - Slash /driverstandings: OK');

        // Slash command: /teamstandings
        interaction = new MockInteraction('teamstandings', '12345', 'Robin#1234');
        await handleInteraction(interaction, client);
        assert.ok(interaction.deferred, 'Team standings command must defer response');
        assert.match(interaction.replies[0].content, /Team Championship Standings/, 'Should return team standings content');
        console.log('   - Slash /teamstandings: OK');

        // Text command: drivers
        let msg = new MockMessage('drivers', '12345', 'Robin#1234');
        await handleMessage(msg, client);
        assert.match(msg.replies[0], /Driver Championship Standings/, 'DM "drivers" command must return driver standings');
        console.log('   - DM "drivers": OK');

        // Text command: teams
        msg = new MockMessage('teams', '12345', 'Robin#1234');
        await handleMessage(msg, client);
        assert.match(msg.replies[0], /Team Championship Standings/, 'DM "teams" command must return team standings');
        console.log('   - DM "teams": OK');

        // ==========================================
        // 3. PREDICTIONS COMMANDS TESTS
        // ==========================================
        console.log('\n3. Testing Predictions Commands...');

        // Set race to 2 hours in the future (predictions are OPEN)
        const timeFuture = new Date(Date.now() + 2 * 60 * 60 * 1000);
        mockSchedule.MRData.RaceTable.Races[0].date = timeFuture.toISOString().split('T')[0];
        mockSchedule.MRData.RaceTable.Races[0].time = timeFuture.toISOString().split('T')[1].split('.')[0] + 'Z';
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));

        // Slash command: /predict
        interaction = new MockInteraction('predict', '12345', 'Robin#1234', { p1: 'verstappen', p2: 'hamilton', p3: 'russell' });
        await handleInteraction(interaction, client);
        assert.match(interaction.replies[0].content, /Prediction Saved/, 'Should save predictions successfully');

        const predictions = JSON.parse(fs.readFileSync(PREDICTIONS_FILE, 'utf8'));
        assert.equal(predictions['1']['12345'].p1, 'verstappen', 'P1 prediction should match saved file value');
        console.log('   - Slash /predict (successful): OK');

        // Slash command: /mypredictions
        interaction = new MockInteraction('mypredictions', '12345', 'Robin#1234');
        await handleInteraction(interaction, client);
        assert.match(interaction.replies[0].content, /Your Predictions/, 'Should print saved predictions');
        assert.match(interaction.replies[0].content, /Open \(editable until/, 'Should display open predictions status with CET/CEST limit');
        console.log('   - Slash /mypredictions: OK');

        // Text command: predict ver ham rus
        msg = new MockMessage('predict ver ham rus', '12345', 'Robin#1234');
        await handleMessage(msg, client);
        assert.match(msg.replies[0], /Prediction Saved/, 'Text command "predict" must save predictions');
        console.log('   - DM "predict ver ham rus": OK');

        // Text command: predict ver ver ham (invalid identical choices)
        msg = new MockMessage('predict ver ver ham', '12345', 'Robin#1234');
        await handleMessage(msg, client);
        assert.match(msg.replies[0], /predict three different drivers/, 'Should reject duplicates in podium predictions');
        console.log('   - DM predict identical inputs reject: OK');

        // Unit test the predictions lock logic helper directly
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const oneDayFuture = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const pastRace = { date: oneDayAgo.toISOString().split('T')[0], time: oneDayAgo.toISOString().split('T')[1].split('.')[0] + 'Z' };
        const futureRace = { date: oneDayFuture.toISOString().split('T')[0], time: oneDayFuture.toISOString().split('T')[1].split('.')[0] + 'Z' };
        assert.ok(isPredictionLocked(pastRace), 'Past race should be locked');
        assert.ok(!isPredictionLocked(futureRace), 'Future race should not be locked');
        console.log('   - Direct isPredictionLocked checking: OK');

        // ==========================================
        // 4. GENERAL AND INFO COMMANDS
        // ==========================================
        console.log('\n4. Testing General Commands...');

        // Slash command: /nextrace
        interaction = new MockInteraction('nextrace', '12345', 'Robin#1234');
        // Let's make sure there is an upcoming race
        mockSchedule.MRData.RaceTable.Races[0].date = timeFuture.toISOString().split('T')[0];
        mockSchedule.MRData.RaceTable.Races[0].time = timeFuture.toISOString().split('T')[1].split('.')[0] + 'Z';
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));
        
        await handleInteraction(interaction, client);
        assert.match(interaction.replies[0].content, /The next race is the .* on <t:/, 'Should print next race info with Discord timestamp');
        assert.match(interaction.replies[0].content, /at.*CET|CEST/, 'Should append local timezone formatted string');
        console.log('   - Slash /nextrace formatting: OK');

        // Slash command: /info
        interaction = new MockInteraction('info', '12345', 'Robin#1234');
        await handleInteraction(interaction, client);
        assert.match(interaction.replies[0].content, /\/driverstandings/, 'Info help text must contain standings commands description');
        console.log('   - Slash /info help text: OK');

        // Text command: help
        msg = new MockMessage('help', '12345', 'Robin#1234');
        await handleMessage(msg, client);
        assert.match(msg.replies[0], /teams/, 'Text help command must list standings commands');
        console.log('   - DM help command content: OK');

        console.log('\n✅ ALL TEST ASSERTIONS COMPLETED SUCCESSFULLY!');
    } catch (err) {
        console.error('\n❌ TEST HARNESS FAILED:', err);
    } finally {
        restoreFiles();
        console.log('\n--- CLEANUP COMPLETE (Databases Restored) ---');
    }
}

runTests();
