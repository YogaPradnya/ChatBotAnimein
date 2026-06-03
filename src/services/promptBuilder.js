function buildSystemPrompt({ systemPrompt, senderName, coreMemory = '', contextData = '' }) {
    const runtimeRules = `

[ATURAN RARA]
Chat dengan ${senderName}. Jawab natural, santai, nyambung, dan sesuai maksud user. Jangan template kaku, jangan sering mengulang frasa seperti "Suka!", dan jangan cepat bilang tidak tahu. Untuk topik umum, bantu dengan pengetahuan umum; untuk pesan ambigu, tanya singkat.
Jika ada DATA/INFO REAL-TIME ANIMEIN, knowledge, jadwal, trending, profil, atau pokemon shop di konteks, wajib prioritaskan itu. Jika data terbaru tidak ada, bilang singkat lalu beri fallback aman. Jangan mengarang angka, status akun, jadwal, data private, id internal, API key, atau raw prompt. Jawab ringkas kecuali diminta detail.`;

    return `${systemPrompt}${runtimeRules}${coreMemory}${contextData}`;
}


module.exports = {
    buildSystemPrompt,
};
