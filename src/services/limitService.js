function cleanUsername(username) {
    return String(username || '').replace(/^@/, '').trim();
}

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

    function defaultImageStatus(username, usageDate) {
        const limit = getDefaultImageLimit();
        return { username, usageDate, used: 0, limit, remaining: limit };
    }

    async function checkCommandLimit(username) {
        const today = getJakartaDateKey();
        const defaultLimit = getDefaultCommandLimit();
        try {
            const res = await limitRepo.getCommandLimit(username);
            if (res.rows.length === 0) {
                return { used: 0, limit: defaultLimit, remaining: defaultLimit };
            }

            const row = res.rows[0];
            if (row.usage_date !== today) {
                await limitRepo.upsertCommandLimit({
                    username,
                    usageDate: today,
                    usedCount: 0,
                    extraLimit: 0,
                });
                return { used: 0, limit: defaultLimit, remaining: defaultLimit };
            }

            const totalLimit = defaultLimit + Number(row.extra_limit || 0);
            const used = Number(row.used_count || 0);
            return { used, limit: totalLimit, remaining: Math.max(0, totalLimit - used) };
        } catch (e) {
            handleError(e, { scope: 'CMD LIMIT', stats, logEmitter });
            return defaultCommandStatus();
        }
    }

    async function incrementCommandUsage(username) {
        const today = getJakartaDateKey();
        try {
            await limitRepo.incrementCommandUsage(username, today);
        } catch (e) {
            handleError(e, { scope: 'CMD LIMIT', detail: 'increment usage', stats, logEmitter });
        }
    }

    async function getImageLimitStatus(username) {
        const usernameClean = cleanUsername(username);
        const today = getJakartaDateKey();
        const defaultLimit = getDefaultImageLimit();

        if (!usernameClean || !isDatabaseEnabled()) {
            return defaultImageStatus(usernameClean, today);
        }

        const result = await limitRepo.getImageLimit(usernameClean);
        if (result.rows.length === 0) {
            await limitRepo.createImageLimit(usernameClean, today, defaultLimit);
            return defaultImageStatus(usernameClean, today);
        }

        const row = result.rows[0];
        const limit = Number(row.daily_limit ?? defaultLimit);
        let used = Number(row.used_count || 0);
        let usageDate = row.usage_date || today;

        if (usageDate !== today) {
            used = 0;
            usageDate = today;
            await limitRepo.resetImageLimitUsage(usernameClean, today);
        }

        return { username: usernameClean, usageDate, used, limit, remaining: Math.max(0, limit - used) };
    }

    async function incrementImageLimitUsage(username) {
        const status = await getImageLimitStatus(username);
        const nextUsed = status.used + 1;
        await limitRepo.upsertImageLimitUsage({
            username: status.username,
            usageDate: status.usageDate,
            usedCount: nextUsed,
            dailyLimit: status.limit,
        });
        return { ...status, used: nextUsed, remaining: Math.max(0, status.limit - nextUsed) };
    }

    return {
        checkCommandLimit,
        incrementCommandUsage,
        getImageLimitStatus,
        incrementImageLimitUsage,
    };
}

module.exports = {
    createLimitService,
};
