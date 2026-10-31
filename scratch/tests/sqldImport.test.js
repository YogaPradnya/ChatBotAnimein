// Test untuk parser dump di scripts/sqld-import.js (tanpa akses DB).
const test = require('node:test');
const assert = require('node:assert');
const {
    splitStatements,
    classifyStatement,
    parseDump,
    tableFromCreate,
    tableFromInsert,
    normalizeUrl,
    healthUrlOf,
    decodeUnistrEscapes,
    rewriteUnistr,
} = require('../../scripts/sqld-import');

test('splitStatements - memisah statement sederhana', () => {
    const out = splitStatements("CREATE TABLE a (x TEXT);\nINSERT INTO a (x) VALUES ('1');\n");
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0], 'CREATE TABLE a (x TEXT)');
    assert.strictEqual(out[1], "INSERT INTO a (x) VALUES ('1')");
});

test('splitStatements - titik koma di dalam string tidak memisah', () => {
    const out = splitStatements("INSERT INTO t VALUES ('a;b');INSERT INTO t VALUES ('c');");
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0], "INSERT INTO t VALUES ('a;b')");
    assert.strictEqual(out[1], "INSERT INTO t VALUES ('c')");
});

test("splitStatements - escape kutip ganda (''), tetap satu statement", () => {
    const out = splitStatements("INSERT INTO t VALUES ('it''s; ok');");
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0], "INSERT INTO t VALUES ('it''s; ok')");
});

test('splitStatements - komentar -- dan /* */ diabaikan', () => {
    const sql = "-- komentar; jangan dihitung\nCREATE TABLE a (x); /* blok; komentar */ INSERT INTO a VALUES (1);";
    const out = splitStatements(sql);
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[0], 'CREATE TABLE a (x)');
    assert.strictEqual(out[1], 'INSERT INTO a VALUES (1)');
});

test("splitStatements - identifier kutip ganda & blob X'...'", () => {
    const out = splitStatements('INSERT INTO "t nama" ("a;b") VALUES (X\'41;42\');');
    assert.strictEqual(out.length, 1);
    assert.strictEqual(out[0], 'INSERT INTO "t nama" ("a;b") VALUES (X\'41;42\')');
});

test('splitStatements - statement terakhir tanpa titik koma tetap diambil', () => {
    const out = splitStatements('CREATE TABLE a (x);\nCREATE TABLE b (y)');
    assert.strictEqual(out.length, 2);
    assert.strictEqual(out[1], 'CREATE TABLE b (y)');
});

test('splitStatements - dump kosong / hanya komentar -> tanpa statement', () => {
    assert.deepStrictEqual(splitStatements(''), []);
    assert.deepStrictEqual(splitStatements('-- hanya komentar\n;'), []);
});

test('classifyStatement - klasifikasi dasar', () => {
    assert.strictEqual(classifyStatement('CREATE TABLE "x" (a)'), 'create-table');
    assert.strictEqual(classifyStatement('CREATE UNIQUE INDEX i ON x (a)'), 'create-index');
    assert.strictEqual(classifyStatement('CREATE TRIGGER t AFTER INSERT ON x BEGIN SELECT 1; END'), 'create-trigger');
    assert.strictEqual(classifyStatement('INSERT INTO "x" VALUES (1)'), 'insert');
    assert.strictEqual(classifyStatement('PRAGMA foreign_keys=OFF'), 'pragma');
    assert.strictEqual(classifyStatement('BEGIN TRANSACTION'), 'transaction');
    assert.strictEqual(classifyStatement('COMMIT'), 'transaction');
    assert.strictEqual(classifyStatement('DELETE FROM sqlite_sequence'), 'sequence');
    assert.strictEqual(classifyStatement("INSERT INTO sqlite_sequence (name, seq) VALUES ('a', 1)"), 'sequence');
});

test('classifyStatement - INSERT biasa tidak salah dikira sqlite_sequence', () => {
    assert.strictEqual(classifyStatement("INSERT INTO t (a) VALUES ('sqlite_sequence')"), 'insert');
});

test('tableFromCreate / tableFromInsert - ambil nama tabel', () => {
    assert.strictEqual(tableFromCreate('CREATE TABLE settings (key TEXT)'), 'settings');
    assert.strictEqual(tableFromCreate('CREATE TABLE IF NOT EXISTS "chat logs" (id)'), 'chat logs');
    assert.strictEqual(tableFromInsert('INSERT INTO "chat_logs" (id) VALUES (1)'), 'chat_logs');
    assert.strictEqual(tableFromInsert('INSERT OR REPLACE INTO settings VALUES (1, 2)'), 'settings');
});

