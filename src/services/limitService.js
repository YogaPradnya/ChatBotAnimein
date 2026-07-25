function createLimitService({
    limitRepo,
    getJakartaDateKey,
    getDefaultCommandLimit,
    getDefaultImageLimit,
    isDatabaseEnabled,
    handleError,
    stats,
    logEmitter,
}) {
    function defaultCommandStatus() {
        const limit = getDefaultCommandLimit();
        return { used: 0, limit, remaining: limit };
    }

    function defaultImageStatus(userId, username, usageDate) {
        const limit = getDefaultImageLimit();
        return { userId, username, usageDate, used: 0, limit, remaining: limit };
    }

    async function checkCommandLimit(userId, username) {
        const today = getJakartaDateKey();
        const defaultLimit = getDefaultCommandLimit();
        try {
            const res = await limitRepo.getCommandLimit(userId);
            if (res.rows.length === 0) {
                return { used: 0, limit: defaultLimit, remaining: defaultLimit };
            }

            const row = res.rows[0];
            const extraLimit = Number(row.extra_limit || 0);
            if (row.usage_date !== today) {
                await limitRepo.upsertCommandLimit({
                    userId,
                    username,
                    usageDate: today,
                    usedCount: 0,
                    extraLimit,
                });
                const totalLimit = defaultLimit + extraLimit;
                return { used: 0, limit: totalLimit, remaining: totalLimit };
            }

            const totalLimit = defaultLimit + extraLimit;
            const used = Number(row.used_count || 0);
            return { used, limit: totalLimit, remaining: Math.max(0, totalLimit - used) };
        } catch (e) {
            handleError(e, { scope: 'CMD LIMIT', stats, logEmitter });
            return defaultCommandStatus();
        }
    }

    async function incrementCommandUsage(userId, username) {
        const today = getJakartaDateKey();
        try {
            await limitRepo.incrementCommandUsage(userId, username, today);
        } catch (e) {
            handleError(e, { scope: 'CMD LIMIT', detail: 'increment usage', stats, logEmitter });
        }
    }

    async function getImageLimitStatus(userId, username) {
        const usernameClean = String(username || '').replace(/^@/, '').trim();
        const userIdStr = String(userId || '');
        const today = getJakartaDateKey();
        const defaultLimit = getDefaultImageLimit();

        if (!userIdStr || !isDatabaseEnabled()) {
            return defaultImageStatus(userIdStr, usernameClean, today);
        }

        const result = await limitRepo.getImageLimit(userIdStr);
        if (result.rows.length === 0) {
            await limitRepo.createImageLimit(userIdStr, usernameClean, today, defaultLimit);
            return defaultImageStatus(userIdStr, usernameClean, today);
        }

        const row = result.rows[0];
        const storedLimit = Number(row.daily_limit ?? defaultLimit);
        const limit = Math.max(defaultLimit, storedLimit);
        let used = Number(row.used_count || 0);
        let usageDate = row.usage_date || today;

        if (usageDate !== today) {
            used = 0;
            usageDate = today;
            await limitRepo.resetImageLimitUsage(userIdStr, today);
        }

        return { userId: userIdStr, username: usernameClean, usageDate, used, limit, remaining: Math.max(0, limit - used) };
    }

    async function incrementImageLimitUsage(userId, username) {
        const status = await getImageLimitStatus(userId, username);
        const nextUsed = status.used + 1;
        await limitRepo.upsertImageLimitUsage({
            userId: status.userId,
            username: status.username,
            usageDate: status.usageDate,
            usedCount: nextUsed,
            dailyLimit: status.limit,
        });
        return { ...status, used: nextUsed, remaining: Math.max(0, status.limit - nextUsed) };
    }

    const RARA_CHAT_DAILY_LIMIT = 20;

    async function checkRaraChatLimit(userId, username) {
        const today = getJakartaDateKey();
        const defaultLimit = RARA_CHAT_DAILY_LIMIT;
        try {
            const res = await limitRepo.getRaraChatLimit(userId);
            if (!res || res.rows.length === 0) {
                return { used: 0, limit: defaultLimit, remaining: defaultLimit };
            }

            const row = res.rows[0];
            const extraLimit = Number(row.extra_limit || 0);
            if (row.usage_date !== today) {
                await limitRepo.upsertRaraChatLimit({
                    userId,
                    username,
                    usageDate: today,
                    usedCount: 0,
                    extraLimit,
                });
                const totalLimit = defaultLimit + extraLimit;
                return { used: 0, limit: totalLimit, remaining: totalLimit };
            }

            const totalLimit = defaultLimit + extraLimit;
            const used = Number(row.used_count || 0);
            return { used, limit: totalLimit, remaining: Math.max(0, totalLimit - used) };
        } catch (e) {
            handleError(e, { scope: 'RARA CHAT LIMIT', stats, logEmitter });
            return { used: 0, limit: RARA_CHAT_DAILY_LIMIT, remaining: RARA_CHAT_DAILY_LIMIT };
        }
    }

    async function incrementRaraChatLimitUsage(userId, username) {
        const today = getJakartaDateKey();
        try {
            await limitRepo.incrementRaraChatLimitUsage(userId, username, today);
        } catch (e) {
            handleError(e, { scope: 'RARA CHAT LIMIT', detail: 'increment usage', stats, logEmitter });
        }
    }

    return {
        checkCommandLimit,
        incrementCommandUsage,
        getImageLimitStatus,
        incrementImageLimitUsage,
        checkRaraChatLimit,
        incrementRaraChatLimitUsage,
    };
}

module.exports = {
    createLimitService,
};
