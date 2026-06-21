function createStreakRepo(db) {
    const allowedQuizStatFields = new Set([
        'wins',
        'participations',
        'total_hints_used',
        'total_images',
        'current_streak',
        'best_streak',
    ]);

    return {
        getUserStreak(userId) {
            return db.execute({
                sql: "SELECT current_streak, best_streak, last_active_date FROM user_quiz_stats WHERE user_id = ?",
                args: [userId],
            });
        },

        createInitialStreak(userId, username, today) {
            return db.execute({
                sql: "INSERT INTO user_quiz_stats (user_id, username, current_streak, best_streak, last_active_date) VALUES (?, ?, 1, 1, ?)",
                args: [userId, username, today],
            });
        },

        updateUserStreak(userId, currentStreak, bestStreak, today) {
            return db.execute({
                sql: "UPDATE user_quiz_stats SET current_streak = ?, best_streak = ?, last_active_date = ? WHERE user_id = ?",
                args: [currentStreak, bestStreak, today, userId],
            });
        },

        incrementQuizStat(userId, username, field, amount = 1) {
            if (!allowedQuizStatFields.has(field)) {
                throw new Error(`Invalid quiz stat field: ${field}`);
            }
            return db.execute({
                sql: `INSERT INTO user_quiz_stats (user_id, username, ${field}) VALUES (?, ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET ${field} = ${field} + ?, username = ?`,
                args: [userId, username, amount, amount, username],
            });
        },

        incrementImageRequest(userId, username) {
            return db.execute({
                sql: `INSERT INTO user_quiz_stats (user_id, username, total_images) VALUES (?, ?, 1)
                      ON CONFLICT(user_id) DO UPDATE SET total_images = total_images + 1, username = ?`,
                args: [userId, username, username],
            });
        },
    };
}

module.exports = { createStreakRepo };
