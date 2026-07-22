/**
 * Streak & Gamification Service
 * Mengelola kalkulasi streak harian kuis, penggandaan XP, dan logika reset absensi.
 */

function createStreakService({ streakRepo, userRepo }) {
    function calculateStreakXpMultiplier(streak) {
        if (streak >= 30) return 2.0; // 100% bonus XP
        if (streak >= 14) return 1.5; // 50% bonus XP
        if (streak >= 7) return 1.25; // 25% bonus XP
        if (streak >= 3) return 1.1; // 10% bonus XP
        return 1.0;
    }

    async function processQuizWinStreak(userId, username) {
        const today = new Date().toISOString().split('T')[0];
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
            const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
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
