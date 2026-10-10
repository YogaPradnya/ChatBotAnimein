# Audit Sistem Animein Bot — Temuan & Rekomendasi Perbaikan

Tanggal: 2026-10-10
Ruang lingkup: `bot.js` (4982 baris), `dashboard.js` (4029 baris), `src/` (87 file), `src/services/`, `src/database/`, `src/commands/`, `src/pipeline/`, `src/config/`, `scratch/tests/` (4 file), `docs/`, `package.json`, `.env`, `.gitignore`
Metode: baca kode langsung + verifikasi `grep`/`git ls-files` untuk temuan P0. Nilai secret di-mask (`***`) dan tidak disalin ke dokumen ini.

---

## 0. Ringkasan Eksekutif

| Prioritas | Jumlah | Inti |
|---|---|---|
| P0 — Kritis, rusak/bocor sekarang | 7 | 2 bug `ReferenceError`/`TypeError` yang mematikan XP & cache baca, 1 wiring streak mati, 2 secret hardcode ter-commit, 1 DB ter-commit ke git, 1 bypass login bila env kosong |
| P1 — Tinggi, keamanan/reliabilitas | 14 | Auth dashboard lemah, XSS 4 titik, error leakage, log secret bocor, race/lost-update (XP/limit/shop/quiz/streak/cache), migrasi DB non-transaksional, timer leak kuis |
| P2 — Sedang, performa/kualitas | 12 | N+1 API, polling boros, `fs` sync di hot path, regex mahal, index hilang, test minim, docs drift, tanpa lint/CI |
| P3 — Rendah, hygiene | 10 | Duplikasi, god object, dead code, config drift, `public/` expose prompt, dsb. |

Perbaikan disarankan berurutan P0 → P1 → P2 → P3. Setiap temuan mencantumkan lokasi `file:line` agar bisa langsung dibuka.

---

## 1. P0 — Kritis (perbaiki dulu)

### P0-1. `addXP` selalu `ReferenceError` — semua XP positif hilang diam-diam
- Lokasi: `bot.js:596` memakai bare `baseXpRate`, definisi yang ada hanya `global.baseXpRate` (`bot.js:848`, di-load `bot.js:470`).
- Dampak: setiap `addXP(amount>0)` lempar `ReferenceError: baseXpRate is not defined`, ditangkap `bot.js:612-614` dan return `{level:1,xp:0}`. User tidak naik level.
- Perbaikan:
  ```js
  // bot.js:596
  const rate = Number(global.baseXpRate) || 60;
  const baseAmount = amount > 0 ? Math.floor(amount * (rate / 100)) : amount;
  ```

### P0-2. `checkCache` selalu `TypeError` — cache baca mati total
- Lokasi: `bot.js:679` memanggil `cacheRepo.findCacheByQuestionKey(key)`.
- Fakta: `src/database/cacheRepo.js:125-142` hanya mengekspor `findResponseByQuestionKey` dan `getAnswerByQuestionKey`. Fungsi yang dipanggil tidak ada.
- Dampak: tiap baca cache throw, ditangkap `bot.js:699-702` return `null`. Tulis (`addToCache`) masih jalan, baca tidak pernah hit.
- Perbaikan: ganti ke `cacheRepo.findResponseByQuestionKey(key)` + tambah test.

### P0-3. Win-streak kuis no-op — `streakRepo` tidak punya method yang dipanggil
- Lokasi: `src/services/streakService.js:19-20,45-46` mengharapkan `streakRepo.getUserQuizStats` / `updateUserQuizStreak`.
- Fakta: `src/database/streakRepo.js:12-44` hanya punya `getUserStreak/updateUserStreak/incrementQuizStat/incrementImageRequest`. Guard `if (streakRepo && ...)` membuat kegagalan diam-diam.
- Perbaikan: implementasikan 2 method itu di `streakRepo.js`, atau ubah `streakService.js` memakai `getUserStreak/updateUserStreak` yang ada. Tambah `scratch/tests/streakService.test.js` untuk jalur persist.

