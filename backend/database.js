const Database = require("better-sqlite3");
const path = require("path");

const db = new Database(path.join(__dirname, "guessgold.db"));

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        email TEXT NOT NULL UNIQUE,
        password TEXT NOT NULL,
        points INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS games (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        target_number INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        won INTEGER NOT NULL DEFAULT 0,
        points_earned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        points_required INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS redeemed_rewards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        reward_id INTEGER NOT NULL,
        points_spent INTEGER NOT NULL,
        redeemed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id)
            ON DELETE CASCADE,
        FOREIGN KEY (reward_id) REFERENCES rewards(id)
    );
`);

const rewardCount = db.prepare(
    "SELECT COUNT(*) AS count FROM rewards"
).get().count;

if (rewardCount === 0) {
    const insertReward = db.prepare(`
        INSERT INTO rewards (name, description, points_required)
        VALUES (?, ?, ?)
    `);

    const insertRewards = db.transaction(() => {
        insertReward.run(
            "Bronze Champion",
            "Unlock the Bronze Champion achievement.",
            100
        );

        insertReward.run(
            "Silver Champion",
            "Unlock the Silver Champion achievement.",
            250
        );

        insertReward.run(
            "Gold Champion",
            "Unlock the Gold Champion achievement.",
            500
        );
    });

    insertRewards();
}

module.exports = db;