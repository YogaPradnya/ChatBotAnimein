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
- Role colors: Damage merah, Tank coklat, Support hijau, Assist biru (lihat `src/app/globals.css`)

## Deploy (Coolify, VPS `43.153.199.221`)

| Domain | Repo | Branch |
|---|---|---|
| `kartu.yogaa.web.id` | `YogaPradnya/webcard` | `main` |
| `db.yogaa.web.id` | panel Coolify (`:8000` via reverse proxy) | — |

Bot dijalankan dari repo ini. Tiap repo punya Auto Deploy sendiri — push ke satu repo tidak me-redeploy yang lain.

## Env penting

Bot (`.env`): `TURSO_URL`, `TURSO_AUTH_TOKEN`, kredensial Animein, `DASHBOARD_USER/PASS`, API keys AI.
Web (`web-cards/.env.local`): `TURSO_URL`, `TURSO_AUTH_TOKEN` (DB yang sama dengan bot).
Jangan commit `.env` / `.env.local`.

## Backup

Data utama di Turso. `npm run backup` membuat dump SQL ke `backups/` (retensi 7 hari, gitignore).
File dump menempel di disk VPS — mount persistent storage ke `backups/` bila ingin tahan redeploy.
