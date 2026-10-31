# sqld Self-Hosted (Coolify) + Backup Harian ke Turso

Panduan memindahkan database bot Animein dari Turso Cloud ke **sqld self-hosted**
di VPS Coolify, dengan **snapshot backup harian otomatis ke Turso Cloud**.

Tidak ada perubahan kode aplikasi (bot/webcard) — hanya tukar env
`TURSO_URL` + `TURSO_AUTH_TOKEN`.

## Arsitektur

```txt
Render (bot) ──── HTTPS + JWT (read-write) ──┐
                                             ▼
webcard di VPS (jika ada) ──> bot-db.yogaa.web.id ──> reverse proxy Coolify ──> sqld :8080
                                                       │  (container, volume /data/animein-sqld)
                                                       │
                                                       └── service "backup" (alpine)
                                                             ├─ curl GET /dump  (JWT read-only)
                                                             ├─ dump lokal /data/animein-backup/sqld-YYYY-MM-DD.sql (retensi 7 hari)
                                                             ├─ sqlite3: build sqld-YYYY-MM-DD.db dari dump
                                                             └─ turso db create animein-bk-<hari> --from-file (retensi 7 slot)
```

- Autentikasi memakai **JWT EdDSA (Ed25519)**. `SQLD_AUTH_JWT_KEY` berisi
  public key berbentuk base64url (bukan PEM).
- Bot & webcard memakai token **read-write**; service backup memakai token
  **read-only**.
- Turso **tidak bisa** menjadi replica otomatis dari sqld self-hosted, jadi
  backup berbentuk **snapshot terjadwal**: lag data maksimal = interval
  (default 24 jam). Unit backup: file `GET /dump` dari sqld di-build lokal
  menjadi file SQLite (`sqlite3`), lalu diunggah ke Turso via
  `turso db create --from-file` (catatan: `--from-dump` rusak di platform —
  lihat Troubleshooting).

## File Terkait

| File | Fungsi |
|---|---|
| `scripts/sqld-keygen.js` | Generate kunci Ed25519 + 2 token JWT (rw & ro) |
| `scripts/sqld-import.js` | Import dump → sqld / `--check` / `--wipe` / `--dry-run` |
| `scripts/sqld-backup-turso.sh` | Service backup: dump sqld → file lokal + snapshot Turso |
| `docs/SQLD-SELFHOST.md` | Dokumen ini |

Output kunci di folder `secrets/` (gitignored):

| File | Dipakai untuk |
|---|---|
| `sqld-jwt.key` | Private key — simpan di password manager (untuk `--from-key`) |
| `sqld-jwt-pub.b64` | env `SQLD_AUTH_JWT_KEY` di compose (aman di-paste) |
| `sqld-jwt.token` | env `TURSO_AUTH_TOKEN` bot & webcard (read-write) |
| `sqld-jwt-ro.token` | env `SQLD_BACKUP_TOKEN` service backup (read-only) |

---

## Fase 0 — Prasyarat (sekali saja)

**0.1 DNS** — di provider DNS `yogaa.web.id`, tambahkan:

```txt
Type: A   Name: bot-db   Value: 43.153.199.221
```

Cek propagasi: `dig +short bot-db.yogaa.web.id` → harus `43.153.199.221`.
Sertifikat HTTPS Coolify akan gagal bila record ini belum benar.

**0.2 Turso API token** (untuk snapshot otomatis oleh service backup):

```bash
# Sekali saja bila Turso CLI belum terpasang:
curl -sSfL https://get.tur.so/install.sh | bash
turso auth login

# Token dengan hak akses seminimal mungkin untuk backup:
# read (list/show), db:create + db:delete (slot snapshot), db:configure,
# db:mint-token (verifikasi via turso db shell).
turso auth api-tokens mint animein-backup \
  --scope read --scope db:create --scope db:delete --scope db:configure --scope db:mint-token
# Output = token-nya. Simpan; dipasang sebagai env TURSO_API_TOKEN.
```