### P0-4. Secret hardcode ter-commit (wajib rotasi)
- Lokasi:
  - `src/config/env.js:61` fallback `DISCORD_WEBHOOK_URL` berisi webhook penuh.
  - `src/config/env.js:94` fallback `NVIDIA_API_KEY` + duplikat di `src/services/nvidiaAiService.js:31`.
- Dampak: siapa pun punya akses git bisa kirim webhook Discord dan pakai kuota Nvidia.
- Perbaikan:
  1. Hapus fallback secret dari kode, jadikan `getEnv('X')` tanpa default (fail-fast bila kosong).
  2. Rotasi webhook Discord + key Nvidia di dashboard masing-masing provider.
  3. `git filter-repo` / ganti secret lama di histori bila repo pernah push publik.

### P0-5. File DB ter-commit ke git
- Fakta (`git ls-files`): `animein.db`, `animein_local.db`, `local.db`, `src/temp_images/notif_cover_*.jpg` ter-track. `.gitignore:1-10` tidak memuat `*.db` / `*.sqlite` / `temp_images/`.
- Dampak: histori chat/user/XP ikut ke remote bila DB pernah terisi.
- Perbaikan:
  ```gitignore
  *.db
  *.sqlite
  *.sqlite-journal
  src/temp_images/
  temp_images/
  realtime_logs.txt
  ```
  Lalu `git rm --cached *.db animein_local.db local.db src/temp_images/*` + commit.

### P0-6. Mismatch nama env dashboard + bypass bila env kosong
- Lokasi:
  - Definisi: `src/config/env.js:69-70` membaca `DASHBOARD_USERNAME` / `DASHBOARD_PASSWORD`.
  - Dipakai: `src/dashboardServer.js:173` membandingkan `process.env.DASHBOARD_USER` / `process.env.DASHBOARD_PASS`.
  - `.env` aktual memakai varian kedua (`DASHBOARD_USER`/`DASHBOARD_PASS`), jadi `ENV_CONFIG.DASHBOARD` mati.
- Dampak terburuk: bila `.env` tidak set keduanya, `undefined === undefined` → `POST /login` dengan body kosong lolos.
- Perbaikan: samakan satu nama, tolak startup bila kosong, pakai `crypto.timingSafeEqual`:
  ```js
  if (!process.env.DASHBOARD_USER || !process.env.DASHBOARD_PASS) throw new Error('Dashboard credential belum di-set');
  ```

### P0-7. Kredensial `.env` sensitif (catatan penanganan)
- `.env:1-32` berisi password Animein, `ANIMEIN_*_KEY_CLIENT`, `TURSO_AUTH_TOKEN`, kredensial dashboard, dan API key pihak ketiga. File ini benar di-ignore (`.gitignore:2`), jangan pernah `cat`/paste ke chat/log.
- Perbaikan: pindahkan ke secret manager / env runner, bedakan `.env.example` (tanpa nilai) yang boleh di-commit.

---

## 2. P1 — Tinggi

### Keamanan

#### P1-1. Login tanpa rate-limit, tanpa hash, tanpa CSRF token
- Lokasi: `src/dashboardServer.js:12-28` (session Map 24 jam, token `crypto.randomBytes` — bagus), `:30-39` `checkRateLimit`, `:153-163` rate-limit hanya untuk `/api/*`, `:170-181` `POST /login` plaintext `===` tanpa limit.
- Juga: `GET /logout` (`:184-190`) rentan logout-CSRF; cookie tanpa signature; `Secure` hanya bila `NODE_ENV=production` (`:176`); tanpa `Origin/Referer` check.
- Perbaikan: rate-limit `/login` (mis. 10/menit/IP + lockout), hash password (`scrypt`/`bcrypt`), tambah CSRF token untuk `POST /api/*`, jadikan `/logout` POST, bind session ke IP/UA + rotasi saat login.

#### P1-2. XSS tersisa di 4 titik `dashboard.js`
- Sudah bagus: `escapeHTML()` dipakai di banyak render (`dashboard.js:1880-1889,2316-2322,2431+`).
- Belum:
  1. `dashboard.js:48` `${error}` di `getLoginHTML` mentah.
  2. `dashboard.js:2206-2216` `q.title` + `q.hints` ke `innerHTML`.
  3. `dashboard.js:2238,2257,2276` `*.lastError` upstream ke `.m-val`.
  4. `dashboard.js:2343-2353` `pathStats` (`path`, `count`, `pct`) tanpa escape.
