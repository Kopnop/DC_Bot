const { DRIVER_MAPPING } = require('./config');

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

function formatToCET(date) {
    const options = {
        timeZone: 'Europe/Berlin',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    };
    const formatter = new Intl.DateTimeFormat('de-DE', options);
    const dateParts = formatter.formatToParts(date);
    const day = dateParts.find(p => p.type === 'day').value;
    const month = dateParts.find(p => p.type === 'month').value;
    const year = dateParts.find(p => p.type === 'year').value;
    const hour = dateParts.find(p => p.type === 'hour').value;
    const minute = dateParts.find(p => p.type === 'minute').value;
    
    const tzString = date.toLocaleString('en-US', { timeZone: 'Europe/Berlin', timeZoneName: 'short' });
    let tz = 'CET';
    if (tzString.includes('GMT+2') || tzString.includes('GMT+02') || tzString.includes('CEST')) {
        tz = 'CEST';
    } else if (tzString.includes('GMT+1') || tzString.includes('GMT+01') || tzString.includes('CET')) {
        tz = 'CET';
    }
    return `${day}.${month}.${year} at ${hour}:${minute} ${tz}`;
}

module.exports = {
    normalizeDriverName,
    formatToCET
};
