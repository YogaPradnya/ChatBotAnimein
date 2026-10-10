const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

/**
 * Membersihkan file temporary di direktori tertentu jika usianya melebihi maxAgeMs
 * Versi async (non-blocking) memakai fs/promises + Promise.all.
 * Versi sync lama dipertahankan sebagai wrapper kompatibilitas (deprecated).
 */
async function cleanDirectoryAsync(dirPath, maxAgeMs = 3600000) {
    try {
        await fsp.access(dirPath);
    } catch (_) {
        return 0;
    }
    const now = Date.now();
    let deletedCount = 0;

    let files;
    try {
        files = await fsp.readdir(dirPath);
    } catch (e) {
        console.warn(`[TEMP CLEANUP] Gagal membaca direktori ${dirPath}:`, e.message);
        return 0;
    }

    const targets = files.filter((file) => !file.startsWith('.'));
    const results = await Promise.all(targets.map(async (file) => {
        const filePath = path.join(dirPath, file);
        try {
            const stat = await fsp.stat(filePath);
            if (stat.isFile() && (now - stat.mtimeMs > maxAgeMs)) {
                await fsp.unlink(filePath);
                return 1;
            }
        } catch (_) {
            // Silent catch per file
        }
        return 0;
    }));
    deletedCount = results.reduce((a, b) => a + b, 0);
    return deletedCount;
}

// Kompatibilitas: panggil versi sync lama hanya bila benar-benar dibutuhkan.
// NOTE: hindari di hot path; pakai cleanDirectoryAsync.
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

    async function runCleanup() {
        const results = await Promise.all(
            tempDirs.map((dir) => cleanDirectoryAsync(dir, maxAgeMs)),
        );
        const totalDeleted = results.reduce((a, b) => a + b, 0);
        if (totalDeleted > 0) {
            console.log(`[TEMP CLEANUP] Berhasil menghapus ${totalDeleted} file temporary usang.`);
        }
        return totalDeleted;
    }

    // Jalankan pembersihan awal saat startup (async, non-blocking)
    runCleanup().catch((e) => console.warn('[TEMP CLEANUP] Cleanup awal gagal:', e.message));

    // Set interval pembersihan berkala
    const timer = setInterval(() => {
        runCleanup().catch((e) => console.warn('[TEMP CLEANUP] Cleanup berkala gagal:', e.message));
    }, intervalMs);
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
    cleanDirectoryAsync,
    initTempCleanupService,
};
