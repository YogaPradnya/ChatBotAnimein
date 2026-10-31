#!/usr/bin/env node
// Import dump SQL ke server libsql/sqld, dengan tiga mode:
//   (default)  import dump ke target
//   --check    tampilkan jumlah baris per tabel di target (untuk membandingkan
//              sumber vs target sebelum/sesudah migrasi)
//   --dry-run  parsing dump + statistik saja, tanpa konek ke mana pun
//
// Penggunaan:
//   node scripts/sqld-import.js --dump backups/turso-lama.sql \
//     --url https://bot-db.yogaa.web.id --token "$(cat secrets/sqld-jwt.token)"
//   node scripts/sqld-import.js --check --url https://bot-db.yogaa.web.id --token "..."
//   node scripts/sqld-import.js --dry-run --dump backups/turso-lama.sql
//
// Env fallback: SQLD_URL / SQLD_TOKEN, lalu TURSO_URL / TURSO_AUTH_TOKEN
// (otomatis membaca .env bila ada).
//
// Token read-write dibutuhkan untuk import/--wipe; --check cukup token read-only.

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CHUNK_DEFAULT = 100;
const CHUNK_MAX = 500;
const EXECUTABLE_TYPES = new Set(['create-table', 'create-index', 'create-trigger', 'create-view', 'insert']);

function printHelp() {
    console.log(`Penggunaan: node scripts/sqld-import.js <mode> [opsi]

Mode:
  (default)       import dump ke target
  --check         tampilkan jumlah baris per tabel di target
  --dry-run       parsing dump + statistik saja (tanpa konek)

Opsi:
  --dump <file>   file .sql hasil dump (wajib untuk mode import & dry-run)
  --url <url>     target: https://bot-db.yogaa.web.id, libsql://..., atau file:demo.db
  --token <jwt>   JWT untuk sqld (read-write; --check cukup read-only)
  --wipe          hapus semua tabel/view di target sebelum import (fresh import)
  --chunk <n>     jumlah statement per batch (default ${CHUNK_DEFAULT}, maks ${CHUNK_MAX})
  --strict        exit 1 bila jumlah baris target beda dari jumlah INSERT di dump
  -h, --help      tampilkan bantuan

Env fallback: SQLD_URL/SQLD_TOKEN lalu TURSO_URL/TURSO_AUTH_TOKEN (membaca .env).

Contoh:
  node scripts/sqld-import.js --check --url https://bot-db.yogaa.web.id \\
    --token "$(cat secrets/sqld-jwt.token)"
  node scripts/sqld-import.js --dump backups/turso-lama.sql \\
    --url https://bot-db.yogaa.web.id --token "$(cat secrets/sqld-jwt.token)"`);
}

// ---------------------------------------------------------------------------
// Parser dump SQL
// ---------------------------------------------------------------------------

// Pisah dump menjadi statement SQL, sadar konteks:
// string '...' (escape ''), identifier "..." / `...` / [...] (escape ""),
// komentar -- dan /* */, serta titik koma di dalamnya tidak memisah statement.
function splitStatements(sql) {
    const statements = [];
    let buf = '';
    let i = 0;
    const n = sql.length;

    const flush = () => {
        const s = buf.trim();
        if (s) statements.push(s);
        buf = '';
    };

    while (i < n) {
        const ch = sql[i];

        if (ch === '-' && sql[i + 1] === '-') {
            while (i < n && sql[i] !== '\n') i += 1;
            continue;
        }
        if (ch === '/' && sql[i + 1] === '*') {
            i += 2;
            while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }
        if (ch === "'" || ch === '"' || ch === '`') {
            const quote = ch;
            buf += ch;
            i += 1;
            while (i < n) {
                const c = sql[i];
                buf += c;
                i += 1;
                if (c === quote) {
                    if (sql[i] === quote) {
                        buf += sql[i]; // kutip ganda = escape ('')
                        i += 1;
                    } else {
                        break;
                    }
                }
            }
            continue;
        }
        if (ch === '[') {
            buf += ch;
            i += 1;
            while (i < n) {
                const c = sql[i];
                buf += c;
                i += 1;
                if (c === ']') break;
            }
            continue;
        }
        if (ch === ';') {
            i += 1;
            flush();
            continue;
        }
        buf += ch;
        i += 1;
    }
    flush();
    return statements;
}

