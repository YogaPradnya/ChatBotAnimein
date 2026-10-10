function createStreakRepo(db) {
    const allowedQuizStatFields = new Set([
        'wins',
        'participations',
        'total_hints_used',
        'total_images',
        'current_streak',
        'best_streak',
    ]);

    function getUserStreak(userId) {
        return db.execute({
            sql: "SELECT current_streak, best_streak, last_active_date FROM user_quiz_stats WHERE user_id = ?",
            args: [userId],
        });
    }

    function updateUserStreak(userId, currentStreak, bestStreak, today) {
        return db.execute({
            sql: "UPDATE user_quiz_stats SET current_streak = ?, best_streak = ?, last_active_date = ? WHERE user_id = ?",
            args: [currentStreak, bestStreak, today, userId],
        });
    }

    return {
        getUserStreak,

        createInitialStreak(userId, username, today) {
            // INSERT OR IGNORE atomik: duplikat PK saat konkuren tidak throw.
            return db.execute({
                sql: "INSERT OR IGNORE INTO user_quiz_stats (user_id, username, current_streak, best_streak, last_active_date) VALUES (?, ?, 1, 1, ?)",
                args: [userId, username, today],
            });
        },

        updateUserStreak,

        getUserQuizStats(userId) {
            return getUserStreak(userId);
        },

        updateUserQuizStreak({ userId, username, currentStreak, bestStreak, lastActiveDate }) {
            if (username !== undefined && username !== null && username !== '') {
                return db.execute({
                    sql: "UPDATE user_quiz_stats SET username = ?, current_streak = ?, best_streak = ?, last_active_date = ? WHERE user_id = ?",
                    args: [username, currentStreak, bestStreak, lastActiveDate, userId],
                });
            }
            return updateUserStreak(userId, currentStreak, bestStreak, lastActiveDate);
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
