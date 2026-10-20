# API Dashboard (ringkas, P2 hygiene)

Basis: `src/dashboardServer.js` (`startDashboard`), auth cookie `dashboard_session`
kecuali `/health`, `/login`, `/logout`, dan `/internal/auth/animein`.
Rate-limit API: 60 req/menit/IP. Endpoint internal memakai HMAC
`WEB_LOGIN_PROXY_SECRET`, bukan cookie admin.

## Sistem & health

| Method | Path | Keterangan |
|---|---|---|
| GET | `/health` | Status dashboard/bot, uptime (publik) |
| GET | `/login` | Halaman login (publik) |
| POST | `/login` | Login form `username,password` (publik) |
| POST | `/internal/auth/animein` | Verifikasi kredensial Animein untuk web; HMAC `X-Web-Timestamp` + `X-Web-Signature` |
| GET | `/logout` | Hapus sesi |
| GET | `/api/stats` | Statistik bot, cache AI, kuis aktif, realtime logs, latensi provider (`providerLatency`), injeksi diblokir (`injectionBlocked`) |
| GET | `/api/logs/stream` | SSE realtime logs (disarankan untuk dashboard; gantikan polling 5s) |
| POST | `/api/logs/purge` | Hapus realtime logs |
| POST | `/api/system/toggle` | Kill switch ON/OFF |
| POST | `/api/chat/send` | Kirim chat teks via bot |
| POST | `/api/chat/send-image` | Kirim gambar via bot |

Signature endpoint internal: `HMAC-SHA256(secret, timestamp + "." + "POST" +
"." + path + "." + SHA256(rawBody))`, dikirim sebagai hex di
`X-Web-Signature`; `X-Web-Timestamp` berisi Unix detik. Skew lebih dari 60
detik ditolak. Body JSON hanya `{ username, password }`.

## Bot & event

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/bot/toggle` | Toggle role `notif/kuis/info` |
| POST | `/api/config/image-command` | Toggle bot gambar |
| POST | `/api/config/double-xp` | Event XP (`minutes,multiplier`) |
| POST | `/api/config/temperature` | Set temperatur AI 0–2 |
| GET | `/api/config/temperature` | Baca temperatur AI |

## Kuis

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/quiz/config` | Set filter tema (`filter`) |
| POST | `/api/quiz/reset` | Hapus N% quiz_pool (`percent`) |
| GET | `/api/quiz/pool` | List quiz_pool |
| POST | `/api/quiz/trigger` | Trigger kuis manual (`id?`) |
| GET | `/api/quiz/banned` | List banned (`q,page,limit`) |
| POST | `/api/quiz/ban` | Ban kuis (`userId/username,reason`) |
| POST | `/api/quiz/unban` | Unban kuis |
| POST | `/api/quiz/refetch` | Refetch data kuis |
| POST | `/api/quiz/stop` | Hentikan kuis aktif |
| GET | `/api/quiz/weekly` | Top 10 turnamen mingguan + juara minggu lalu |

## Filter & auto-reply

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/filter` | Daftar kata filter + response |
| POST | `/api/filter/add` | Tambah kata (`word`) |
| POST | `/api/filter/delete` | Hapus kata (`word`) |
| POST | `/api/filter/save-response` | Simpan response filter |
| GET | `/api/autoreply` | List auto-reply |
| POST | `/api/autoreply/add` | Tambah auto-reply |
| POST | `/api/autoreply/delete` | Hapus auto-reply |

## Limit

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/limits/global` | Default limit CMD/IMG + jumlah user |
| POST | `/api/limits/global/update` | Update default limit |
| GET | `/api/limits/commands` | Limit CMD per user (`q,page,limit`) |
| POST | `/api/limits/commands/update` | Update extra/used CMD |
| POST | `/api/limits/commands/reset` | Reset pemakaian CMD |
| GET | `/api/limits/rara-chat` | Limit chat Rara per user |
| POST | `/api/limits/rara-chat/update` | Update limit chat Rara |
| GET | `/api/images/limits` | Limit gambar per user |
| POST | `/api/images/limits/update` | Update limit gambar |
| POST | `/api/images/limits/reset` | Reset pemakaian gambar |

