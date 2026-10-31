#!/bin/sh
# Backup sqld self-hosted -> dump lokal + snapshot harian di Turso Cloud.
#
# Dijalankan oleh service "backup" di compose Coolify (lihat docs/SQLD-SELFHOST.md).
# Memakai endpoint resmi sqld: GET /dump (Bearer JWT), lalu snapshot dibuat via
# Turso CLI: sqlite3 (dump -> file .db) + turso db create <slot> --from-file <db>.
# Catatan: `--from-dump` tidak dipakai — rusak di platform Turso saat ini
# (upload "sukses" + exit 0, tapi database hasilnya kosong).
#
# Penggunaan:
#   sqld-backup-turso.sh          # sekali jalan (exit 0 sukses / 1 gagal)
#   sqld-backup-turso.sh --loop   # loop: sukses -> tunggu BACKUP_INTERVAL_SECONDS;
#                                 #       gagal  -> coba lagi 5 menit
#
# Env wajib: SQLD_URL (mis. http://sqld:8080), SQLD_TOKEN (JWT read-only),
#            TURSO_API_TOKEN (token platform Turso)
# Env opsional:
#   BACKUP_DIR=/backup, BACKUP_KEEP_DAYS=7, TURSO_DB_PREFIX=animein-bk,
#   BACKUP_INTERVAL_SECONDS=86400, ALERT_WEBHOOK_URL (Discord), SKIP_TURSO=1
#
# Slot Turso per hari: <prefix>-mon .. <prefix>-sun -> retensi 7 snapshot,
# slot lama dibuang lalu dibuat ulang dari dump terbaru (refresh mingguan).

set -u
export LC_ALL=C

BACKUP_DIR="${BACKUP_DIR:-/backup}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
PREFIX="${TURSO_DB_PREFIX:-animein-bk}"
INTERVAL="${BACKUP_INTERVAL_SECONDS:-86400}"
RETRY_DELAY=300

log() { echo "[backup] $(date '+%F %T') $*"; }

notify() {
    [ -n "${ALERT_WEBHOOK_URL:-}" ] || return 0
    curl -fsS -m 10 -X POST -H 'Content-Type: application/json' \
        -d "{\"content\":\"[backup sqld] $1\"}" "$ALERT_WEBHOOK_URL" >/dev/null 2>&1 || true
}

ensure_curl() {
    command -v curl >/dev/null 2>&1 && return 0
    if command -v apk >/dev/null 2>&1; then
        apk add --no-cache curl ca-certificates >/dev/null 2>&1 || true
    fi
    command -v curl >/dev/null 2>&1
}

ensure_turso() {
    command -v turso >/dev/null 2>&1 && turso --version >/dev/null 2>&1 && return 0
    # Binary sudah ada di ~/.turso tapi belum tentu masuk PATH.
    if [ -x "$HOME/.turso/turso" ] && "$HOME/.turso/turso" --version >/dev/null 2>&1; then
        PATH="$HOME/.turso:$PATH"
        export PATH
        return 0
    fi
    log "install Turso CLI..."
    if command -v apk >/dev/null 2>&1; then
        # Binary rilis resmi turso = glibc; di alpine (musl) butuh gcompat/libc6-compat.
        apk add --no-cache bash curl ca-certificates gcompat libc6-compat >/dev/null 2>&1 || true
    fi
    curl -sSfL https://get.tur.so/install.sh | bash >/dev/null 2>&1 || log "installer Turso CLI keluar dengan error (diverifikasi di bawah)"
    PATH="$HOME/.turso:$PATH"
    export PATH
    if command -v turso >/dev/null 2>&1 && turso --version >/dev/null 2>&1; then
        return 0
    fi
    log "Turso CLI tidak bisa dijalankan (binary glibc di image musl — pastikan gcompat terpasang)"
    return 1
}

ensure_sqlite() {
    command -v sqlite3 >/dev/null 2>&1 && return 0
    if command -v apk >/dev/null 2>&1; then
        apk add --no-cache sqlite >/dev/null 2>&1 || true
    fi
    command -v sqlite3 >/dev/null 2>&1
}

