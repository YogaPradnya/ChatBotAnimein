function createLimitRepo(db) {
    async function getCommandLimit(username) {
        return db.execute({
            sql: 'SELECT usage_date, used_count, extra_limit FROM command_limits WHERE username = ?',
            args: [username],
        });
    }

    async function upsertCommandLimit({ username, usageDate, usedCount, extraLimit }) {
        return db.execute({
            sql: `INSERT INTO command_limits (username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(username) DO UPDATE SET
                  usage_date = excluded.usage_date,
                  used_count = excluded.used_count,
                  extra_limit = excluded.extra_limit,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [username, usageDate, usedCount, extraLimit],
        });
    }

    async function addCommandExtraLimit(username, usageDate, amount) {
        return db.execute({
            sql: `INSERT INTO command_limits (username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, 0, ?)
                  ON CONFLICT(username) DO UPDATE SET
                  extra_limit = CASE WHEN usage_date = ? THEN extra_limit + ? ELSE ? END,
                  usage_date = CASE WHEN usage_date = ? THEN usage_date ELSE ? END`,
            args: [username, usageDate, amount, usageDate, amount, amount, usageDate, usageDate],
        });
    }

    async function addImageExtraLimit(username, usageDate, dailyLimit, amount) {
        return db.execute({
            sql: `INSERT INTO image_limits (username, usage_date, used_count, daily_limit)
                  VALUES (?, ?, 0, ?)
                  ON CONFLICT(username) DO UPDATE SET daily_limit = daily_limit + ?`,
            args: [username, usageDate, dailyLimit + amount, amount],
        });
    }

    async function incrementCommandUsage(username, usageDate) {
        return db.execute({
            sql: `INSERT INTO command_limits (username, usage_date, used_count, extra_limit)
                  VALUES (?, ?, 1, 0)
                  ON CONFLICT(username) DO UPDATE SET
                  used_count = CASE WHEN usage_date = ? THEN used_count + 1 ELSE 1 END,
                  extra_limit = CASE WHEN usage_date = ? THEN extra_limit ELSE 0 END,
                  usage_date = ?,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [username, usageDate, usageDate, usageDate, usageDate],
        });
    }

    async function getImageLimit(username) {
        return db.execute({
            sql: 'SELECT username, usage_date, used_count, daily_limit FROM image_limits WHERE username = ?',
            args: [username],
        });
    }

    async function createImageLimit(username, usageDate, dailyLimit) {
        return db.execute({
            sql: 'INSERT INTO image_limits (username, usage_date, used_count, daily_limit) VALUES (?, ?, 0, ?)',
            args: [username, usageDate, dailyLimit],
        });
    }

    async function resetImageLimitUsage(username, usageDate) {
        return db.execute({
            sql: 'UPDATE image_limits SET usage_date = ?, used_count = 0, updated_at = CURRENT_TIMESTAMP WHERE username = ?',
            args: [usageDate, username],
        });
    }

    async function upsertImageLimitUsage({ username, usageDate, usedCount, dailyLimit }) {
        return db.execute({
            sql: `INSERT INTO image_limits (username, usage_date, used_count, daily_limit, updated_at)
                  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(username) DO UPDATE SET
                  usage_date = ?,
                  used_count = ?,
                  daily_limit = ?,
                  updated_at = CURRENT_TIMESTAMP`,
            args: [username, usageDate, usedCount, dailyLimit, usageDate, usedCount, dailyLimit],
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
    };
}

module.exports = {
    createLimitRepo,
};