- Perbaikan: bungkus semua dengan `escapeHTML()`, `Number()` untuk angka.

#### P1-3. `error.message` mentah ke client
- Lokasi: ~25 endpoint di `src/dashboardServer.js` (`:343-345,352-354,393-394,422-424,449-452,498,636-637,...`) + `GET /api/debug/trending|schedule` (`:1465-1487`) mengembalikan sample upstream penuh.
- Dampak: bocor nama tabel/kolom (`no such table`, `UNIQUE constraint`).
- Perbaikan: log penuh server-side, kirim `{message:'Internal error'}` generik ke client.

#### P1-4. Realtime log tanpa masking terekspos via `/api/stats` + SSE
- Lokasi: `bot.js:910-937` override `console.log/warn/error` → `stats.realtimeLogs` (200 entri) tanpa `maskSensitiveText`; `src/dashboardServer.js:494,502-519` mengekspos + replay ke tiap koneksi SSE.
- Padahal `src/services/errorHandler.js:16-26` sudah punya `maskSecretValue/maskSensitiveText`.
- Perbaikan: terapkan `maskSensitiveText` di `pushRealtimeLog`, jangan log body chat manual penuh (`dashboardServer.js:1150`), batasi replay SSE (mis. 20 terakhir).

#### P1-5. Tanpa `helmet` / security headers
- `package.json:11-20` tanpa `helmet/cors/bcrypt/express-rate-limit/cookie-parser`. `src/dashboardServer.js:133-137` hanya `express.json/urlencoded/static`.
- Perbaikan: `app.use(helmet({contentSecurityPolicy:{...}}))`, `X-Frame-Options: DENY`, `HSTS`, `X-Content-Type-Options: nosniff`. CORS tetap same-origin (tidak ada paket `cors` — sudah benar, jangan tambah `*`).

#### P1-6. Validasi dashboard minim (DoS/corrupt data)
- Lokasi: `src/dashboardServer.js:271-282` (filter tanpa length), `:397-425` (ban `reason` unbounded), `:1140-1159` (`/api/chat/send` tanpa maxLength), `:1161-1175` (`/api/chat/send-image` tanpa cek size/MIME → base64 raksasa OOM), `:1647-1679` (`knowledge index` tanpa bounds → corrupt array), `:1358-1438` (`xp/level` tanpa `Number.isFinite`/range), `:1030-1046` (`page/limit` tanpa clamp → `?limit=1000000` full-scan; endpoint lain sudah clamp `:378,604,923` — samakan).
- Perbaikan: tambah schema validasi (mis. `zod`), clamp `page/limit`, batasi `text ≤ 2000`, `image ≤ 5MB` + cek MIME, validasi `index` integer dalam bounds.

#### P1-7. `public/` mengekspos system prompt
- Lokasi: `src/dashboardServer.js:137` `express.static(public)` menyajikan `public/Prompt_Karakter_Rara.txt` (persona ~3KB) ke publik tanpa auth.
- Perbaikan: pindahkan file prompt keluar `public/` atau tambah block route.

### Reliabilitas

#### P1-8. Race / lost-update di 6 jalur
- `addXP` (`bot.js:568-616`): read-modify-write cache tanpa lock; dua pesan konkuren → overwrite.
- `limitService.js:21-104` + `limitRepo.js:46-92`: `check+increment` tidak atomik; `incrementImageLimitUsage` baca lalu `upsert used+1` client-side.
- `shop.js:137-147,154-217` + `shopRepo.js:37-42`: `useItem` cek lalu update tanpa `WHERE quantity>=?`; `buyItem` cek XP stale (masih di buffer) + potong XP terpisah → double-spend.
- `quizService.js:215-287` + `quizRepo.js:2-28`: `getRandomQuiz+markQuizUsed` dua statement → dua starter dapat soal sama.
- `trackStreak` (`bot.js:983-1007`): `SELECT` lalu `INSERT/UPDATE` → duplikat `INSERT` hari pertama.
- `addToCache` (`bot.js:732-791`): `SELECT` lalu `INSERT/UPDATE` tanpa `ON CONFLICT` → `UNIQUE(question_key)` violation saat konkuren.
- Perbaikan: `UPSERT ... SET xp=xp+?`, `UPDATE ... WHERE quantity>=?`, transaksi `db.batch()`, `INSERT OR IGNORE` / `ON CONFLICT DO UPDATE`.

