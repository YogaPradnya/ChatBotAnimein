# ChatBotAnimein

Bot chat Animein (AnimeinWeb) + dashboard admin. Web kartu gacha/battle hidup di repo terpisah.

## Struktur repo

Repo ini (`ChatBotAnimein`):

- `bot.js` — entry point bot (`npm start`)
- `dashboard.js` + `src/dashboardServer.js` — panel admin (login via `DASHBOARD_USER`/`DASHBOARD_PASS`)
- `src/` — commands, services, database (libsql/Turso), pipeline
- `scripts/backup-db.sh` — dump Turso ke SQL / copy SQLite lokal ke `backups/` (`npm run backup`)
- `web-cards/` — **di-ignore git**, isinya checkout terpisah dari repo `YogaPradnya/webcard`
- `animein.db` — sisa lama 0 byte, tidak dipakai (data live di Turso)

Repo web kartu (`YogaPradnya/webcard`, Next.js):

- `src/app/` — halaman book, battle, gacha, trade, profile, shop, missions
- `src/components/ThemeToggle.js` — toggle dark/white mode (`localStorage animein-theme`)
- Role colors: Damage merah, Tank coklat, Healer hijau, Support biru, Assassin merah tua, Mage ungu (lihat `web-cards/src/app/book.css`)

## Deploy (Coolify, VPS `43.153.199.221`)

| Domain | Repo | Branch |
|---|---|---|
| `kartu.yogaa.web.id` | `YogaPradnya/webcard` | `main` |
| `db.yogaa.web.id` | panel Coolify (`:8000` via reverse proxy) | — |

Bot dijalankan dari repo ini. Tiap repo punya Auto Deploy sendiri — push ke satu repo tidak me-redeploy yang lain.

## Env penting

Bot (`.env`): `TURSO_URL`, `TURSO_AUTH_TOKEN`, kredensial Animein, `DASHBOARD_USER/PASS`, `WEB_LOGIN_PROXY_SECRET`, API keys AI.
Web (`web-cards/.env.local`): `TURSO_URL`, `TURSO_AUTH_TOKEN` (DB yang sama dengan bot), `DASHBOARD_LOGIN_URL`, dan `WEB_LOGIN_PROXY_SECRET` yang sama dengan bot.
Jangan commit `.env` / `.env.local`.

Login web punya dua metode:

1. **Username/email + password Animein** — web mengirim permintaan bertanda HMAC
   ke dashboard Render (`/internal/auth/animein`), dashboard memverifikasi ke
   Animein, lalu web mencocokkan `user.id` dengan `user_stats`. Password tidak
   disimpan dan `key_client` tidak pernah dikirim ke web.
2. **Kode Login** — user membuka tab "Kode Login" di halaman login,
   menekan Dapatkan Kode, lalu mengirim `.login KODE` ke bot dari akun yang
   sudah `.daftar`. Kode berlaku 5 menit dan sekali pakai.

Sebelum login dengan metode apa pun, user perlu mengetik `.daftar` di chat agar
datanya tercatat di `user_stats`.

## Backup

Data utama di Turso. `npm run backup` membuat dump SQL ke `backups/` (retensi 7 hari, gitignore).
File dump menempel di disk VPS — mount persistent storage ke `backups/` bila ingin tahan redeploy.