run_once() {
    [ -n "${SQLD_URL:-}" ] || { log "SQLD_URL kosong"; return 1; }
    [ -n "${SQLD_TOKEN:-}" ] || { log "SQLD_TOKEN kosong"; return 1; }
    ensure_curl || { log "curl tidak tersedia"; notify "curl tidak tersedia"; return 1; }

    DOW=$(date +%a | tr 'A-Z' 'a-z') # mon..sun
    DAY=$(date +%F)
    DUMP="$BACKUP_DIR/sqld-$DAY.sql"
    SLOT="$PREFIX-$DOW"

    mkdir -p "$BACKUP_DIR" 2>/dev/null || true

    # 1) Dump dari sqld (endpoint resmi /dump, Bearer JWT).
    log "dump $SQLD_URL -> $DUMP"
    if ! curl -fsS -m 900 -H "Authorization: Bearer $SQLD_TOKEN" \
        "$SQLD_URL/dump?preserve_row_ids=true" -o "$DUMP"; then
        log "dump gagal"
        notify "dump dari sqld GAGAL"
        return 1
    fi

    # 2) Sanity check dump (slot lama jangan disentuh kalau dump cacat).
    SIZE=$(wc -c <"$DUMP" 2>/dev/null | tr -d ' ')
    SIZE=${SIZE:-0}
    TABLES=$(grep -c 'CREATE TABLE' "$DUMP" 2>/dev/null || true)
    TABLES=${TABLES:-0}
    INSERTS=$(grep -c 'INSERT INTO' "$DUMP" 2>/dev/null || true)
    INSERTS=${INSERTS:-0}
    SETTINGS_ROWS=$(grep -cE '^INSERT INTO "?settings"?' "$DUMP" 2>/dev/null || true)
    SETTINGS_ROWS=${SETTINGS_ROWS:-0}
    log "dump: $SIZE byte, $TABLES tabel, $INSERTS baris INSERT (settings: $SETTINGS_ROWS)"
    [ "$SIZE" -gt 1000 ] || { log "dump terlalu kecil"; notify "dump terlalu kecil ($SIZE byte)"; return 1; }
    [ "$TABLES" -ge 5 ] || { log "dump tanpa tabel"; notify "dump tidak berisi tabel ($TABLES)"; return 1; }
    grep -q 'CREATE TABLE.*settings' "$DUMP" || { log "tabel settings tidak ada"; notify "tabel settings tidak ada di dump"; return 1; }

    # 3) Retensi file lokal (dump sql + file db lebih tua dari KEEP_DAYS).
    find "$BACKUP_DIR" -maxdepth 1 \( -name 'sqld-*.sql' -o -name 'sqld-*.db' -o -name 'sqld-*.db-wal' -o -name 'sqld-*.db-shm' \) -mtime +"$KEEP_DAYS" -delete 2>/dev/null || true

    # 4) Snapshot Turso (slot per hari, refresh mingguan).
    if [ "${SKIP_TURSO:-0}" = "1" ]; then
        log "SKIP_TURSO=1 — snapshot Turso dilewati"
    else
        [ -n "${TURSO_API_TOKEN:-}" ] || { log "TURSO_API_TOKEN kosong"; notify "TURSO_API_TOKEN kosong"; return 1; }
        ensure_turso || { notify "Turso CLI tidak bisa disiapkan"; return 1; }
        ensure_sqlite || { notify "sqlite3 tidak bisa disiapkan"; return 1; }

        # Impor lewat `--from-file` (bukan `--from-dump` yang rusak di platform saat ini:
        # upload "sukses"/exit 0 tapi database hasilnya kosong).
        DBFILE="$BACKUP_DIR/sqld-$DAY.db"
        log "build $DBFILE dari dump"
        rm -f "$DBFILE" "$DBFILE-wal" "$DBFILE-shm"
        if ! sqlite3 "$DBFILE" <"$DUMP"; then
            log "build file SQLite gagal"
            notify "build file SQLite gagal"
            return 1
        fi

        log "refresh slot Turso $SLOT (buang lama -> impor --from-file)"
        turso db destroy "$SLOT" --yes >/dev/null 2>&1 || true
        if ! turso db create "$SLOT" --from-file "$DBFILE" >/dev/null; then
            log "turso db create $SLOT gagal"
            notify "turso db create $SLOT GAGAL"
            return 1
        fi

        COUNT=""
        for _ in 1 2 3; do
            COUNT=$(turso db shell "$SLOT" 'SELECT count(*) FROM settings' 2>/dev/null | grep -oE '[0-9]+' | head -1)
            [ -n "$COUNT" ] && break
            sleep 10
        done
        if [ -n "$COUNT" ] && [ "$COUNT" = "$SETTINGS_ROWS" ]; then
            log "verifikasi OK: settings=$COUNT"
            rm -f "$DBFILE-wal" "$DBFILE-shm"
        else
            log "verifikasi GAGAL: dump=$SETTINGS_ROWS turso=${COUNT:-?}"
            notify "verifikasi GAGAL: dump=$SETTINGS_ROWS turso=${COUNT:-?}"
            return 1
        fi
    fi

    log "SELESAI: $DUMP"
    return 0
}

case "${1:-run}" in
    --loop)
        while :; do
            if run_once; then
                sleep "$INTERVAL"
            else
                log "siklus gagal, coba lagi $RETRY_DELAY detik"
                sleep "$RETRY_DELAY"
            fi
        done
        ;;
    run | "")
        run_once
        ;;
    *)
        echo "Penggunaan: $0 [--loop]" >&2
        exit 2
        ;;
esac