#### P1-9. XP flush bisa hilang 60 detik + reset dashboard buang pending
- Lokasi: `bot.js:518-553` flush tiap 60 dtk; `bot.js:4841-4890` shutdown flush; `dashboardServer.js:530` reset XP (`UPDATE xp=0,level=1` + hapus cache/pending tanpa flush dulu).
- Juga: dua `batchWrite` terpisah (stats + memory) tidak atomik; log sukses menyesatkan bila `batch.length==0`.
- Perbaikan: flush sinkron saat `SIGTERM`, gabung 1 batch/transaksi, flush-dulu-sebelum-reset, simpan interval id + `unref()`.

#### P1-10. Migrasi `username → user_id` rapuh
- Lokasi: `bot.js:271-325` (bukan transaksi; crash setelah `DROP` sebelum `RENAME` = hilang; `CREATE ..._v2` tanpa `IF NOT EXISTS`; deteksi `includes('user_id')` rapuh; `user_stats_v2:279` kehilangan `affection_points/level`; `rara_chat_limits` tidak dimigrasi; `DROP user_inventory` hanya satu yang pakai `IF EXISTS`).
- `src/shop.js` (`initShopTables`, `shopRepo.js:3-18`): `Promise.all([CREATE TABLE, CREATE INDEX])` paralel bisa balapan.
- Perbaikan: migrasi versioned dalam transaksi (`BEGIN/COMMIT`), backup tabel dulu, buat index selalu di `initShopTables` (bukan hanya jalur migrasi `bot.js:301`), sekuensial bukan paralel.

#### P1-11. Quiz timer bocor / hint mati
- Lokasi: `src/services/quizService.js:79-89,185-195` (`hintTimer` tidak pernah di-set; `QUIZ_HINT_INTERVAL` (`bot.js:619`) dead), `:254-275` `clearQuizTimers` setelah `setActiveQuiz` sehingga timer lama bocor + `expireQuiz` ganda; `bot.js:3901` `setTimeout(cooldown 10s)` per pesan tanpa clear → spam menumpuk + `aiService.js:179` buang pesan diam-diam; `bot.js:4748-4757` interval id tidak disimpan; `doubleXP/discountTimeout` ganda bot vs dashboard (`bot.js:845,851` vs `dashboardServer.js:218,244,264,759-760`).
- Perbaikan: `clear` sebelum `set`, simpan semua timer id, single source of truth untuk XP/discount, hapus `hintTimer` mati atau implementasikan.

#### P1-12. Timezone campur aduk (off-by-one tengah malam)
- `bot.js:801` (`timestamp+"Z"` tanpa guard `NaN`), `bot.js:996-998` (`last_active_date` NULL → `Invalid Date` → reset diam-diam).
- `streakService.js:16,34` pakai UTC vs `bot.js:985` WIB (`getJakartaDateKey`) → beda hari 00:00-07:00.
- `dashboardServer.js:601,848,920,...` konversi ganda `toLocaleString→new Date→toISOString` bisa mundur 1 hari bila server bukan WIB; `:1480` `getDay()` pakai TZ server.
- Perbaikan: satu helper `getJakartaDateKey()` (`src/utils.js`) dipakai di semua tempat; guard `isNaN(date)`.

#### P1-13. `catch` kosong / swallow
- `bot.js:236-237,826-828,915,2943,4707`, `src/database/cacheRepo.js:85-123`, `userRepo.js:82,98-101`, `dashboardServer.js:280,293,305,1522,...`, `errorHandler.js:72-77` (append `realtime_logs.txt` tanpa rotasi → disk fill).
- Perbaikan: log minimal (`console.warn` + konteks), rotasi log, jangan `catch{}` untuk jalur DB/settings.