Variasi lebih ketat (batasi ke satu group, mis. `default`) — jalankan
`turso org list` dulu untuk melihat slug org:

```bash
turso auth api-tokens mint animein-backup --org <slug-org> --group default \
  --scope read --scope db:create --scope db:delete --scope db:configure --scope db:mint-token
```

Alternatif tanpa CLI: dashboard Turso → halaman organisasi → **API Tokens** → Create.

**0.3 Preflight VPS:**

```bash
ssh <user>@43.153.199.221 "docker --version && docker ps | head -5 && df -h / && free -h"
```

**0.4 Jaring pengaman** — catat `TURSO_URL` + `TURSO_AUTH_TOKEN` lama (dari
`.env`) di tempat aman. DB Turso lama **jangan dihapus** sampai sistem baru
stabil 1–2 minggu.

---

## Fase 1 — Generate kunci & token (di laptop)

```bash
npm run sqld:keygen     # = node scripts/sqld-keygen.js
```

Yang dihasilkan (folder `secrets/`):
lihat tabel "Output kunci" di atas. Catat nilai `SQLD_AUTH_JWT_KEY`.

Rotasi kunci (token lama langsung mati): `npm run sqld:keygen -- --force`.
Perbarui token tanpa mengganti kunci server: `npm run sqld:keygen -- --from-key`.

---

## Fase 2 — Siapkan folder + script backup di VPS

```bash
ssh <user>@43.153.199.221 'sudo mkdir -p /data/animein-sqld /data/animein-backup'
scp scripts/sqld-backup-turso.sh <user>@43.153.199.221:/tmp/backup.sh
ssh <user>@43.153.199.221 'sudo mv /tmp/backup.sh /data/animein-backup/backup.sh'
```

> Jalankan **sebelum** deploy. Container `backup` menunggu file
> `/backup/backup.sh` muncul, tapi lebih rapi kalau sudah ada dari awal.
> Tidak perlu install apa pun di VPS — semua berjalan di dalam container.

---

## Fase 3 — Coolify: project → compose → deploy

Asumsi Coolify sudah terinstall (mis. di `db.yogaa.web.id`) dan project masih kosong.

**3.1 Buat project** — sidebar **Projects** → **+ Add** → Name: `animein` → **Create**.
Environment `production` dibuat otomatis.

**3.2 Buat resource** — dalam project → **+ New Resource** → bagian *Docker Based*
→ pilih **Docker Compose** (opsi paste/empty, bukan dari Git) → nama `animein-sqld`.

**3.3 Paste compose berikut:**

```yaml
services:
  sqld:
    image: ghcr.io/tursodatabase/libsql-server:latest
    restart: unless-stopped
    environment:
      - SQLD_NODE=primary
      - SQLD_AUTH_JWT_KEY=${SQLD_AUTH_JWT_KEY}
    volumes:
      - /data/animein-sqld:/var/lib/sqld
    expose:
      - "8080"
    healthcheck:
      test: ["CMD-SHELL", "bash -c 'exec 3<>/dev/tcp/127.0.0.1/8080'"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 15s

  backup:
    image: alpine:3.20
    restart: unless-stopped
    depends_on:
      - sqld
    environment:
      - SQLD_URL=http://sqld:8080
      - SQLD_TOKEN=${SQLD_BACKUP_TOKEN}
      - TURSO_API_TOKEN=${TURSO_API_TOKEN}
      - BACKUP_KEEP_DAYS=7
      - BACKUP_INTERVAL_SECONDS=86400
      - SKIP_TURSO=${SKIP_TURSO}
      - ALERT_WEBHOOK_URL=${ALERT_WEBHOOK_URL}
    volumes:
      - /data/animein-backup:/backup
    command:
      - /bin/sh
      - -c
      - "while [ ! -f /backup/backup.sh ]; do echo 'menunggu /backup/backup.sh ...'; sleep 5; done; exec /bin/sh /backup/backup.sh --loop"
```

