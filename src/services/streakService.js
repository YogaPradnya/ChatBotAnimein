/**
 * Streak & Gamification Service
 * Mengelola kalkulasi streak harian kuis, penggandaan XP, dan logika reset absensi.
 */

const { getJakartaDateKey } = require('../utils');

function createStreakService({ streakRepo, userRepo }) {
    function calculateStreakXpMultiplier(streak) {
        if (streak >= 60) return 3.0; // 200% bonus XP
        if (streak >= 30) return 2.5; // 150% bonus XP
        if (streak >= 15) return 2.0; // 100% bonus XP
        if (streak >= 10) return 1.5; // 50% bonus XP
        if (streak >= 5) return 1.25; // 25% bonus XP
        return 1.0;
    }

    async function processQuizWinStreak(userId, username) {
        const today = getJakartaDateKey();
        let userStats = { current_streak: 0, best_streak: 0, last_active_date: null };

        if (streakRepo && streakRepo.getUserQuizStats) {
            const result = await streakRepo.getUserQuizStats(userId);
            if (result && result.rows && result.rows.length > 0) {
                userStats = result.rows[0];
            }
        }

        const lastActive = userStats.last_active_date;
        let newStreak = userStats.current_streak || 0;

        if (!lastActive) {
            newStreak = 1;
        } else if (lastActive === today) {
            // Sudah aktif hari ini, streak tetap sama
        } else {
            // Kemarin dalam zona Jakarta (hindari UTC split yang geser hari).
            const yesterday = getJakartaDateKey(new Date(Date.now() - 86400000));
            if (lastActive === yesterday) {
                newStreak += 1;
            } else {
                // Absen lebih dari 1 hari, reset streak ke 1
                newStreak = 1;
            }
        }

        const bestStreak = Math.max(newStreak, userStats.best_streak || 0);

        if (streakRepo && streakRepo.updateUserQuizStreak) {
            await streakRepo.updateUserQuizStreak({
                userId,
                username,
                currentStreak: newStreak,
                bestStreak,
                lastActiveDate: today,
            });
        }

        const xpMultiplier = calculateStreakXpMultiplier(newStreak);

        return {
            currentStreak: newStreak,
            bestStreak,
            xpMultiplier,
            isNewDay: lastActive !== today,
        };
    }

    return {
        calculateStreakXpMultiplier,
        processQuizWinStreak,
    };
}

module.exports = {
    createStreakService,
};
