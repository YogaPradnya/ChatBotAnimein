function buildSystemPrompt({ characterConfig, senderName, coreMemory = '', contextData = '', affectionLevel = 0, affectionPoints = 0 }) {
    const config = characterConfig?.rara || characterConfig || {};
    const heartKey = `heart_${Math.min(5, Math.max(0, affectionLevel))}`;
    const heartProfile = config.heart_profiles?.[heartKey] || config.heart_profiles?.heart_0 || {};

    const systemPromptParts = [
        `IDENTITAS: ${config.npc_name || 'Rara'} (${config.npc_description || ''})`,
        `KEPRIBADIAN: ${config.npc_personality || ''}`,
        `GAYA BICARA UMUM: ${config.npc_speaking_style || ''}`,
        `BACKGROUND: ${config.character_background || ''}`,
        `SIGNATURE: ${config.signature_style || ''}`,
        `\n[TINGKAT KEDEKATAN DENGAN @${senderName}]`,
        `Level Kedekatan: ${heartKey.toUpperCase()} (Level ${affectionLevel} - ${affectionPoints} Poin)`,
        `Deskripsi Hubungan: ${heartProfile.description || ''}`,
        `Aturan Gaya Bicara Khusus Level Ini: ${heartProfile.speaking_style || ''}`,
        `\n[ATURAN RUNTIME]`,
        `1. Berbicaralah dengan @${senderName} sesuai gaya bicara level ${heartKey.toUpperCase()} di atas.`,
        `2. Gunakan Bahasa Indonesia yang jelas, logis, dan DILARANG KERAS menghasilkan kata acak/gibberish/simbol rusak.`,
        `3. Prioritaskan data real-time Animein jika tersedia di konteks.`,
    ];

    return `${systemPromptParts.join('\n')}\n${coreMemory}${contextData}`;
}

module.exports = {
    buildSystemPrompt,
};
