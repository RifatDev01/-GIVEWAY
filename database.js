const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

// Initialize database with default structure if it doesn't exist
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ users: [], settings: { giveaway_status: 'active' } }, null, 2));
} else {
    // Ensure giveaway_status exists in existing DB
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    if (!db.settings.giveaway_status) {
        db.settings.giveaway_status = 'active';
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    }
}

function readDB() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function writeDB(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

module.exports = {
    getUser: (id) => {
        const db = readDB();
        return db.users.find(u => u.telegram_id === id);
    },
    createUser: (id, username, referredBy) => {
        const db = readDB();
        if (db.users.find(u => u.telegram_id === id)) return;
        db.users.push({
            telegram_id: id,
            username: username,
            referral_count: 0,
            referred_by: referredBy,
            is_participant: 0,
            referral_claimed: 0
        });
        writeDB(db);
    },
    setParticipant: (id) => {
        const db = readDB();
        const user = db.users.find(u => u.telegram_id === id);
        if (user) {
            user.is_participant = 1;
            writeDB(db);
        }
    },
    claimReferral: (id) => {
        const db = readDB();
        const user = db.users.find(u => u.telegram_id === id);
        // Remove is_participant check so it counts as soon as they join
        if (user && !user.referral_claimed && user.referred_by) {
            const referrer = db.users.find(u => u.telegram_id === user.referred_by);
            if (referrer) {
                referrer.referral_count += 1;
                user.referral_claimed = 1;
                writeDB(db);
                return referrer;
            }
        }
        return null;
    },
    removeReferral: (id) => {
        const db = readDB();
        const user = db.users.find(u => u.telegram_id === id);
        if (user && user.referral_claimed && user.referred_by) {
            const referrer = db.users.find(u => u.telegram_id === user.referred_by);
            if (referrer) {
                referrer.referral_count = Math.max(0, referrer.referral_count - 1);
                user.referral_claimed = 0;
                writeDB(db);
                return referrer;
            }
        }
        return null;
    },
    getTopReferrers: (limit = 10) => {
        const db = readDB();
        return [...db.users]
            // Show anyone who has at least 1 referral OR is a participant
            .filter(u => u.is_participant || u.referral_count > 0)
            .sort((a, b) => b.referral_count - a.referral_count)
            .slice(0, limit);
    },
    manualAddReferral: (id, amount) => {
        const db = readDB();
        const user = db.users.find(u => u.telegram_id === id);
        if (user) {
            user.referral_count += amount;
            writeDB(db);
            return user;
        }
        return null;
    },
    setSetting: (key, value) => {
        const db = readDB();
        db.settings[key] = value;
        writeDB(db);
    },
    getSetting: (key) => {
        const db = readDB();
        return db.settings[key] || null;
    }
};
