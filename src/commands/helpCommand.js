const { findKnowledgeByHelpTopic } = require('../database/knowledgeRepo');
const { formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        lowerMsg,
        sendChatMessage,
        wrapInBox,
        ANIMEIN_KNOWLEDGE,
    } = ctx;

    const helpArg = lowerMsg.replace('.help', '').trim();
    let helpMsg = '';

    if (helpArg === 'kuis') {
        helpMsg = wrapInBox('KUIS', 'Kuis otomatis setiap 3 jam.\n\nCommand:\n• .tebak [jawab]\n• .hint (minta clue)\n• .kuis (waktu kuis)\n\nHadiah:\n• +500 XP (maks)\n• Hint: -40 XP\n• Salah: -20 XP');
    } else if (helpArg === 'gambar') {
        helpMsg = wrapInBox('GAMBAR', 'Cari gambar dari Pinterest ke chat.\n\nCommand:\n• .gambar [keyword]\n\nLimit: 3 gambar/hari\nBonus: +5 XP/gambar\n\nInfo: Beli limit di .toko (item 3).');
    } else if (helpArg === 'xp') {
        helpMsg = wrapInBox('XP', 'XP didapat dari:\n• AI Chat   : +10 XP\n• AutoReply : +5 XP\n• Kuis      : +100-500\n• Gambar    : +500 XP\n• Cek Profil: +5 XP\n\nFormula Level:\nXP = 50 * Level^3');
    } else if (helpArg === 'shop' || helpArg === 'toko') {
        helpMsg = wrapInBox('TOKO', 'Toko item Rara.\n\nCommand:\n• .toko - List item\n• .beli [nomor]\n• .beli 1 [gelar]\n\nNote: Pembelian memotong XP kamu.');
    } else if (helpArg === 'kombo' || helpArg === 'combo') {
        helpMsg = wrapInBox('KOMBO', 'Rekomendasi 3 Pokemon terbaik di tas kamu.\n\nCommand:\n• .kombo / .combo\n\nAturan:\n• Sesuai grade aktif\n• Banned diabaikan\n• Ambil LV tertinggi');
    } else if (helpArg === 'profil') {
        helpMsg = wrapInBox('PROFIL', 'Cek statistikmu.\n\nCommand:\n• .profil\n\nTampilan:\n• Rank, Level, XP\n• Statistik kuis\n• Streak harian\n• Sisa limit hari ini');
    } else if (helpArg === 'cek') {
        helpMsg = wrapInBox('CEK', 'Intip profil user.\n\nCommand:\n• .cek @username\n\nContoh:\n• .cek @sashaww\n\nHadiah: +5 XP');
    } else if (helpArg === 'rank' || helpArg === 'leaderboard') {
        helpMsg = wrapInBox('RANK', 'Lihat 10 pemain dengan XP tertinggi.\n\nCommand:\n• .rank\n• .leaderboard');
    } else if (helpArg === 'streak') {
        helpMsg = wrapInBox('STREAK', 'Jumlah hari aktif.\n\nDapatkan via:\n• Chat AI (.ai)\n• Jawab kuis\n• Kirim gambar\n\nNote: Reset jika absen 1 hari penuh');
    } else if (helpArg === 'level' || helpArg === 'gelar') {
        helpMsg = wrapInBox('LEVEL', 'Gelar otomatis:\n• Lvl 10: Ksatria\n• Lvl 50: Legenda\n• Lvl 100: Dewa\n\nCustom Title:\nBeli di .toko untuk gelar bebas.');
    } else if (helpArg === 'ai' || helpArg === 'rara') {
        helpMsg = wrapInBox('AI', 'Tanya / ajak Rara mengobrol.\n\nCommand:\n- .ai [pesan]\n- .rara [pesan]\n- Mention @AnimeinAi\n\nHadiah: +10 XP');
    } else if (helpArg === 'jadwal') {
        helpMsg = wrapInBox('JADWAL', 'Lihat jadwal anime hari ini.\n\nCommand:\n- .jadwal\n\nSumber: Animein Schedule');
    } else if (helpArg === 'hot' || helpArg === 'trending') {
        helpMsg = wrapInBox('HOT', 'Anime yang sedang hangat.\n\nCommand:\n- .hot\n- .trending\n\nSumber: Animein Trending');
    } else if (helpArg === 'baru') {
        helpMsg = wrapInBox('BARU', 'Episode terbaru yang rilis.\n\nCommand:\n- .baru\n\nSumber: Animein New Episode');
    } else if (helpArg === 'random') {
        helpMsg = wrapInBox('RANDOM', 'Rekomendasi anime acak.\n\nCommand:\n- .random\n\n3 anime dipilih secara acak.');
    } else if (helpArg === 'populer') {
        helpMsg = wrapInBox('POPULER', 'Anime paling populer.\n\nCommand:\n- .populer\n\nSumber: Animein Popular');
    } else if (helpArg === 'detail') {
        helpMsg = wrapInBox('DETAIL', 'Lihat detail anime dari database Animein.\n\nCommand:\n- .detail [judul]\n\nContoh:\n- .detail one piece\n\nData: judul, type, tahun, studio, genre, sinopsis, dan episode.');
    } else if (helpArg === 'cari') {
        helpMsg = wrapInBox('CARI', 'Cari anime dari database Animein.\n\nCommand:\n- .cari [judul]\n\nContoh:\n- .cari one piece\n\nGunakan .detail [judul] untuk melihat info lengkap.');
    } else if (helpArg === 'genre') {
        helpMsg = wrapInBox('GENRE', 'Cari rekomendasi anime berdasarkan genre.\n\nCommand:\n- .genre [nama]\n\nContoh:\n- .genre action\n- .genre romance\n\nData diambil dari Animein Explore.');
    } else if (helpArg === 'tas') {
        helpMsg = wrapInBox('TAS', 'Lihat ringkasan pokemon di tas kamu.\n\nCommand:\n- .tas\n\nData: total pokemon, jumlah per grade, dan top CP.\n\nLanjut: gunakan .kombo untuk rekomendasi tim.');
    } else if (helpArg === 'limit') {
        helpMsg = wrapInBox('LIMIT', 'Cek sisa limit command dan gambar hari ini.\n\nCommand:\n- .limit\n\nTampilan: sisa command & gambar.\nReset jam 00:00 WIB.');

    } else if (helpArg === 'ban') {
        helpMsg = wrapInBox('BAN', 'Aturan bot:\n• Dilarang spam\n• Dilarang toxic\n• Dilarang abuse XP\n\nPelanggar akan di-ban permanen.');
    } else if (helpArg) {
        const knowledgeMatch = findKnowledgeByHelpTopic(ANIMEIN_KNOWLEDGE, helpArg);

        if (knowledgeMatch) {
            const rawText = knowledgeMatch.help_text || knowledgeMatch.info || '';
            helpMsg = wrapInBox(knowledgeMatch.help_label || 'INFO', rawText);
        } else {
            helpMsg = `Topik "${helpArg}" tidak ditemukan.\nKetik .help untuk lihat daftar topik.`;
        }
    } else {
        helpMsg = [
            `\u250C\u2500\u2500 \uD83D\uDCD6 HELP \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
            `\u2502 Ketik: .help [topik]`,
            `\u251C\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
            `\u2502 Topik:`,
            `\u2502 1. kuis     2. gambar`,
            `\u2502 3. xp       4. shop`,
            `\u2502 5. kombo    6. profil`,
            `\u2502 7. cek      8. rank`,
            `\u2502 9. streak   10. level`,
            `\u250211. ai      12. ban`,
            `\u250213. jadwal  14. hot`,
            `\u250215. baru    16. random`,
            `\u250217. populer 18. detail`,
            `\u250219. cari    20. genre`,
            `\u250221. tas     22. limit`,
            `\u2514\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`,
        ].join('\n');
    }

    await sendChatMessage(bot, formatCommandUsage(senderName, helpMsg), msg.id);
    return true;
}

module.exports = { execute };