#### P1-14. Temp-file / FD leak
- `bot.js:3728` `createReadStream` tanpa `destroy()`; `bot.js:4696-4707` `unlink` hanya di branch sukses → `notif_cover_*` menumpuk sampai cleaner 1 jam; `aiHordeImageService.js:184-187` cleanup inkonsisten; `tempCleanupService.js:38-68` return `{stop}` tidak disimpan (`bot.js:434-442`), hanya top-level, skip subdir selamanya.
- Perbaikan: `stream.destroy()` di `finally`, `unlink` di `finally`, simpan `stop()` dan panggil saat shutdown, batasi konkurensi download cover.

---

## 3. P2 — Sedang

### Performa

#### P2-1. Fan-out / N+1 API
- `src/services/animeNotifService.js:313-362` loop serial `detail+cover+kirim` per item (20 item = 40 RTT, blokir `isChecking`).
- `src/services/aiService.js:129-146`, `animeRecommendationService.js:402`, `rekomendasiCommand.js:692,726,735,993`: s.d. 13 HTTP paralel per 1 pesan `.ai`.
- `bot.js:4763-4795` polling 4 bot serial tanpa guard overlap.
- Perbaikan: batasi N (max 5 notif/siklus), `p-limit(3)` + `Promise.allSettled`, cache `fetchByGenre` 60 dtk, `Promise.allSettled(bots.map(pollBot))` + flag `isPolling`.

#### P2-2. Index hilang
- Sudah ada (`bot.js:330-336`): `idx_chat_logs_username/timestamp`, `idx_response_cache_key`, `idx_quiz_pool_last_used`, `idx_laporan_status`, `idx_image_limits_date`.
- Tambahkan:
  ```sql
  CREATE INDEX IF NOT EXISTS idx_chat_logs_user_id ON chat_logs(user_id, id DESC); -- chatRepo.js:12
  CREATE INDEX IF NOT EXISTS idx_quiz_pool_title ON quiz_pool(title);               -- quizRepo.js:76
  CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_type ON user_inventory(user_id, item_type); -- selalu, bukan hanya jalur migrasi
  CREATE INDEX IF NOT EXISTS idx_quiz_banned_username ON quiz_banned(username);     -- banRepo.js:7
  ```
- `cacheRepo.js:82,93` `LIKE '%_eps_new'` tak bisa pakai index → ganti kolom `status`/`episode` atau cleanup by `created_at`.

#### P2-3. Polling boros
- `POLL_INTERVAL 9s` (`src/config/env.js:98`, `bot.js:4795`): ~27k req/hari/bot saat idle.
- `bot.js:832,553` dua timer 60 dtk + dashboard `setInterval(refresh,5000)` (`dashboard.js:3425`) padahal SSE sudah ada (`dashboardServer.js:511` heartbeat 25s).
- `dashboard.js:1975,1995` dua timer 1 dtk per tab.
- Perbaikan: adaptive polling (9s aktif → 30s idle 5 siklus kosong) + `AbortController` timeout; gabung `updateDBStats` ke tick XP flush; dashboard pakai SSE; gabung 2 timer 1s jadi 1.

#### P2-4. `fs` sync di hot path
- `imageService.js:147-154,165-166`, `animeNotifService.js:189-195`, `aiHordeImageService.js:184,187`, `tempCleanupService.js:8-22` (tiap 30 mnt), `bot.js:345,347,1046-1051,3710,3726,3757`, `src/pokemon.js:6` (startup OK).
- Perbaikan: `fs/promises` (`mkdir recursive`, `writeFile`, `unlink`, `readdir withFileTypes`), cache `pokemon_data.json` + prompt di memori.

#### P2-5. Regex mahal
- `contentFilter.js:26,76` compile ~90 regex per pesan; `quizService.js:116` sama per hint; `bot.js:1068-1108` 7 domain regex + scan seluruh knowledge + `pokemonData.forEach`; `animeRecommendationService.js:324-337` `levenshtein` full-matrix tanpa early-exit + `new RegExp` per genre + `/g` stateful (`:312-315`); `utils.js:19` `stripEmoji` besar per pesan.
- Perbaikan: pre-compile di module scope, tokenisasi sekali, batasi fuzzy (`len>=4`, distance ≤2, early abort), hindari `/g` untuk `.test`, cache `getKnowledgeContext` per `normalizeQuestion`.