function classifyStatement(statement) {
    const s = String(statement).trim();
    const upper = s.toUpperCase();

    if (/^(BEGIN|COMMIT|ROLLBACK)\b/.test(upper)) return 'transaction';
    if (/^END\s+TRANSACTION\b/.test(upper)) return 'transaction';
    if (upper.startsWith('PRAGMA')) return 'pragma';
    if (/^(ANALYZE|VACUUM)\b/.test(upper)) return 'admin';
    if (/^CREATE\s+(VIRTUAL\s+)?TABLE\b/.test(upper)) {
        const tbl = tableFromCreate(s);
        // Tabel internal SQLite (mis. sqlite_sequence yang ditulis sqlite3 .dump
        // di dalam blok writable_schema) tidak boleh dibuat ulang.
        if (tbl && /^sqlite_/i.test(tbl)) return 'sequence';
        return 'create-table';
    }
    if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/.test(upper)) return 'create-index';
    if (/^CREATE\s+TRIGGER\b/.test(upper)) return 'create-trigger';
    if (/^CREATE\s+VIEW\b/.test(upper)) return 'create-view';
    // Statemen ke sqlite_sequence (biasa muncul di dump SQLite) dilewati:
    // sqld/libsql mengurus AUTOINCREMENT sendiri.
    if (/^(INSERT\s+INTO|REPLACE\s+INTO|DELETE\s+FROM|UPDATE)\s+["'`\[]?sqlite_sequence\b/i.test(s)) return 'sequence';
    if (/^(INSERT|REPLACE)\b/.test(upper)) return 'insert';
    return 'other';
}

function tableFromCreate(statement) {
    const m = String(statement).match(
        /^CREATE\s+(?:VIRTUAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/i
    );
    return m ? (m[1] || m[2] || m[3] || m[4]) : null;
}

function tableFromInsert(statement) {
    const m = String(statement).match(
        /^(?:INSERT|REPLACE)\s+(?:OR\s+\w+\s+)?INTO\s+(?:"([^"]+)"|`([^`]+)`|\[([^\]]+)\]|([A-Za-z_][A-Za-z0-9_]*))/i
    );
    return m ? (m[1] || m[2] || m[3] || m[4]) : null;
}

// sqlite3 >= 3.5x menulis string ber-karakter khusus sebagai unistr('\uXXXX…');
// engine sqld tidak mengenal fungsi itu. Dekode escape-nya:
// \uXXXX, \UXXXXXXXX, pasangan surrogate, dan \\ (backslash).
function decodeUnistrEscapes(input) {
    const s = String(input);
    let out = '';
    let i = 0;
    while (i < s.length) {
        const ch = s[i];
        if (ch !== '\\') {
            out += ch;
            i += 1;
            continue;
        }
        const esc = s[i + 1];
        if (esc === '\\') {
            out += '\\';
            i += 2;
            continue;
        }
        if (esc === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
            let cp = parseInt(s.slice(i + 2, i + 6), 16);
            i += 6;
            if (cp >= 0xd800 && cp <= 0xdbff && s[i] === '\\' && s[i + 1] === 'u' && /^[0-9a-fA-F]{4}$/.test(s.slice(i + 2, i + 6))) {
                const lo = parseInt(s.slice(i + 2, i + 6), 16);
                if (lo >= 0xdc00 && lo <= 0xdfff) {
                    cp = 0x10000 + ((cp - 0xd800) << 10) + (lo - 0xdc00);
                    i += 6;
                }
            }
            out += String.fromCodePoint(cp);
            continue;
        }
        if (esc === 'U' && /^[0-9a-fA-F]{8}$/.test(s.slice(i + 2, i + 10))) {
            const cp = parseInt(s.slice(i + 2, i + 10), 16);
            i += 10;
            out += String.fromCodePoint(cp);
            continue;
        }
        out += ch; // escape tak dikenal: biarkan apa adanya
        i += 1;
    }
    return out;
}

// Ganti pemanggilan unistr('…') dengan literal string biasa, hanya di luar
// string/identifier (scan sadar-konteks), supaya teks data yang memuat kata
// "unistr(" tidak ikut diubah. Statement tanpa unistr dikembalikan apa adanya.
function rewriteUnistr(statement) {
    const src = String(statement);
    if (!/unistr\s*\(/i.test(src)) return src;

    const n = src.length;
    const isWordChar = (c) => c !== undefined && /[A-Za-z0-9_$]/.test(c);
    let out = '';
    let i = 0;
    let changed = false;

    while (i < n) {
        const ch = src[i];

        if (ch === "'" || ch === '"' || ch === '`') {
            out += ch;
            i += 1;
            while (i < n) {
                const c = src[i];
                out += c;
                i += 1;
                if (c === ch) {
                    if (src[i] === ch) {
                        out += src[i];
                        i += 1;
                    } else {
                        break;
                    }
                }
            }
            continue;
        }
        if (ch === '[') {
            out += ch;
            i += 1;
            while (i < n) {
                const c = src[i];
                out += c;
                i += 1;
                if (c === ']') break;
            }
            continue;
        }

        if ((ch === 'u' || ch === 'U') && !isWordChar(src[i - 1]) && src.slice(i, i + 6).toLowerCase() === 'unistr') {
            let j = i + 6;
            while (j < n && /\s/.test(src[j])) j += 1;
            if (src[j] === '(') {
                j += 1;
                while (j < n && /\s/.test(src[j])) j += 1;
                if (src[j] === "'") {
                    let raw = '';
                    let k = j + 1;
                    let closed = false;
                    while (k < n) {
                        const c = src[k];
                        if (c === "'") {
                            if (src[k + 1] === "'") {
                                raw += "'";
                                k += 2;
                                continue;
                            }
                            closed = true;
                            k += 1;
                            break;
                        }
                        raw += c;
                        k += 1;
                    }
                    let m = k;
                    while (m < n && /\s/.test(src[m])) m += 1;
                    if (closed && src[m] === ')') {
                        const decoded = decodeUnistrEscapes(raw).replace(/'/g, "''");
                        out += "'" + decoded + "'";
                        i = m + 1;
                        changed = true;
                        continue;
                    }
                }
            }
        }

        out += ch;
        i += 1;
    }
    return changed ? out : src;
}

function parseDump(text) {
    const statements = splitStatements(text);
    const byType = {};
    const insertsByTable = {};
    for (const stmt of statements) {
        const type = classifyStatement(stmt);
        byType[type] = (byType[type] || 0) + 1;
        if (type === 'insert') {
            const t = tableFromInsert(stmt);
            if (t) insertsByTable[t] = (insertsByTable[t] || 0) + 1;
        }
    }
    return { statements, byType, insertsByTable };
}

function printDumpStats(parsed, file) {
    const { statements, byType, insertsByTable } = parsed;
    const head = file ? path.basename(file) + ': ' : '';
    console.log(`[dump] ${head}${statements.length} statement`);
    console.log(`  create-table : ${byType['create-table'] || 0}`);
    console.log(`  create-index : ${byType['create-index'] || 0}`);
    if (byType['create-trigger'] || byType['create-view']) {
        console.log(`  trigger/view : ${(byType['create-trigger'] || 0) + (byType['create-view'] || 0)}`);
    }
    console.log(`  insert       : ${byType.insert || 0}`);
    const skipped = ['pragma', 'transaction', 'admin', 'sequence', 'other']
        .map((t) => [t, byType[t] || 0])
        .filter(([, count]) => count > 0);
    if (skipped.length > 0) {
        console.log(`  dilewati     : ${skipped.map(([t, c]) => `${t}=${c}`).join(', ')}`);
    }
    const tables = Object.entries(insertsByTable).sort((a, b) => b[1] - a[1]);
    if (tables.length > 0) {
        console.log('  baris per tabel (insert):');
        for (const [t, count] of tables.slice(0, 15)) {
            console.log(`    ${t.padEnd(28)} ${count}`);
        }
        if (tables.length > 15) console.log(`    ... dan ${tables.length - 15} tabel lain`);
    }
}

// ---------------------------------------------------------------------------
// Operasi database
// ---------------------------------------------------------------------------

function normalizeUrl(input) {
    let url = String(input || '').trim();
    if (!url) return '';
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
    if (/^file:/i.test(url) || url === ':memory:') return url;
    return 'https://' + url;
}

// URL /health (endpoint publik sqld) untuk cek cepat "server hidup atau tidak".
// Turso Cloud juga melayani /health (sudah diverifikasi HTTP 200).
function healthUrlOf(dbUrl) {
    const probe = String(dbUrl || '').replace(/^libsql:/i, 'https:');
    if (!/^https?:/i.test(probe)) return null;
    try {
        return new URL('/health', probe).toString();
    } catch (e) {
        return null;
    }
}

// Preflight sebelum konek lewat client: @libsql/client memakai cross-fetch yang
// mengubah balasan non-JSON (mis. 503 dari proxy) menjadi pesan error menyesatkan.
async function preflight(dbUrl) {
    const healthUrl = healthUrlOf(dbUrl);
    if (!healthUrl) return true;

    let res;
    try {
        res = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
    } catch (e) {
        console.error(`[import] Preflight ${healthUrl} gagal: ${e.message}`);
        console.error('[import] Cek DNS domain dan pastikan container sqld hidup (Coolify → resource → service sqld → status/logs).');
        process.exitCode = 1;
        return false;
    }

    if (res.status === 200) return true;

    const body = (await res.text()).trim().slice(0, 140);
    const detail = body ? ` — "${body}"` : '';
    if (res.status === 502 || res.status === 503 || res.status === 504) {
        console.error(`[import] Preflight ${healthUrl} -> HTTP ${res.status}${detail}`);
        console.error('[import] Backend sqld tidak tersedia lewat proxy. Cek di Coolify: deploy sukses? service "sqld" running? domain diarahkan ke service "sqld" port 8080?');
        process.exitCode = 1;
        return false;
    }

    console.log(`[import] Catatan preflight: ${healthUrl} -> HTTP ${res.status}${detail} (lanjut).`);
    return true;
}

// Bila operasi tetap gagal, tarik diagnosa dari /health.
async function diagnoseAfterError(e, dbUrl) {
    const msg = String(e && e.message ? e.message : e);
    if (!/cancel is not a function|fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|getaddrinfo|HTTP status 5\d\d/i.test(msg)) {
        return null;
    }
    const healthUrl = healthUrlOf(dbUrl);
    if (!healthUrl) return null;
    try {
        const res = await fetch(healthUrl, { signal: AbortSignal.timeout(10000) });
        const body = (await res.text()).trim().slice(0, 140);
        const detail = body ? ` ("${body}")` : '';
        return `Diagnosa: GET ${healthUrl} -> HTTP ${res.status}${detail}.`;
    } catch (e2) {
        return `Diagnosa: GET ${healthUrl} gagal — ${e2.message}.`;
    }
}

function readDumpFile(file) {
    const p = path.resolve(file);
    if (!fs.existsSync(p)) throw new Error('File dump tidak ditemukan: ' + p);
    return fs.readFileSync(p, 'utf8');
}

async function withRetry(fn, attempts = 3, delayMs = 1000) {
    let lastErr;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            return await fn();
        } catch (e) {
            lastErr = e;
            if (attempt < attempts) {
                await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
            }
        }
    }
    throw lastErr;
}

async function listExistingObjects(db) {
    const res = await db.execute(
        "SELECT name, type FROM sqlite_master WHERE type IN ('table','view') AND name NOT LIKE 'sqlite_%' ORDER BY type DESC, name"
    );
    return res.rows.map((r) => ({ name: String(r.name), type: String(r.type) }));
}

async function wipeTarget(db, log) {
    const objects = await listExistingObjects(db);
    if (objects.length === 0) return 0;
    const drops = objects.map(
        (o) => `DROP ${o.type === 'view' ? 'VIEW' : 'TABLE'} IF EXISTS "${o.name.replace(/"/g, '""')}"`
    );
    for (let i = 0; i < drops.length; i += 50) {
        await db.batch(drops.slice(i, i + 50));
    }
    log(`[wipe] ${objects.length} tabel/view dihapus dari target.`);
    return objects.length;
}

async function checkTarget(db) {
    const tables = await db.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    if (tables.rows.length === 0) {
        console.log('[check] database kosong (belum ada tabel user).');
        return { tables: 0, totalRows: 0, counts: {} };
    }
    let totalRows = 0;
    const counts = {};
    console.log(`[check] ${tables.rows.length} tabel:`);
    for (const row of tables.rows) {
        const name = String(row.name);
        const res = await db.execute(`SELECT COUNT(*) AS n FROM "${name.replace(/"/g, '""')}"`);
        const count = Number(res.rows[0].n);
        counts[name] = count;
        totalRows += count;
        console.log(`  ${name.padEnd(28)} ${count}`);
    }
    console.log(`[check] total ${totalRows} baris di ${tables.rows.length} tabel.`);
    return { tables: tables.rows.length, totalRows, counts };
}

async function applyStatements(db, statements, chunkSize, log) {
    const toRun = [];
    const skipped = {};
    let rewritten = 0;
    for (const stmt of statements) {
        const type = classifyStatement(stmt);
        if (EXECUTABLE_TYPES.has(type)) {
            const fixed = rewriteUnistr(stmt);
            if (fixed !== stmt) rewritten += 1;
            toRun.push(fixed);
        } else {
            skipped[type] = (skipped[type] || 0) + 1;
        }
    }
    const skippedText = Object.entries(skipped).map(([t, c]) => `${t}=${c}`).join(', ');
    const rewriteText = rewritten > 0 ? `, unistr→literal: ${rewritten}` : '';
    log(`[import] mengeksekusi ${toRun.length} statement (dilewati: ${skippedText || '-'}${rewriteText}), chunk ${chunkSize}.`);
    if (toRun.length === 0) return;

    for (let i = 0; i < toRun.length; i += chunkSize) {
        const chunk = toRun.slice(i, i + chunkSize);
        await withRetry(() => db.batch(chunk));
        const done = Math.min(i + chunkSize, toRun.length);
        const chunkNo = Math.floor(i / chunkSize) + 1;
        if (chunkNo % 10 === 0 || done === toRun.length) {
            log(`[import] progres ${done}/${toRun.length} statement.`);
        }
    }
}

function hintForError(e) {
    const msg = String(e && e.message ? e.message : e);
    if (/cancel is not a function/i.test(msg)) {
        return 'Pesan ini bug tampilan dari hrana-client saat server membalas non-JSON (biasanya 502/503 dari proxy) — lihat hasil diagnosa di bawah untuk penyebab aslinya.';
    }
    if (/401|unauthor/i.test(msg)) {
        return 'Token ditolak: pastikan token dari scripts/sqld-keygen.js cocok dengan SQLD_AUTH_JWT_KEY yang dipasang di server (redeploy sqld setelah ganti env).';
    }
    if (/403|forbidden/i.test(msg)) {
        return 'Akses ditolak: kemungkinan token read-only dipakai untuk menulis. Import butuh token read-write (secrets/sqld-jwt.token).';
    }
    if (/fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|getaddrinfo/i.test(msg)) {
        return 'Gagal konek: cek --url (DNS/domain/port) dan pastikan container sqld hidup.';
    }
    return null;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
    const args = { chunk: CHUNK_DEFAULT };
    for (let i = 0; i < argv.length; i += 1) {
        const a = argv[i];
        switch (a) {
            case '--dump': args.dump = argv[++i]; break;
            case '--url': args.url = argv[++i]; break;
            case '--token': args.token = argv[++i]; break;
            case '--chunk': args.chunk = parseInt(argv[++i], 10); break;
            case '--check': args.check = true; break;
            case '--wipe': args.wipe = true; break;
            case '--dry-run': args.dryRun = true; break;
            case '--strict': args.strict = true; break;
            case '--help': case '-h': args.help = true; break;
            default:
                if (a.startsWith('--')) {
                    console.error(`[import] Opsi tidak dikenal: ${a}`);
                    args.unknown = true;
                }
        }
    }
    if (!Number.isFinite(args.chunk) || args.chunk < 1) args.chunk = CHUNK_DEFAULT;
    args.chunk = Math.min(CHUNK_MAX, Math.max(1, args.chunk));
    return args;
}

function loadDotenvIfAvailable() {
    try {
        require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
    } catch (e) {
        // dotenv opsional — env bisa diisi langsung dari shell.
    }
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    if (args.help || args.unknown) {
        printHelp();
        if (args.unknown) process.exitCode = 2;
        return;
    }

    if (args.dryRun) {
        if (!args.dump) throw new Error('Mode --dry-run butuh --dump <file>.');
        printDumpStats(parseDump(readDumpFile(args.dump)), args.dump);
        return;
    }

    loadDotenvIfAvailable();
    const url = normalizeUrl(args.url || process.env.SQLD_URL || process.env.TURSO_URL);
    const token = args.token || process.env.SQLD_TOKEN || process.env.TURSO_AUTH_TOKEN || '';
    if (!url) throw new Error('URL target belum diisi: pakai --url atau env SQLD_URL/TURSO_URL.');

    if (!(await preflight(url))) return;

    const { createClient } = require('@libsql/client');
    const db = createClient({ url, authToken: token || undefined });

    try {
        if (args.check) {
            console.log(`[check] target: ${url}`);
            await checkTarget(db);
            return;
        }

        if (!args.dump) throw new Error('Mode import butuh --dump <file>. Coba --help.');

        const parsed = parseDump(readDumpFile(args.dump));
        printDumpStats(parsed, args.dump);

        const existing = await listExistingObjects(db);
        if (existing.length > 0) {
            if (!args.wipe) {
                console.error(`[import] Target sudah punya ${existing.length} tabel/view:`);
                console.error('  ' + existing.map((o) => o.name).join(', '));
                console.error('[import] Dibatalkan. Gunakan --wipe untuk menghapus dulu, atau arahkan ke target kosong.');
                process.exitCode = 1;
                return;
            }
            await wipeTarget(db, console.log);
        }

        console.log(`[import] menulis ke ${url} ...`);
        const startedAt = Date.now();
        await applyStatements(db, parsed.statements, args.chunk, console.log);
        console.log(`[import] selesai dalam ${((Date.now() - startedAt) / 1000).toFixed(1)}s.`);
        console.log('');

        const target = await checkTarget(db);

        const diffs = [];
        for (const [table, expected] of Object.entries(parsed.insertsByTable)) {
            const actual = target.counts[table];
            if (actual === undefined) diffs.push(`${table}: dump ${expected}, tidak ada di target`);
            else if (actual !== expected) diffs.push(`${table}: dump ${expected}, target ${actual}`);
        }
        if (diffs.length > 0) {
            console.log('[import] PERHATIAN — selisih jumlah baris (wajar bila ada INSERT multi-baris):');
            for (const d of diffs) console.log('  - ' + d);
            if (args.strict) process.exitCode = 1;
        } else {
            console.log('[import] OK — jumlah baris cocok dengan isi dump.');
        }
        console.log('[import] Bandingkan dengan sumber: node scripts/sqld-import.js --check --url <DB-LAMA> --token <TOKEN-LAMA>');
    } catch (e) {
        console.error(`[import] GAGAL: ${e && e.message ? e.message : e}`);
        const hint = hintForError(e);
        if (hint) console.error('[import] ' + hint);
        const diag = await diagnoseAfterError(e, url);
        if (diag) console.error('[import] ' + diag);
        process.exitCode = 1;
    } finally {
        if (typeof db.close === 'function') db.close();
    }
}

if (require.main === module) {
    main().catch((e) => {
        console.error(`[import] GAGAL: ${e && e.message ? e.message : e}`);
        const hint = hintForError(e);
        if (hint) console.error('[import] ' + hint);
        process.exitCode = 1;
    });
}

module.exports = {
    splitStatements,
    classifyStatement,
    parseDump,
    tableFromCreate,
    tableFromInsert,
    normalizeUrl,
    healthUrlOf,
    decodeUnistrEscapes,
    rewriteUnistr,
};
