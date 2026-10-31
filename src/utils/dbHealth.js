// Kesehatan DB bersama: circuit breaker + throttle log.
// Dipakai agar SATU outage sqld tidak membanjiri Realtime Logs dengan
// ratusan baris WARN yang sama (insiden 31 Okt: tiap query log 1 baris).
//
// - patchDbWithTimeout (withTimeout.js) memanggil recordDbSuccess/Failure
//   untuk SETIAP query -> sinyal otomatis tanpa ubah tiap repo.
// - Tulis non-kritis (streak, image stats, notif cache) cek isDbCircuitOpen()
//   dan jeda saat circuit OPEN (XP flush & limit tetap jalan: kritis).
// - warnThrottled(label, msg): maksimal 1 baris per 60 detik per label.
const CIRCUIT_FAIL_THRESHOLD = 5; // 5 gagal dalam window -> OPEN
const CIRCUIT_WINDOW_MS = 60 * 1000;
const CIRCUIT_OPEN_MS = 60 * 1000; // jeda tulis non-kritis 60 detik
const WARN_THROTTLE_MS = 60 * 1000; // 1 log per menit per label

let failureTimes = [];
let circuitOpenedAt = 0;
const lastWarnAt = new Map();

function recordDbSuccess() {
    failureTimes = [];
    if (circuitOpenedAt) {
        circuitOpenedAt = 0;
        console.log('[DB] Circuit CLOSED: koneksi pulih, tulis non-kritis dilanjutkan.');
    }
}

function recordDbFailure() {
    const now = Date.now();
    failureTimes.push(now);
    failureTimes = failureTimes.filter((t) => now - t < CIRCUIT_WINDOW_MS);
    if (!circuitOpenedAt && failureTimes.length >= CIRCUIT_FAIL_THRESHOLD) {
        circuitOpenedAt = now;
        console.warn(`[DB] Circuit OPEN: ${failureTimes.length} query gagal dalam 60 detik. Tulis non-kritis (streak/statistik/notif cache) dijeda 60 detik.`);
    }
}

function isDbCircuitOpen() {
    if (!circuitOpenedAt) return false;
    if (Date.now() - circuitOpenedAt > CIRCUIT_OPEN_MS) {
        // Half-open: beri 1 kesempatan; sukses menutup via recordDbSuccess.
        circuitOpenedAt = 0;
        failureTimes = [];
        return false;
    }
    return true;
}

function warnThrottled(label, msg) {
    const now = Date.now();
    if (now - (lastWarnAt.get(label) || 0) < WARN_THROTTLE_MS) return false;
    lastWarnAt.set(label, now);
    console.warn(msg);
    return true;
}

module.exports = {
    recordDbSuccess,
    recordDbFailure,
    isDbCircuitOpen,
    warnThrottled,
};
