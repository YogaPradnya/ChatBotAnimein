# Database Repositories

Repository berada di:

```txt
src/database/
```

Repository bertugas memusatkan akses database dan raw SQL.

## Repo List

| File | Responsibility |
|---|---|
| `settingsRepo.js` | Key-value settings dashboard/bot |
| `userRepo.js` | User stats, profile, leaderboard |
| `limitRepo.js` | Command/image daily limits |
| `quizRepo.js` | Quiz pool dan quiz settings |
| `shopRepo.js` | Shop item dan inventory |
| `reportRepo.js` | Laporan user |
| `cacheRepo.js` | AI response cache |
| `chatRepo.js` | Chat logs/history |
| `statsRepo.js` | Dashboard DB counts |
| `streakRepo.js` | Streak dan quiz/image stats |
| `memoryRepo.js` | Core memory user |
| `knowledgeRepo.js` | Normalisasi dan lookup knowledge |

## `settingsRepo`

Digunakan untuk:

```txt
SYSTEM_PROMPT
ANIMEIN_KNOWLEDGE
CUSTOM_DOMAINS
AUTO_REPLY
FILTER_DATA
TOTAL_QUIZZES_STARTED
```

## `userRepo`

Digunakan untuk:

- XP user
- level user
- custom title
- leaderboard
- profile + rank
- quiz stats summary

## `limitRepo`

Digunakan untuk:

- command usage harian
- command extra limit
- image usage harian
- image extra limit

## `quizRepo`

Digunakan untuk:

- quiz pool
- count quiz pool
- quiz filter
- insert/update quiz data

## `shopRepo`

Digunakan untuk:

- daftar item toko
- pembelian item
- item inventory
- consume item

## `reportRepo`

Digunakan untuk:

- `.lapor`
- dashboard reports

## `cacheRepo`

Digunakan untuk:

- cek cached AI response
- simpan response baru
- variasi response
- cache count dashboard

## `chatRepo`

Digunakan untuk:

- simpan chat log AI
- ambil recent history user

## `statsRepo`

Digunakan untuk:

- total logs
- total kuis
- total reports
- dashboard counters

## `streakRepo`

Digunakan untuk:

```js
getUserStreak()
createInitialStreak()
updateUserStreak()
incrementQuizStat()
incrementImageRequest()
```

Membungkus table:

```txt
user_quiz_stats
```

## `memoryRepo`

Digunakan untuk:

```js
upsertUserMemory()
getUserMemory()
deleteUserMemory()
buildUpsertBatch()
```

Membungkus table:

```txt
user_memories
```

## `knowledgeRepo`

Digunakan untuk:

```js
normalizeKnowledgeItem()
normalizeKnowledgeList()
findKnowledgeByHelpTopic()
buildKnowledgeContext()
loadAnimeinKnowledge()
saveAnimeinKnowledge()
```

Normalisasi knowledge:

- domain lowercase
- help topic lowercase
- keyword dibersihkan
- duplicate keyword dihapus
- item kosong dibuang
- list disortir berdasarkan domain dan topic

## Repository Rules

1. Raw SQL baru harus masuk repository.
2. Command tidak boleh memanggil `db.execute()` langsung.
3. Service boleh memakai repository via dependency injection.
4. Jika query menerima nama kolom dinamis, whitelist wajib dipakai.
5. Repository tidak boleh mengirim chat message.
