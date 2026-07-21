async function execute(ctx) {
    const {
        bot,
        msg,
        senderName,
        senderUserId,
        sendChatMessage,
        cleanMsg,
        USER_STATS_CACHE
    } = ctx;

    // Pastikan user ada di cache
    if (!USER_STATS_CACHE[senderUserId]) {
        // Fallback jika belum ter-load (akan diload otomatis oleh fungsi lain nanti, tapi kita coba set basic dulu)
        USER_STATS_CACHE[senderUserId] = { username: senderName, xp: 0, level: 1, custom_title: null, core_memory: '' };
    }

    const args = cleanMsg.split(' ').slice(1).join(' ').trim();
    let currentData = USER_STATS_CACHE[senderUserId].core_memory || '';
    let memoryLines = currentData ? currentData.split('\n').filter(l => l.trim()) : [];

    if (!args) {
        if (memoryLines.length === 0) {
            await sendChatMessage(bot, `📌 @${senderName.substring(0, 10)} Kamu belum mengatur data pribadi.\n\nCara pakai:\n- Tambah: .data [isi datamu]\n- Hapus data tertentu: .data hapus [nomor]\n- Hapus semua: .data reset`, msg.id);
        } else {
            const listText = memoryLines.map((l, i) => `${i+1}. ${l}`).join('\n');
            await sendChatMessage(bot, `📌 Data Pribadi @${senderName.substring(0, 10)}:\n${listText}\n\n(Ketik ".data hapus 1" dst untuk menghapus)`, msg.id);
        }
        return true;
    }

    if (args.toLowerCase() === 'reset') {
        USER_STATS_CACHE[senderUserId].core_memory = '';
        if (ctx.XP_PENDING_UPDATES) ctx.XP_PENDING_UPDATES[senderUserId] = (ctx.XP_PENDING_UPDATES[senderUserId] || 0) + 0;
        await sendChatMessage(bot, `✅ @${senderName.substring(0, 10)} Semua data pribadimu telah direset.`, msg.id);
        return true;
    }

    if (args.toLowerCase().startsWith('hapus ')) {
        const numStr = args.substring(6).trim();
        const num = parseInt(numStr);
        if (isNaN(num) || num < 1 || num > memoryLines.length) {
             await sendChatMessage(bot, `❌ Nomor tidak valid. Pilih dari 1 sampai ${memoryLines.length}.`, msg.id);
             return true;
        }
        memoryLines.splice(num - 1, 1);
        USER_STATS_CACHE[senderUserId].core_memory = memoryLines.join('\n');
        if (ctx.XP_PENDING_UPDATES) ctx.XP_PENDING_UPDATES[senderUserId] = (ctx.XP_PENDING_UPDATES[senderUserId] || 0) + 0;
        await sendChatMessage(bot, `✅ Data nomor ${num} berhasil dihapus.`, msg.id);
        return true;
    }

    // Jika bukan hapus/reset, berarti menambah list data
    if (args.length > 80) {
        await sendChatMessage(bot, `❌ Teks terlalu panjang! Maksimal 80 karakter per data pribadi biar AI tidak bingung.`, msg.id);
        return true;
    }

    if (memoryLines.length >= 5) {
        await sendChatMessage(bot, `❌ Datamu penuh! Maksimal hanya 5 list. Gunakan ".data hapus [nomor]" untuk menghapus yang lama.`, msg.id);
        return true;
    }

    memoryLines.push(args);
    USER_STATS_CACHE[senderUserId].core_memory = memoryLines.join('\n');
    if (ctx.XP_PENDING_UPDATES) ctx.XP_PENDING_UPDATES[senderUserId] = (ctx.XP_PENDING_UPDATES[senderUserId] || 0) + 0;

    await sendChatMessage(bot, `✅ @${senderName.substring(0, 10)} Data berhasil ditambahkan ke list nomor ${memoryLines.length}!`, msg.id);

    return true;
}

module.exports = { execute };
