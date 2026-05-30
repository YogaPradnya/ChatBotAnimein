function createStatsRepo(db) {
    async function countTable(tableName) {
        const allowedTables = new Set([
            'chat_logs',
            'laporan',
            'quiz_pool',
            'response_cache',
            'command_limits',
            'image_limits',
        ]);
        if (!allowedTables.has(tableName)) {
            throw new Error(`Table tidak diizinkan untuk count: ${tableName}`);
        }
        return db.execute(`SELECT COUNT(*) as count FROM ${tableName}`);
    }

    async function getDashboardCounts() {
        const [logsCount, laporanCount, quizCount] = await Promise.all([
            countTable('chat_logs'),
            countTable('laporan'),
            countTable('quiz_pool'),
        ]);

        return {
            totalDBLogs: logsCount.rows[0].count,
            totalReports: laporanCount.rows[0].count,
            totalDBKuis: quizCount.rows[0].count,
        };
    }

    async function getLimitUserCounts() {
        const [commandUsers, imageUsers] = await Promise.all([
            db.execute('SELECT COUNT(*) as total FROM command_limits'),
            db.execute('SELECT COUNT(*) as total FROM image_limits'),
        ]);

        return {
            commandUsers: Number(commandUsers.rows[0]?.total || 0),
            imageUsers: Number(imageUsers.rows[0]?.total || 0),
        };
    }

    return {
        countTable,
        getDashboardCounts,
        getLimitUserCounts,
    };
}

module.exports = {
    createStatsRepo,
};
