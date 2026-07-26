const fs = require('fs');
const path = require('path');

/**
 * Membersihkan file temporary di direktori tertentu jika usianya melebihi maxAgeMs
 */
function cleanDirectory(dirPath, maxAgeMs = 3600000) {
    if (!fs.existsSync(dirPath)) return 0;
    let deletedCount = 0;
    const now = Date.now();

    try {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
            // Hindari menghapus file tersembunyi/gitkeep
            if (file.startsWith('.')) continue;

            const filePath = path.join(dirPath, file);
            try {
                const stat = fs.statSync(filePath);
                if (stat.isFile() && (now - stat.mtimeMs > maxAgeMs)) {
                    fs.unlinkSync(filePath);
                    deletedCount++;
                }
            } catch (e) {
                // Silent catch per file
            }
        }
    } catch (e) {
        console.warn(`[TEMP CLEANUP] Gagal membaca direktori ${dirPath}:`, e.message);
    }
    return deletedCount;
}

/**
 * Inisialisasi interval pembersihan otomatis file temp gambar
 */
function initTempCleanupService(options = {}) {
    const {
        tempDirs = [],
        maxAgeMs = 60 * 60 * 1000, // 1 jam
        intervalMs = 30 * 60 * 1000, // 30 menit
    } = options;

    function runCleanup() {
        let totalDeleted = 0;
        for (const dir of tempDirs) {
            totalDeleted += cleanDirectory(dir, maxAgeMs);
        }
        if (totalDeleted > 0) {
            console.log(`[TEMP CLEANUP] Berhasil menghapus ${totalDeleted} file temporary usang.`);
        }
    }

    // Jalankan pembersihan awal saat startup
    runCleanup();

    // Set interval pembersihan berkala
    const timer = setInterval(runCleanup, intervalMs);
    if (timer.unref) timer.unref();

    return {
        runCleanup,
        stop() {
            clearInterval(timer);
        }
    };
}

module.exports = {
    cleanDirectory,
    initTempCleanupService,
};
