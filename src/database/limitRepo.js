function createLimitRepo(db) {
    async function getCommandLimit(userId) {
        return db.execute({
            sql: 'SELECT usage_date, used_count, extra_limit FROM command_limits WHERE user_id = ?',
            args: [userId],
        });
    }

    async function upsertCommandLimit({ userId, username, usageDate, usedCount, extraLimit }) {
        return db.execute({
            sql: `INSERT INTO command_limits (user_id, username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET
                  username = excluded.username,
                  usage_date = excluded.usage_date,
                  used_count = excluded.used_count,
                  extra_limit = excluded.extra_limit,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [userId, username, usageDate, usedCount, extraLimit],
        });
    }

    async function addCommandExtraLimit(userId, username, usageDate, amount) {
        return db.execute({
            sql: `INSERT INTO command_limits (user_id, username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, ?, 0, ?)
                  ON CONFLICT(user_id) DO UPDATE SET
                  used_count = CASE WHEN usage_date = ? THEN used_count ELSE 0 END,
                  extra_limit = extra_limit + ?,
                  usage_date = ?,
                  username = ?,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [userId, username, usageDate, amount, usageDate, amount, usageDate, username],
        });
    }

    async function addImageExtraLimit(userId, username, usageDate, dailyLimit, amount) {
        return db.execute({
            sql: `INSERT INTO image_limits (user_id, username, usage_date, used_count, daily_limit)
                  VALUES (?, ?, ?, 0, ?)
                  ON CONFLICT(user_id) DO UPDATE SET daily_limit = daily_limit + ?, username = ?`,
            args: [userId, username, usageDate, dailyLimit + amount, amount, username],
        });
    }

    async function incrementCommandUsage(userId, username, usageDate) {
        return db.execute({
            sql: `INSERT INTO command_limits (user_id, username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, ?, 1, 0)
                  ON CONFLICT(user_id) DO UPDATE SET
                  used_count = CASE WHEN usage_date = ? THEN used_count + 1 ELSE 1 END,
                  extra_limit = extra_limit,
                  usage_date = ?,
                  username = ?,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [userId, username, usageDate, usageDate, usageDate, username],
        });
    }

    async function getImageLimit(userId) {
        return db.execute({
            sql: 'SELECT user_id, username, usage_date, used_count, daily_limit FROM image_limits WHERE user_id = ?',
            args: [userId],
        });
    }

    async function createImageLimit(userId, username, usageDate, dailyLimit) {
        return db.execute({
            sql: 'INSERT INTO image_limits (user_id, username, usage_date, used_count, daily_limit) VALUES (?, ?, ?, 0, ?)',
            args: [userId, username, usageDate, dailyLimit],
        });
    }

    async function resetImageLimitUsage(userId, usageDate) {
        return db.execute({
            sql: 'UPDATE image_limits SET usage_date = ?, used_count = 0, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?',
            args: [usageDate, userId],
        });
    }

    async function upsertImageLimitUsage({ userId, username, usageDate, usedCount, dailyLimit }) {
        return db.execute({
            sql: `INSERT INTO image_limits (user_id, username, usage_date, used_count, daily_limit, updated_at)
                  VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(user_id) DO UPDATE SET
                  username = ?,
                  usage_date = ?,
                  used_count = ?,
                  daily_limit = ?,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [userId, username, usageDate, usedCount, dailyLimit, username, usageDate, usedCount, dailyLimit],
        });
    }

    async function getRaraChatLimit(userId) {
        return db.execute({
            sql: 'SELECT usage_date, used_count, extra_limit FROM rara_chat_limits WHERE user_id = ?',
            args: [userId],
        });
    }

    async function upsertRaraChatLimit({ userId, username, usageDate, usedCount, extraLimit }) {
        return db.execute({
            sql: `INSERT INTO rara_chat_limits (user_id, username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET
                  username = excluded.username,
                  usage_date = excluded.usage_date,
                  used_count = excluded.used_count,
                  extra_limit = excluded.extra_limit,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [userId, username, usageDate, usedCount, extraLimit],
        });
    }

    async function incrementRaraChatLimitUsage(userId, username, usageDate) {
        return db.execute({
            sql: `INSERT INTO rara_chat_limits (user_id, username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, ?, 1, 0)
                  ON CONFLICT(user_id) DO UPDATE SET
                  used_count = CASE WHEN usage_date = ? THEN used_count + 1 ELSE 1 END,
                  extra_limit = extra_limit,
                  usage_date = ?,
                  username = ?,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [userId, username, usageDate, usageDate, usageDate, username],
        });
    }

    async function addRaraChatExtraLimit(userId, username, usageDate, amount) {
        return db.execute({
            sql: `INSERT INTO rara_chat_limits (user_id, username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, ?, 0, ?)
                  ON CONFLICT(user_id) DO UPDATE SET
                  used_count = CASE WHEN usage_date = ? THEN used_count ELSE 0 END,
                  extra_limit = extra_limit + ?,
                  usage_date = ?,
                  username = ?,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [userId, username, usageDate, amount, usageDate, amount, usageDate, username],
        });
    }

    return {
        getCommandLimit,
        upsertCommandLimit,
        incrementCommandUsage,
        getImageLimit,
        createImageLimit,
        resetImageLimitUsage,
        upsertImageLimitUsage,
        addCommandExtraLimit,
        addImageExtraLimit,
        getRaraChatLimit,
        upsertRaraChatLimit,
        incrementRaraChatLimitUsage,
        addRaraChatExtraLimit,
    };
}

module.exports = {
    createLimitRepo,
};