Volume sudah didefinisikan di YAML (tab *Storages* akan menampilkannya otomatis).

**3.4 Environment Variables** (sidebar *Environment Variables* → Add):

| Key | Value |
|---|---|
| `SQLD_AUTH_JWT_KEY` | isi `secrets/sqld-jwt-pub.b64` |
| `SQLD_BACKUP_TOKEN` | isi `secrets/sqld-jwt-ro.token` |
| `TURSO_API_TOKEN` | token dari Fase 0.2 |
| `ALERT_WEBHOOK_URL` *(opsional)* | Discord webhook — notifikasi bila backup gagal |
| `SKIP_TURSO` *(opsional)* | `1` = lewati snapshot Turso (uji coba); kosongkan untuk mode normal |

**3.5 Domains** (sidebar *Domains* → Add domain):

- Protocol: `https`
- Domain: `bot-db.yogaa.web.id`
- **Port: `8080`**
- Service: `sqld`

Port 8080 tidak perlu dibuka di firewall — reverse proxy Coolify meneruskan
traffic dari 443.

**3.6 Deploy** — tombol **Deploy**. Tunggu sampai kedua service `running`.
(Label UI bisa berbeda antar versi Coolify; cari kata kunci yang sama.)

> Catatan: resource Compose tidak memakai tab Health Check Coolify —
> healthcheck sqld ditulis di YAML di atas.

---

## Fase 4 — Smoke test koneksi (dari laptop)

```bash
node scripts/sqld-import.js --check \
  --url https://bot-db.yogaa.web.id --token "$(cat secrets/sqld-jwt.token)"
```

Harus muncul: `[check] database kosong (belum ada tabel user).`

| Gejala | Kemungkinan |
|---|---|
| `401/403` | `SQLD_AUTH_JWT_KEY` bukan versi `.b64`, atau sqld belum redeploy setelah env diubah |
| `fetch failed` | DNS belum propagasi / container sqld mati |
| `503 no available server` | Backend sqld tidak tersedia di proxy — deploy gagal/belum jalan, container mati, atau domain salah service/port (lihat tabel Troubleshooting) |
| `502` | Port domain bukan 8080 / service `sqld` tidak running |

---

## Fase 5 — Migrasi data dari Turso lama

Host didapat dari `TURSO_URL` lama (`libsql://<host>.turso.io` → pakai `https://`).

**5.1 Dump dari Turso lama** — Turso Cloud **tidak mengekspos `GET /dump`**
(beda dengan sqld self-hosted), jadi pakai export resmi CLI + `sqlite3`:

```bash
turso db list   # lihat nama DB lama, mis. "botlog-restore" (host = <db>-<org>.turso.io)
turso db export botlog-restore --output-file backups/turso-lama-export.db --overwrite
sqlite3 backups/turso-lama-export.db '.dump' > "backups/turso-lama-$(date +%F).sql"
wc -c backups/turso-lama-*.sql
```

> `sqlite3` modern menulis string ber-karakter kontrol sebagai
> `unistr('\u000a…')` dan menyertakan `CREATE TABLE sqlite_sequence` di blok
> `writable_schema`; `sqld-import.js` menangani keduanya otomatis
> (rewrite `unistr` → literal biasa, skip tabel internal).

**5.2 Cek isi dump (opsional):**

```bash
node scripts/sqld-import.js --dry-run --dump "backups/turso-lama-$(date +%F).sql"
```

**5.3 Import ke sqld:**

```bash
node scripts/sqld-import.js \
  --dump "backups/turso-lama-$(date +%F).sql" \
  --url https://bot-db.yogaa.web.id --token "$(cat secrets/sqld-jwt.token)"
```

Jika import pernah gagal setengah jalan, ulangi dengan tambahan `--wipe`.

**5.4 Bandingkan isi kedua DB** (script yang sama, dua target):

