# Commands

Command modular berada di:

```txt
src/commands/
```

Registry utama:

```txt
src/commands/index.js
```

## Registry Handlers

### `handleInfoCommand(ctx)`

Dipakai oleh bot role `info`.

Command:

```txt
.menu
.lapor
.help
```

### `handleKuisCommand(ctx)`

Dipakai oleh bot role `kuis`.

Command:

```txt
.tebak
.hint
.kuis / .kius
.rank / .leaderboard
.meta
.kombo / .combo
.profil
.toko / .shop
.beli
.cek
```

### `handleImageCommand(ctx)`

Dipakai oleh bot role `image`.

Command:

```txt
.gambar
```

## Command Modules

| File | Command | Responsibility |
|---|---|---|
| `menuCommand.js` | `.menu` | Menu ringkas bot |
| `reportCommand.js` | `.lapor` | Simpan laporan user |
| `helpCommand.js` | `.help` | Help statis dan dynamic knowledge |
| `quizStatusCommand.js` | `.kuis`, `.kius` | Status kuis aktif/next quiz |
| `guessCommand.js` | `.tebak` | Jawaban kuis, reward, penalty |
| `hintCommand.js` | `.hint` | Hint kuis dan free hint item |
| `rankCommand.js` | `.rank`, `.leaderboard` | Leaderboard XP |
| `metaCommand.js` | `.meta` | Battle meta Pokemon |
| `comboCommand.js` | `.kombo`, `.combo` | Rekomendasi kombo Pokemon |
| `profileCommand.js` | `.profil` | Profil user dan statistik |
| `checkProfileCommand.js` | `.cek` | Cek profil user Animein lain |
| `shopCommand.js` | `.toko`, `.shop` | Tampilkan toko |
| `buyCommand.js` | `.beli` | Pembelian item toko |
| `imageCommand.js` | `.gambar` | Fetch dan kirim gambar |

## Command Design Rules

1. Command menerima dependency dari `ctx`.
2. Command tidak membuat database client sendiri.
3. Command tidak melakukan raw SQL.
4. Command tidak membaca `process.env` langsung.
5. Command menggunakan formatter jika pesan berulang.
6. Command mengembalikan `true` jika command sudah ditangani.
7. Command mengembalikan `false` jika bukan command miliknya.

## Example

```js
async function execute(ctx) {
    const { bot, msg, senderName, sendChatMessage } = ctx;
    await sendChatMessage(bot, `@${senderName} ok`, msg.id);
    return true;
}
```

## Legacy Remaining

AI mention flow sudah dipindah ke `aiService`, bukan command file terpisah. `bot.js` hanya membuat context dan memanggil:

```js
aiService.handleInfoMessage(ctx)
```
