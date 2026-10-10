#!/usr/bin/env bash
# Backup database Turso/libsql atau SQLite lokal.
#
# - Bila TURSO_URL ada (dan bukan placeholder), dump isi database remote
#   via @libsql/client ke file SQL ber-timestamp di backups/.
# - Bila tidak, copy file SQLite lokal (animein.db / local.db / dsb.)
#   ke backups/ dengan timestamp.
# - Retensi 7 hari: file backup lebih tua dari 7 hari dihapus.
# - Aman bila env kosong: cetak pesan dan exit 0 (jangan crash).
# - File hasil backup jangan di-commit (backups/ ada di .gitignore).
#
# Penggunaan:
#   bash scripts/backup-db.sh
#   npm run backup
#
# Env yang dibaca (opsional): TURSO_URL, TURSO_AUTH_TOKEN,
#   LOCAL_DB_PATH, DB_FILE, SQLITE_PATH, BACKUP_DIR.

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"

mkdir -p "$BACKUP_DIR" 2>/dev/null || {
    echo "[backup] tidak bisa membuat direktori $BACKUP_DIR, lewati backup."
    exit 0
}

# Retensi 7 hari (dijalankan dulu agar backup lama dibersihkan walau dump gagal).
find "$BACKUP_DIR" -maxdepth 1 -type f -mtime +7 -delete 2>/dev/null || true

# Muat .env bila ada (abaikan bila hilang/rusak agar tidak crash).
if [ -f "$ROOT_DIR/.env" ]; then
    set -a
    # shellcheck disable=SC1091
    . "$ROOT_DIR/.env" 2>/dev/null || true
    set +a
fi

TS="$(date +%Y%m%d-%H%M%S 2>/dev/null || echo unknown)"

# --- 1) Dump Turso/libsql bila TURSO_URL valid ---
if [ -n "${TURSO_URL:-}" ] && [ "$TURSO_URL" != "changeme" ] && [ "$TURSO_URL" != "" ]; then
    OUT="$BACKUP_DIR/turso-$TS.sql"
    if node -e "require('@libsql/client')" 2>/dev/null; then
        TURSO_URL="$TURSO_URL" TURSO_AUTH_TOKEN="${TURSO_AUTH_TOKEN:-}" BACKUP_OUT="$OUT" node <<'EOF' 2>"$BACKUP_DIR/.dump-$TS.log" || DUMP_FAILED=1
const fs = require('fs');
const { createClient } = require('@libsql/client');

function sqlLiteral(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'bigint') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (v instanceof Uint8Array || Buffer.isBuffer(v)) {
        return "X'" + Buffer.from(v).toString('hex') + "'";
    }
    return "'" + String(v).replace(/'/g, "''") + "'";
}

function ident(name) {
    return '"' + String(name).replace(/"/g, '""') + '"';
}

(async () => {
    const db = createClient({
        url: process.env.TURSO_URL,
        authToken: process.env.TURSO_AUTH_TOKEN || undefined,
    });
    const out = process.env.BACKUP_OUT;
    let dump = '-- Animein Bot Turso backup ' + new Date().toISOString() + '\n';
    const tables = await db.execute(
        "SELECT name, sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
    );
    for (const t of tables.rows) {
        if (t.sql) dump += t.sql + ';\n';
        const cols = await db.execute('PRAGMA table_info(' + ident(t.name) + ')');
        const names = cols.rows.map((c) => c.name);
        if (names.length === 0) continue;
        const colList = names.map(ident).join(', ');
        // Baca per batch agar hemat memori untuk tabel besar.
        let offset = 0;
        const BATCH = 500;
        for (;;) {
            const data = await db.execute({
                sql: 'SELECT ' + colList + ' FROM ' + ident(t.name) + ' LIMIT ? OFFSET ?',
                args: [BATCH, offset],
            });
            if (data.rows.length === 0) break;
            for (const r of data.rows) {
                dump += 'INSERT INTO ' + ident(t.name) + ' (' + colList + ') VALUES ('
                    + names.map((n) => sqlLiteral(r[n])).join(', ') + ');\n';
            }
            offset += data.rows.length;
            if (data.rows.length < BATCH) break;
        }
    }
    fs.writeFileSync(out, dump);
    if (typeof db.close === 'function') db.close();
})().catch((e) => {
    console.error('[backup] dump turso gagal: ' + (e && e.message ? e.message : e));
    process.exit(1);
});
EOF
        if [ "${DUMP_FAILED:-0}" = "1" ]; then
            echo "[backup] dump Turso gagal, lihat $BACKUP_DIR/.dump-$TS.log. Backup dibatalkan (exit 0)."
            exit 0
        fi
        echo "[backup] OK: $OUT"
        exit 0
    else
        echo "[backup] TURSO_URL ada tapi modul @libsql/client tidak tersedia, fallback ke SQLite lokal."
    fi
fi

# --- 2) Fallback: copy SQLite lokal ---
CANDIDATE=""
for c in "${LOCAL_DB_PATH:-}" "${DB_FILE:-}" "${SQLITE_PATH:-}" \
         "$ROOT_DIR/animein.db" "$ROOT_DIR/animein_local.db" "$ROOT_DIR/local.db" \
         "$ROOT_DIR/data.sqlite" "$ROOT_DIR/database.sqlite"; do
    if [ -n "$c" ] && [ -f "$c" ]; then
        CANDIDATE="$c"
        break
    fi
done

if [ -z "$CANDIDATE" ]; then
    echo "[backup] tidak ada sumber DB (TURSO_URL kosong dan file SQLite lokal tidak ditemukan). Lewati backup."
    exit 0
fi

OUT="$BACKUP_DIR/sqlite-$(basename "$CANDIDATE")-$TS.bak"
if cp -p "$CANDIDATE" "$OUT" 2>/dev/null; then
    echo "[backup] OK: $OUT (dari $CANDIDATE)"
    exit 0
else
    echo "[backup] gagal menyalin $CANDIDATE. Lewati backup."
    exit 0
fi