```bash
node scripts/sqld-import.js --check --url "https://<host>.turso.io" --token "<TOKEN_LAMA>"
node scripts/sqld-import.js --check --url https://bot-db.yogaa.web.id --token "$(cat secrets/sqld-jwt.token)"
```

Angka per tabel harus sama (tabel `sqlite_%` tidak dihitung).

**5.5 Refresh snapshot** — setelah import sukses, **Restart** service `backup`
dari Coolify supaya snapshot hari ini berisi data asli (bukan snapshot DB kosong
dari saat deploy).

---

## Fase 6 — Cutover

**6.1 Bot (Render):** dashboard Render → service bot → *Environment* → ubah:

```txt
TURSO_URL=https://bot-db.yogaa.web.id
TURSO_AUTH_TOKEN=<isi secrets/sqld-jwt.token>
```

→ Save (auto-redeploy). Cek log: `[DB] Turso Database connected & Tables ready.`

**6.2 Webcard (Coolify):** env yang sama, lalu redeploy.
Bila belum ada di Coolify, lewati dulu — tidak memengaruhi migrasi.

**6.3 Lokal (opsional):** update `.env` dan `web-cards/.env.local` dengan nilai sama.
Saat cutover, kredensial DB lama simpan ke `secrets/turso-lama.env` (untuk rollback/refresh).

**Rollback kapan saja:** balikkan kedua env ke nilai Turso lama (ada di `secrets/turso-lama.env`) → restart.
Tidak ada data yang hilang di sqld.

---

## Fase 7 — Verifikasi backup + restore drill

**7.1** Log service `backup` di Coolify. Sukses = baris:

```txt
[backup] verifikasi OK: settings=...
[backup] SELESAI: /backup/sqld-<tanggal>.sql
```

**7.2** Cek dari laptop:

```bash
turso db list                                  # harus ada animein-bk-<hari ini>
turso db shell animein-bk-<hari> "SELECT count(*) FROM settings"
```

**7.3 Restore drill (sekali, wajib):**

```bash
turso db create animein-restore-test --from-db animein-bk-<hari>
turso db show animein-restore-test --url       # catat host-nya
turso db tokens create animein-restore-test
node scripts/sqld-import.js --check --url "https://<host-dari-show>" --token "<token-baru>"
turso db destroy animein-restore-test --yes    # bersihkan setelah puas
```

---

## Fase 8 — Operasional

| Kegiatan | Cara |
|---|---|
| Retensi | Otomatis: dump lokal 7 hari; snapshot Turso 7 slot (`animein-bk-mon` … `sun`) |
| Interval backup | Ubah env `BACKUP_INTERVAL_SECONDS` service backup (default 86400) |
| Upgrade sqld | Ganti tag image di compose (pin versi, mis. `:v0.24.32`) → Deploy |
| Rotasi kunci | `npm run sqld:keygen -- --force` → update `SQLD_AUTH_JWT_KEY` + 2 token di Coolify + Render → redeploy sqld, restart bot/webcard |
| Perbarui token saja | `npm run sqld:keygen -- --from-key` → update token di Coolify + Render |
| Cek disk | `df -h /` — dump lokal dibersihkan otomatis; data inti di `/data/animein-sqld` |
| Backup lokal tanpa Turso | Set env `SKIP_TURSO=1` di Coolify, restart service `backup` (atau `SKIP_TURSO=1 sh scripts/sqld-backup-turso.sh` saat uji lokal) |

**Yang JANGAN dilakukan:**

- Scale service `sqld` lebih dari 1 replika.
- Mount `/data/animein-sqld` ke container lain (satu penulis saja).
- Hapus DB Turso lama sebelum 1–2 minggu stabil.

---

## Troubleshooting

