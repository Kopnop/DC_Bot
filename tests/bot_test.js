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
        console.log('1. Testing Race Reminder Scheduling...');

        // CASE A: Race is 25 hours away -> Reminder should NOT send
        const time25h = new Date(Date.now() + 25 * 60 * 60 * 1000 - 5000); // 24.99 hours
        let mockSchedule = {
            MRData: {
                RaceTable: {
                    Races: [
                        { round: '1', raceName: 'Australian Grand Prix', date: time25h.toISOString().split('T')[0], time: time25h.toISOString().split('T')[1].split('.')[0] + 'Z' }
                    ]
                }
            }
        };
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));
        
        await checkUpcomingRaces(client);
        assert.equal(user.receivedMessages.length, 0, 'Reminder should not send 25 hours before a race');
        console.log('   - 25h timing window: OK');

        // CASE B: Race is 24 hours away -> Reminder SHOULD send
        const time24h = new Date(Date.now() + 24 * 60 * 60 * 1000 - 5000); // 23.99 hours
        mockSchedule.MRData.RaceTable.Races[0].date = time24h.toISOString().split('T')[0];
        mockSchedule.MRData.RaceTable.Races[0].time = time24h.toISOString().split('T')[1].split('.')[0] + 'Z';
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));

        await checkUpcomingRaces(client);
        assert.equal(user.receivedMessages.length, 1, 'Reminder should send exactly 24 hours before a race');
        assert.match(user.receivedMessages[0], /starts in exactly 24 hours/, 'Reminder message must have correct text');
        
        const sentReminders = JSON.parse(fs.readFileSync(REMINDERS_FILE, 'utf8')).sentRoundReminders;
        assert.ok(sentReminders.includes('1'), 'Reminder should be recorded as sent in database');
        console.log('   - 24h timing window: OK');

        // CASE C: Duplicate Check -> Reminder should NOT duplicate
        await checkUpcomingRaces(client);
        assert.equal(user.receivedMessages.length, 1, 'Duplicate reminders should be blocked');
        console.log('   - Duplicate block: OK');

        // CASE D: Fallback at 23 hours (if never sent before)
        fs.writeFileSync(REMINDERS_FILE, JSON.stringify({ sentRoundReminders: [] })); // clear db
        const time23h = new Date(Date.now() + 23 * 60 * 60 * 1000 - 5000); // 22.99 hours
        mockSchedule.MRData.RaceTable.Races[0].date = time23h.toISOString().split('T')[0];
        mockSchedule.MRData.RaceTable.Races[0].time = time23h.toISOString().split('T')[1].split('.')[0] + 'Z';
        fs.writeFileSync(SCHEDULE_FILE, JSON.stringify(mockSchedule));

        await checkUpcomingRaces(client);
        assert.equal(user.receivedMessages.length, 2, 'Fallback reminder should trigger at 23 hours if never sent');
        console.log('   - 23h fallback window: OK');

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
        const pastRace = { date: '2026-06-14', time: '13:00:00Z' }; // In the past relative to 2026-06-15
        const futureRace = { date: '2026-06-28', time: '13:00:00Z' }; // In the future relative to 2026-06-15
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