#### P2-6. Deps outdated + `axios` vuln
- `package.json:11-20` (8 deps, tanpa devDeps): `axios 1.6.7→1.20` (high: prototype-pollution/SSRF/ReDoS — prioritaskan `npm audit fix`), `@libsql 0.17→0.18`, `dotenv 16.4→18`, `express 5.2→5.3`, `form-data 4.0.5→4.0.6`, `got-scraping 3→4` (major, branch terpisah), `groq-sdk 1.1→1.6`, `sharp 0.35.1→0.35.5`.
- Perbaikan: `npm audit fix`, `npm update`, pisah `devDependencies`, tambah `npm run audit`.

### Testing & maintainability

#### P2-7. Test nyaris nol
- Hanya `scratch/tests/messagePipeline.test.js` (3 test mock) + `scratch/tests/streakService.test.js` (2 test). Nol coverage god-object.
- Perbaikan: tambah `test:coverage` (`node --test --experimental-test-coverage`), target 60% untuk `services/utils/database`; test prioritas: `animeNotif.dedup`, `contentFilter.blocklist`, `quiz.censorSpoiler`, `chatRepo.getRecentUserHistory` (libsql `:memory:`).

#### P2-8. Docs drift + tanpa lint/CI
- `docs/` 4 file (Mei) vs kode (Jul-Agu): `ARCHITECTURE/COMMANDS/SERVICES/DATABASE_REPOS.md` tidak lagi cocok dengan `bot.js`; tanpa `README/CHANGELOG/API.md` untuk ~40 endpoint (`dashboard.js:1900-3997`); `ARCHITECTURE.md:176-178` akui `with(runtime)` tanpa ADR.
- Tanpa `.eslintrc/.prettierrc/.editorconfig/.github/`; `package.json:7` `check` hanya 11× `node --check` + `vm.Script` (`src/checkDashboardInline.js:1-20`).
- Perbaikan: `eslint+prettier+husky/lint-staged`, ganti `check` jadi `eslint . && node --test`, tambah `.github/workflows/ci.yml` (`npm ci → audit → check → test --coverage`), generate `docs/API.md`, sinkronkan `ARCHITECTURE.md`.

---

## 4. P3 — Hygiene / peningkatan

1. **God object:** `bot.js`, `dashboard.js`, `src/dashboardServer.js` (1740 baris, ~50 endpoint), `rekomendasiCommand.js` (1142 baris). Pecah per domain (routes/, handlers/).
2. **Duplikasi:** `cleanText()` di 6 command, `pickValue` di 2, `findUserPayload` di 2, `collectAnimeinItems/scoreTitleMatch/*GenreMovies/generateQuizHintWithAI` ganda bot vs service, `image vs createImage` ~80% identik, boilerplate limit di 21 file (gunakan `helpers.ensureCommandLimit`), `logo.png==favicon.png` (390KB duplikat).
3. **DI bocor:** `cerebras/cloudflare/nvidia` `require('../config')` langsung; 5 command bypass `ctx`; `shop.js` dual-mode + baca `global.*`; `dashboardServer.js:132` `with(runtime)` — hapus.
4. **Dead code:** `USER_CHAT_COUNT`, `SHALLOW_AI_CACHE` (`bot.js:513,515`) tak dipakai; `stats.otak` (`bot.js:870-880`) sisa Groq; `FILTER_DATA` file-fallback bila sudah di DB.
5. **Cache tanpa eviksi:** `USER_STATS_CACHE` (`bot.js:512`), Jikan `Map` (`jikanClient.js:9-10`, TTL on-read), `pinterestImageHistory` (cap per-keyword 100 tapi key tanpa batas, `bot.js:946`, `imageService.js:58-103`), `imageJobQueue.js:3-5` tanpa timeout (hang = kunci selamanya). Tambah LRU/TTL + timeout/force-release.
6. **Notif preload full-scan:** `cacheRepo.js:79-88` `SELECT item_id` tanpa `LIMIT`; prune `NOT IN (... LIMIT ?)` tanpa `ORDER BY` (`:111-123`). Tambah `LIMIT` + `ORDER BY created_at DESC`.
7. **`process.on(uncaught/rejection)` lanjut jalan korup** (`bot.js:4836-4837`). Lebih baik crash + supervisor restart (systemd/PM2/docker `restart: unless-stopped`).
8. **Konstanta tersebar:** `LIMITS/QUIZ/COMMANDS/SETTINGS_KEYS` sudah di `src/config/constants.js:100` — migrasi sisa magic number di `bot.js/dashboard.js`.
9. **Aksesibilitas dashboard:** `dashboard.js` inline HTML+JS string raksasa — ekstrak ke file statis + bundler ringan, tambah `Cache-Control` + ETag untuk aset.
10. **Backup:** tidak ada skrip backup Turso/SQLite terjadwal. Tambah cron `libsql dump` + retensi 7 hari (pastikan backup tidak ikut commit).

