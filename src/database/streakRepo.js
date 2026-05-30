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
        getUserStreak(username) {
            return db.execute({
                sql: "SELECT current_streak, best_streak, last_active_date FROM user_quiz_stats WHERE username = ?",
                args: [username],
            });
        },

        createInitialStreak(username, today) {
            return db.execute({
                sql: "INSERT INTO user_quiz_stats (username, current_streak, best_streak, last_active_date) VALUES (?, 1, 1, ?)",
                args: [username, today],
            });
        },

        updateUserStreak(username, currentStreak, bestStreak, today) {
            return db.execute({
                sql: "UPDATE user_quiz_stats SET current_streak = ?, best_streak = ?, last_active_date = ? WHERE username = ?",
                args: [currentStreak, bestStreak, today, username],
            });
        },

        incrementQuizStat(username, field, amount = 1) {
            if (!allowedQuizStatFields.has(field)) {
                throw new Error(`Invalid quiz stat field: ${field}`);
            }
            return db.execute({
                sql: `INSERT INTO user_quiz_stats (username, ${field}) VALUES (?, ?)
                      ON CONFLICT(username) DO UPDATE SET ${field} = ${field} + ?`,
                args: [username, amount, amount],
            });
        },

        incrementImageRequest(username) {
            return db.execute({
                sql: `INSERT INTO user_quiz_stats (username, total_images) VALUES (?, 1)
                      ON CONFLICT(username) DO UPDATE SET total_images = total_images + 1`,
                args: [username],
            });
        },
    };
}

module.exports = { createStreakRepo };
