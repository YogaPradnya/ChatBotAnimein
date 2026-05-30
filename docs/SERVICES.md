# Services

Service menyimpan business logic, API client, routing, dan error handling.

## Service List

| File | Responsibility |
|---|---|
| `src/services/aiService.js` | Flow AI info bot |
| `src/services/quizService.js` | State dan lifecycle kuis |
| `src/services/imageService.js` | Pinterest image fetch, download, cleanup |
| `src/services/limitService.js` | Limit command dan image usage |
| `src/services/commandRouter.js` | Deteksi command agar tidak double response |
| `src/services/errorHandler.js` | Error formatting dan safe logging |
| `src/services/promptBuilder.js` | Builder prompt AI untuk phase lanjutan |
| `src/services/filterService.js` | Filter profanity untuk phase lanjutan |
| `src/animein/client.js` | HTTP client Animein API |

## `aiService`

Factory:

```js
createAiService(deps)
```

Method:

```js
handleInfoMessage(ctx)
```

Tanggung jawab:

- mention detection
- `.ai` / `.rara`
- AutoReply
- profanity filter
- anime data handler
- normal AI response
- send failed logging
- XP reward
- streak tracking
- chat log saving

## `quizService`

Factory:

```js
createQuizService(deps)
```

Tanggung jawab:

- `activeQuiz` lifecycle
- start quiz
- expire quiz
- schedule expiry
- build hint message
- clear quiz timers

Command yang memakai state quiz:

```txt
quizStatusCommand
hintCommand
guessCommand
```

## `imageService`

Factory:

```js
createImageService(deps)
```

Tanggung jawab:

- fetch Pinterest image
- avoid duplicate image per keyword
- download image to temp file
- cleanup temp image

Digunakan oleh:

```txt
imageCommand
bot.js wiring
```

## `limitService`

Factory:

```js
createLimitService({ limitRepo, getDateKey, defaults })
```

Tanggung jawab:

- cek command limit harian
- increment command usage
- cek image limit harian
- increment image usage

## `commandRouter`

Factory:

```js
createCommandRouter()
```

Tanggung jawab:

- resolve command prefix/exact
- mencegah bot info merespons command milik kuis/image

## `errorHandler`

Export:

```js
handleError()
ignoreExpectedError()
safeMessage()
warnError()
createErrorHandler()
formatError()
```

Pola aman:

```js
console.warn('[SCOPE] pesan:', safeMessage(error, 120));
```

## `animeinClient`

Factory:

```js
createAnimeinClient({ axios, baseUrl, defaultHeaders, recordPath })
```

Method:

```js
get(path, options)
post(path, data, options)
```

Semua request ke Animein API baru harus lewat client ini.