| Gejala | Sebab umum | Aksi |
|---|---|---|
| `401/403` saat `--check` | Public key / token tidak cocok | Pastikan `SQLD_AUTH_JWT_KEY` dari `sqld-jwt-pub.b64` (bukan PEM), redeploy sqld |
| `403` saat import | Memakai token read-only | Pakai `secrets/sqld-jwt.token` (read-write) |
| `503 no available server` di domain | Traefik menemukan domain tapi backend sqld tidak tersedia: deploy belum jalan/gagal, container `sqld` mati/unhealthy, atau domain diarahkan ke service/port yang salah | Cek di Coolify: status Deployments, status + log service `sqld`, lalu tab Domains (domain, port 8080, service `sqld`) → Redeploy |
| Error `resp.body?.cancel is not a function` | Bug tampilan `hrana-client` (via cross-fetch) saat server membalas non-JSON, biasanya 502/503 dari proxy — error aslinya tersamarkan | Script `sqld-import.js` sekarang preflight otomatis ke `/health`; jalankan manual: `curl -sS https://bot-db.yogaa.web.id/health` (200 = sehat, `no available server` = masalah Coolify di atas) |
| `502` di domain | Traefik sudah menemukan backend tapi koneksi ke container gagal: port domain bukan 8080 / mengarah ke service yang salah (mis. `backup`), atau sqld restart-loop | Cek tab Domains (port `8080`, service `sqld`) + status/log container |
| Cert HTTPS gagal | DNS belum propagasi | Cek `dig`, tunggu, Deploy ulang |
| Container `backup` restart-loop | `/data/animein-backup/backup.sh` belum ada | Jalankan Fase 2, restart service |
| Log backup: `installer Turso CLI keluar dengan error` / `Turso CLI tidak bisa dijalankan` | VPS tidak bisa keluar internet, atau binary CLI gagal dieksekusi | Cek egress DNS dari VPS; `gcompat` + `libc6-compat` dipasang otomatis oleh `ensure_turso` |
| Log backup: `turso: not found` padahal baris "install Turso CLI..." muncul | Binary turso rilis resmi = **glibc**, image `alpine` = musl → exec gagal ("not found" ala ENOENT) | Sudah otomatis: `ensure_turso` memasang `gcompat` lalu verifikasi `turso --version` |
| Log backup: `TURSO_API_TOKEN kosong` | Env belum diisi | Isi di tab Environment Variables |
| `turso db create ... gagal` | Token Turso kurang scope / invalid / limit | Mint ulang dengan scope dari Fase 0.2; cek `turso db list` dari VPS |
| Snapshot kosong / `verifikasi GAGAL` walau create exit 0 | `turso db create --from-dump` rusak di platform Turso saat ini (upload "sukses" + exit 0, tapi DB hasilnya kosong) | Sudah diganti: script build `.db` via `sqlite3` lalu `--from-file`. Kalau masih muncul, cek manual: `turso db shell animein-bk-<hari> "SELECT count(*) FROM settings"` (harus `38`) |
| Log sqld: `database is locked` | Ada container lain memegang volume | Pastikan hanya sqld yang mount `/data/animein-sqld` |
| Import bilang "target sudah punya tabel" | Target tidak kosong | Tambah `--wipe` (data target akan dihapus) |
| Error `no such function: unistr` saat import | Dump dari `sqlite3` modern (string escape `unistr()`) | Sudah otomatis ditangani `sqld-import.js` (rewrite ke literal); pastikan script versi terbaru |
| Dump Turso Cloud 404 `route not found: dump` | Turso Cloud tidak mengekspos `GET /dump` | Pakai `turso db export` + `sqlite3 .dump` (Fase 5.1) |

---

## Rollback Penuh (skenario terburuk)

1. Arahkan `TURSO_URL` + `TURSO_AUTH_TOKEN` bot/webcard ke salah satu DB:
   - DB Turso lama (kondisi saat cutover; kredensial di `secrets/turso-lama.env`), atau
   - snapshot terbaru: `turso db show animein-bk-<hari> --url` +
     `turso db tokens create animein-bk-<hari>`.
2. Restart bot; verifikasi log.
3. Perbaiki sqld di VPS (log container), lalu cutover lagi bila siap.
