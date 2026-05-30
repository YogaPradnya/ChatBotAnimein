function buildSystemPrompt({ systemPrompt, senderName, coreMemory = '', contextData = '' }) {
    return systemPrompt + `\n\nInfo: Kamu sedang mengobrol dengan ${senderName}.\nAturan jawaban data Animein: jika konteks berisi DATA REAL-TIME ANIMEIN atau INFO ANIMEIN, jawab dengan data itu secara langsung dan jelas. Jangan memakai frasa "saya tidak paham" / "saya tidak tahu" kecuali benar-benar tidak ada data real-time maupun knowledge. Jika data API tidak ada tetapi knowledge ada, gunakan knowledge sebagai fallback dan sebutkan bahwa data real-time belum tersedia.` + coreMemory + contextData;
}

module.exports = {
    buildSystemPrompt,
};
