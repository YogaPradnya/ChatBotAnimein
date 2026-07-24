const { boxHeader } = require('../utils/textStyle');
const { findKnowledgeByHelpTopic } = require('../database/knowledgeRepo');
const { formatCommandUsage } = require('../utils/messageFormatter');

async function execute(ctx) {
    const {
        bot,
        msg,
        senderName, senderUserId,
        lowerMsg,
        sendChatMessage,
        wrapInBox,
        ANIMEIN_KNOWLEDGE,
    } = ctx;

    const helpArg = lowerMsg.replace('.help', '').trim();
    let helpMsg = '';

    if (helpArg === 'kuis') {
        helpMsg = wrapInBox('𝗞𝗨𝗜𝗦', 'Kuis otomatis setiap 3 jam.\n\nCommand:\n• .tebak [jawab]\n• .hint (minta clue)\n• .kuis (waktu kuis)\n\nHadiah:\n• +500 XP (maks)\n• Hint: -40 XP\n• Salah: -20 XP');
    } else if (helpArg === 'gambar') {
        helpMsg = wrapInBox('𝗚𝗔𝗠𝗕𝗔𝗥', 'Cari gambar dari Pinterest ke chat.\n\nCommand:\n• .gambar [keyword]\n\nLimit: 3 gambar/hari\nBonus: +5 XP/gambar\n\nInfo: Beli limit di .toko (item 3).');
    } else if (helpArg === 'xp') {
        helpMsg = wrapInBox('XP', 'XP didapat dari:\n• AI Chat   : +10 XP\n• AutoReply : +5 XP\n• Kuis      : +100-500\n• Gambar    : +500 XP\n• Cek Profil: +5 XP\n\nFormula Level:\nXP = 50 * Level^3');
    } else if (helpArg === 'shop' || helpArg === 'toko') {
        helpMsg = wrapInBox('TOKO', 'Toko item Rara.\n\nCommand:\n• .toko - List item\n• .beli [nomor]\n• .beli 1 [gelar]\n\nNote: Pembelian memotong XP kamu.');
    } else if (helpArg === 'kombo' || helpArg === 'combo') {
        helpMsg = wrapInBox('𝗞𝗢𝗠𝗕𝗢', 'Rekomendasi 3 Pokemon terbaik di tas kamu.\n\nCommand:\n• .kombo / .combo\n\nAturan:\n• Sesuai grade aktif\n• Banned diabaikan\n• Ambil LV tertinggi');
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
    } else if (helpArg === 'cari') {
        helpMsg = wrapInBox('CARI', 'Cari anime dari database Animein.\n\nCommand:\n- .cari [judul]\n\nContoh:\n- .cari one piece');
    } else if (helpArg === 'genre') {
        helpMsg = wrapInBox('GENRE', 'Cari rekomendasi anime berdasarkan genre.\n\nCommand:\n- .genre [nama]\n\nContoh:\n- .genre action\n- .genre romance\n\nData diambil dari Animein Explore.');
    } else if (helpArg === 'tas') {
        helpMsg = wrapInBox('TAS', 'Lihat ringkasan pokemon di tas kamu.\n\nCommand:\n- .tas\n\nData: total pokemon, jumlah per grade, dan top CP.\n\nLanjut: gunakan .kombo untuk rekomendasi tim.');
    } else if (helpArg === 'limit') {
        helpMsg = wrapInBox('LIMIT', 'Cek sisa limit command dan gambar hari ini.\n\nCommand:\n- .limit\n\nTampilan: sisa command & gambar.\nReset jam 00:00 WIB.');

    } else if (helpArg === 'waifu') {
        helpMsg = wrapInBox('WAIFU', 'Lihat daftar waifu milik kamu atau user lain.\n\nCommand:\n- .waifu\n- .waifu @user\n\nTampilan: total waifu & nama waifu.');
    } else if (helpArg === 'link' || helpArg === 'cuplixdl' || helpArg === 'cuplix') {
        helpMsg = wrapInBox('LINK RESMI', 'Dapatkan daftar link resmi Animein (Grup WA, Trakteer, Cuplix Download, Converter MKV to MP4).\n\nCommand:\n- .link');
    } else if (helpArg === 'rekomendasi' || helpArg === 'rekomen') {
        helpMsg = wrapInBox('REKOMENDASI', 'Rekomendasi anime terfokus.\n\nCommand:\n- .rekomendasi\n- .rekomendasi [genre/mood/status/tipe]\n\nContoh:\n- .rekomendasi action\n- .rekomendasi sad\n- .rekomendasi ongoing\n- .rekomendasi movie');
    } else if (helpArg === 'data') {
        helpMsg = wrapInBox('DATA', 'Pengaturan data pribadi (Core Memory) kamu.\n\nCommand:\n- .data [isi datamu]\n- .data hapus [nomor]\n- .data reset\n\nAturan:\n- Maksimal 5 list data per ID\n- Maksimal 80 karakter per item');
    } else if (helpArg === 'gambarkan') {
        helpMsg = wrapInBox('GAMBARKAN', 'Buat gambar AI berbasis deskripsi prompt.\n\nCommand:\n- .gambarkan [prompt]\n\nContoh:\n- .gambarkan anime girl playing guitar');
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
            `┌── ${boxHeader('HELP TOPIC')}`,
            `│ Ketik: .help [topik]`,
            `├───────────────────`,
            `│ Topik:`,
            `│ 1. rekomendasi  2. waifu`,
            `│ 3. link         4. data`,
            `│ 5. kuis         6. gambar`,
            `│ 7. gambarkan    8. xp`,
            `│ 9. shop        10. kombo`,
            `│11. profil      12. cek`,
            `│13. rank        14. streak`,
            `│15. level       16. ai`,
            `│17. jadwal      18. hot`,
            `│19. baru        20. random`,
            `│21. populer     22. cari`,
            `│23. genre       24. tas`,
            `│25. limit       26. ban`,
            `└───────────────────`,
        ].join('\n');
    }

    await sendChatMessage(bot, formatCommandUsage(senderName, helpMsg), msg.id);
    return true;
}

module.exports = { execute };