test('parseDump - statistik lengkap untuk dump kecil', () => {
    const dump = [
        'PRAGMA foreign_keys=OFF;',
        'BEGIN TRANSACTION;',
        'CREATE TABLE "settings" (key TEXT PRIMARY KEY, value TEXT);',
        "INSERT INTO \"settings\" VALUES ('a', 'b;c');",
        "INSERT INTO \"settings\" VALUES ('d', 'it''s');",
        'CREATE TABLE "chat_logs" (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT);',
        "INSERT INTO \"chat_logs\" (id, user_id) VALUES (1, 'u1');",
        'CREATE INDEX idx_chat_logs_user_id ON "chat_logs" (user_id);',
        'COMMIT;',
    ].join('\n');
    const parsed = parseDump(dump);
    assert.strictEqual(parsed.byType['create-table'], 2);
    assert.strictEqual(parsed.byType.insert, 3);
    assert.strictEqual(parsed.byType['create-index'], 1);
    assert.strictEqual(parsed.byType.pragma, 1);
    assert.strictEqual(parsed.byType.transaction, 2);
    assert.deepStrictEqual(parsed.insertsByTable, { settings: 2, chat_logs: 1 });
});

test('normalizeUrl / healthUrlOf - pemetaan URL target', () => {
    assert.strictEqual(normalizeUrl('libsql://x.turso.io'), 'libsql://x.turso.io');
    assert.strictEqual(normalizeUrl('bot-db.yogaa.web.id'), 'https://bot-db.yogaa.web.id');
    assert.strictEqual(normalizeUrl('file:demo.db'), 'file:demo.db');
    assert.strictEqual(normalizeUrl(''), '');

    assert.strictEqual(healthUrlOf('libsql://x.turso.io'), 'https://x.turso.io/health');
    assert.strictEqual(healthUrlOf('https://bot-db.yogaa.web.id'), 'https://bot-db.yogaa.web.id/health');
    assert.strictEqual(healthUrlOf('http://127.0.0.1:18080'), 'http://127.0.0.1:18080/health');
    assert.strictEqual(healthUrlOf('file:demo.db'), null);
    assert.strictEqual(healthUrlOf(':memory:'), null);
});

test('classifyStatement - CREATE TABLE internal sqlite_* dilewati', () => {
    assert.strictEqual(classifyStatement('CREATE TABLE IF NOT EXISTS sqlite_sequence(name,seq)'), 'sequence');
    assert.strictEqual(classifyStatement('CREATE TABLE sqlite_stat1(a,b)'), 'sequence');
    assert.strictEqual(classifyStatement('CREATE TABLE user_stats (id INTEGER)'), 'create-table');
});

test('decodeUnistrEscapes - escape dasar, surrogate, backslash', () => {
    assert.strictEqual(decodeUnistrEscapes('a\\u000ab'), 'a\nb');
    assert.strictEqual(decodeUnistrEscapes('\\u0041\\u0042'), 'AB');
    assert.strictEqual(decodeUnistrEscapes('\\ud83d\\ude0a'), '😊');
    assert.strictEqual(decodeUnistrEscapes('lalu\\\\lalu'), 'lalu\\lalu');
    assert.strictEqual(decodeUnistrEscapes('\\U0001F600!'), '😀!');
    assert.strictEqual(decodeUnistrEscapes('tanpa escape'), 'tanpa escape');
    assert.strictEqual(decodeUnistrEscapes('\\q aneh'), '\\q aneh');
});

test('rewriteUnistr - ganti unistr() jadi literal, aman terhadap string', () => {
    assert.strictEqual(
        rewriteUnistr("INSERT INTO t VALUES(unistr('a\\u000ab'))"),
        "INSERT INTO t VALUES('a\nb')"
    );
    assert.strictEqual(
        rewriteUnistr("INSERT INTO t VALUES(1,unistr('it''s \\u0041'))"),
        "INSERT INTO t VALUES(1,'it''s A')"
    );
    assert.strictEqual(
        rewriteUnistr("INSERT INTO t VALUES(unistr('a\\\\b'))"),
        "INSERT INTO t VALUES('a\\b')"
    );

    // tidak menyentuh teks yang memuat kata unistr( di dalam string data
    const s1 = "INSERT INTO t VALUES('sebut unistr(''x'') di sini')";
    assert.strictEqual(rewriteUnistr(s1), s1);
    // bukan pemanggilan (bagian dari identifier lain)
    const s2 = "SELECT myunistr('x')";
    assert.strictEqual(rewriteUnistr(s2), s2);
    // argumen malformed: bukan literal string
    const s3 = 'SELECT unistr(123)';
    assert.strictEqual(rewriteUnistr(s3), s3);
    // tanpa unistr: dikembalikan apa adanya (identitas referensi)
    const s4 = 'INSERT INTO t VALUES(1,2)';
    assert.strictEqual(rewriteUnistr(s4), s4);
});
