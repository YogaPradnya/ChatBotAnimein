# Animein Bot Architecture

## Overview

Animein Bot sekarang memakai arsitektur modular berbasis layer:

```txt
bot.js
  -> commands
  -> services
  -> database repositories
  -> utils/config/client
```

`bot.js` tetap menjadi entrypoint utama, tetapi logic command dan bisnis utama dipindahkan ke modul khusus agar lebih mudah dirawat.

## Bot Roles

### `info`

Bot AI utama.

Tanggung jawab:

- `.menu`
- `.help`
- `.lapor`
- `.ai`
- `.rara`
- mention bot
- AutoReply
- profanity filter
- anime data question

### `kuis`

Bot game/quiz.

Tanggung jawab:

- `.kuis`
- `.tebak`
- `.hint`
- `.rank`
- `.meta`
- `.kombo`
- `.profil`
- `.cek`
- `.toko`
- `.beli`

### `image`

Bot gambar.

Tanggung jawab:

- `.gambar`
- image limit
- Pinterest fetch
- image temp cleanup

## Message Flow

```txt
startBot()
  -> fetchMessages(bot)
  -> processMessages(bot, messages)
  -> resolve role
  -> build command context
  -> commands.handleXCommand(ctx)
  -> service/repository call
  -> sendChatMessage()
```

## Layer Rules

### Commands

Lokasi:

```txt
src/commands/
```

Tugas:

- parsing command
- validasi input command
- panggil service/repo via context
- kirim response chat

Command tidak boleh menyimpan raw SQL.

### Services

Lokasi:

```txt
src/services/
src/animein/
```

Tugas:

- business logic
- external API client
- state orchestration
- command routing
- error handling

### Repositories

Lokasi:

```txt
src/database/
```

Tugas:

- semua akses database
- query SQL
- normalisasi data repository

### Utils

Lokasi:

```txt
src/utils/
src/config/
```

Tugas:

- formatter pesan
- config/env
- utility kecil reusable

## Dependency Injection Pattern

Modul command menerima dependency melalui `ctx`.

Contoh:

```js
await commands.handleKuisCommand({
    bot,
    msg,
    senderName,
    sendChatMessage,
    activeQuiz,
    addXP,
});
```

Keuntungan:

- command tidak bergantung langsung pada global state
- mudah dipindah/test
- behavior lama tetap kompatibel

## Compatibility Rule

Saat refactor:

1. Jangan ubah format command user.
2. Jangan ubah endpoint API tanpa alasan.
3. Jangan ubah format response kecuali diminta.
4. Jangan tambah logic baru di `bot.js` kecuali wiring module.
5. Gunakan repository untuk SQL baru.
6. Gunakan `animeinClient` untuk Animein API.
7. Gunakan `messageFormatter` untuk pesan berulang.

## Current Known Exception

`dashboardServer.js` masih memiliki logic besar dan lint issue terkait `with(runtime)`. Ini sengaja tidak disentuh dalam refactor command/service agar route dashboard tetap stabil.