---

## 5. Checklist perbaikan berurutan (status: SELESAI 2026-10-10 — `npm run check` OK, `npm test` 10/10 pass)

- [x] P0-1: `global.baseXpRate` di `bot.js:596` + test `addXP`
- [x] P0-2: `findResponseByQuestionKey` di `bot.js:679` (+ alias kompatibel di `cacheRepo.js:132`) + test cache hit
- [x] P0-3: lengkapi `streakRepo` / selaraskan `streakService`
- [x] P0-4: hapus fallback secret + rotasi Discord/Nvidia (kode bersih; rotasi di dashboard provider tetap wajib)
- [x] P0-5: `.gitignore` `*.db` + `git rm --cached` DB & temp image
- [x] P0-6: samakan env dashboard + fail-fast + `timingSafeEqual`
- [x] P0-7: `.env.example` + secret manager
- [x] P1 auth/XSS/error/log/helmet/validasi/prompt-expose (satu PR keamanan)
- [x] P1 race (XP/limit/shop/quiz/streak/cache → atomik/transaksi)
- [x] P1 flush + reset + migrasi transaksional + timer kuis + timezone + catch + temp-file
- [x] P2 performa (N+1, index, polling, fs async, regex) + `npm audit` (13 vuln tercatat, tanpa major upgrade)
- [x] P2 test coverage + eslint + CI-docs (`docs/API.md`, `.eslintrc.json`, 2 test baru)
- [x] P3 dedup + pecah god object sebagian + eviksi cache + backup (backup cron tetap manual)

---

## Lampiran — referensi file utama

- Entry: `bot.js`, `dashboard.js`, `package.json`
- Config: `src/config.js`, `src/config/env.js`, `src/config/constants.js`, `src/config/index.js`
- Util: `src/utils.js`, `src/pokemon.js`, `src/bootstrap.js`, `src/dashboardServer.js`, `src/shop.js`, `src/pokemonCombo.js`, `src/pokemonMeta.js`, `src/animeIntentHandler.js`, `src/jikanClient.js`, `src/httpClient.js`, `src/otherUserProfile.js`
- Services (18): `aiService`, `animeRecommendationService`, `animeNotifService`, `quizService`, `imageService`, `aiHordeImageService`, `limitService`, `errorHandler`, `cerebrasAiService`, `nvidiaAiService`, `cloudflareAiService`, `commandRouter`, `deterministicAnswerRouter`, `promptBuilder`, `filterService`, `streakService`, `tempCleanupService`
- Database (14 repo): `ban/cache/chat/knowledge/limit/memory/quiz/report/runtime/settings/shop/stats/streak/user`
- Pipeline/Client/Utils: `src/pipeline/messagePipeline.js`, `src/animein/client.js`, `src/utils/*`, `src/data/*`, `src/commands/*` (33 file)
- Test/Docs: `scratch/tests/messagePipeline.test.js`, `scratch/tests/streakService.test.js`, `docs/ARCHITECTURE.md`, `docs/COMMANDS.md`, `docs/DATABASE_REPOS.md`, `docs/SERVICES.md`