## Ekonomi / user / cache

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/economy/settings` | Harga shop, XP rate, diskon |
| POST | `/api/economy/save` | Simpan harga/XP rate |
| POST | `/api/economy/toggle-xp` | Toggle event XP |
| POST | `/api/economy/toggle-discount` | Toggle diskon toko |
| GET | `/api/users/list` | List user XP (`q,page,limit`) |
| POST | `/api/users/update-xp` | Update XP user |
| POST | `/api/users/reset-all` | Reset semua XP + hapus memories |
| GET | `/api/titles` | List title tersedia |
| POST | `/api/titles/add` | Tambah title |
| POST | `/api/titles/delete` | Hapus title |
| POST | `/api/cache/clear` | Hapus cache AI |
| GET | `/api/cache/list` | List cache AI |
| GET | `/api/cache/get` | Detail cache |
| POST | `/api/cache/update` | Update cache |
| POST | `/api/cache/delete` | Hapus satu cache |
| POST | `/api/notif/clear-cache` | Reset cache notifikasi anime |
| GET | `/api/gacha/stats` | Total pull, legendary, kolektor unik, 5 kartu terlangka |
| GET | `/api/gacha/config` | Config gacha (biaya, limit/hari, pity) |
| POST | `/api/gacha/config` | Simpan config gacha (clamp otomatis) |
| GET | `/api/gacha/cards` | Pool kartu efektif + art ter-resolve |
| POST | `/api/gacha/cards` | Ganti seluruh pool kartu (validasi tier/duplikat) |
| POST | `/api/gacha/cards/reset` | Kembalikan pool ke 80 kartu bawaan |
| POST | `/api/gacha/art` | Set/hapus override gambar 1 kartu (`{name, imageUrl}`; URL kosong = hapus) |
| POST | `/api/gacha/gift` | Gift kartu pool ke user (duplikat menumpuk, maks 999) |
| GET | `/api/gacha/owned?username=` | Koleksi user (`name, quantity, level, rarity`) untuk gift/evolve |
| POST | `/api/cards/evolve` | Evolusi manual (`{username, charName}`): +1 ★, konsumsi N-1 copy; L/M ditolak; ★5 buka skill-2 |

## Provider AI

| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/groq/toggle/:id` | Toggle key Groq |
| POST | `/api/cloudflare/toggle` | Toggle Cloudflare AI |
| POST | `/api/cerebras/toggle` | Toggle Cerebras AI |
| POST | `/api/nvidia/toggle` | Toggle NVIDIA AI |

## Konten / pengetahuan

| Method | Path | Keterangan |
|---|---|---|
| GET | `/api/prompt` | Baca system prompt |
| POST | `/api/prompt/save` | Simpan system prompt |
| GET | `/api/rara/settings` | Baca pengaturan gaya & batas respons Rara |
| POST | `/api/rara/settings` | Simpan pengaturan Rara |
| POST | `/api/rara/preview` | Tes 1 balasan Rara tanpa efek samping |
| GET | `/api/knowledge` | List knowledge |
| POST | `/api/knowledge/save` | Simpan knowledge |
| POST | `/api/knowledge/delete` | Hapus knowledge |
| GET | `/api/knowledge/gaps` | List knowledge gaps (Top 20) |
| DELETE | `/api/knowledge/gaps` | Bersihkan knowledge gaps |
| GET | `/api/domains` | List domain |
| POST | `/api/domains/add` | Tambah domain |
| POST | `/api/domains/delete` | Hapus domain |
| GET | `/api/laporan` | List laporan |
| POST | `/api/laporan/status` | Update status laporan |
| POST | `/api/laporan/delete` | Hapus laporan |
| GET | `/api/debug/trending` | Debug trending |
| GET | `/api/debug/schedule` | Debug jadwal |

> Catatan polling dashboard: `setInterval(refresh, 5000)` tetap ada untuk
> kompatibilitas, tapi `/api/logs/stream` (SSE) sudah tersedia dan sebaiknya
> dipakai agar dashboard tidak polling buta.
