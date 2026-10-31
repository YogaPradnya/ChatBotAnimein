// Batas waktu untuk janji async agar satu ketergantungan lambat (DB sqld,
// API, AI) tidak menggantung worker/polling selamanya.
// Aturan repo: JANGAN pakai db.batch()/transaction() (lihat
// src/database/runtimeRepo.js). Semua query lewat db.execute() yang dipatch
// dengan timeout di bawah.
const DEFAULT_DB_TIMEOUT_MS = 8000;

function withTimeout(promise, ms, label = 'operation') {
    const timeoutMs = Number(ms) > 0 ? Number(ms) : DEFAULT_DB_TIMEOUT_MS;
    let timer = null;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
            const err = new Error(`${label} timeout setelah ${timeoutMs}ms`);
            err.code = 'DB_TIMEOUT';
            reject(err);
        }, timeoutMs);
        if (timer.unref) timer.unref();
    });
    return Promise.race([promise, timeout]).finally(() => {
        if (timer) clearTimeout(timer);
    });
}

function describeDbArg(arg) {
    try {
        if (typeof arg === 'string') return arg.slice(0, 60);
        if (arg && typeof arg.sql === 'string') return String(arg.sql).slice(0, 60).replace(/\s+/g, ' ');
        return 'db.execute';
    } catch (_) {
        return 'db.execute';
    }
}

// Bungkus db.execute agar SETIAP query DB gagal-cepat (fail-fast) alih-alih
// gantung selamanya. Dipanggil sekali setelah createClient di bot.js dan
// src/bootstrap.js; semua repo (quiz/limit/gacha/dll) otomatis terlindungi
// karena memakai objek db yang sama.
function patchDbWithTimeout(db, ms = DEFAULT_DB_TIMEOUT_MS) {
    if (!db || typeof db.execute !== 'function' || db.execute.__withTimeout) return db;
    const { recordDbSuccess, recordDbFailure } = require('./dbHealth');
    const rawExecute = db.execute.bind(db);
    const wrapped = function patchedExecute(arg, ...rest) {
        return withTimeout(Promise.resolve().then(() => rawExecute(arg, ...rest)), ms, `DB ${describeDbArg(arg)}`)
            .then(
                (res) => { recordDbSuccess(); return res; },
                (err) => { recordDbFailure(); throw err; }
            );
    };
    wrapped.__withTimeout = true;
    db.execute = wrapped;
    return db;
}

module.exports = {
    DEFAULT_DB_TIMEOUT_MS,
    withTimeout,
    patchDbWithTimeout,
};
