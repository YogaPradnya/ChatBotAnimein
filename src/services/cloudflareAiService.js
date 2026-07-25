const axios = require('axios');
const { CONFIG } = require('../config');

const cloudflareStat = {
    active: true,
    requests: 0,
    errors: 0,
    lastError: '',
    cooldownUntil: 0,
};

function getCloudflareStat() {
    return cloudflareStat;
}

/**
 * Memanggil API Cloudflare Workers AI untuk model Llama 3.2 1B
 */
async function askCloudflareAi({
    userMessage,
    senderName,
    contextData = '',
    chatHistory = [],
    replyText = '',
    senderUserId = null,
    systemPrompt = '',
    personalizeSystemPrompt = null,
    userStatsCache = {},
    sanitizeReplyContext = null,
}) {
    const apiKey = CONFIG.CLOUDFLARE_API_KEY;
    const accountId = CONFIG.CLOUDFLARE_ACCOUNT_ID;
    const model = CONFIG.CLOUDFLARE_MODEL || '@cf/meta/llama-3.1-8b-instruct';

    if (!apiKey || !accountId) {
        throw new Error('Cloudflare API Key atau Account ID belum dikonfigurasi.');
    }

    cloudflareStat.requests++;

    // Format Core Memory jika ada
    const userStats = userStatsCache ? userStatsCache[senderUserId] : null;
    let coreMemory = '';
    if (userStats && userStats.core_memory) {
        const memoryLines = userStats.core_memory.split('\n').filter(l => l.trim()).slice(0, 5);
        if (memoryLines.length > 0) {
            coreMemory = `\n\n=== INFORMASI PENTING TENTANG USER @${senderName} ===\n` +
                         `Kamu sedang berbicara dengan @${senderName}. Kamu WAJIB menyelaraskan jawabanmu dengan fakta & preferensi personal user di bawah ini:\n` +
                         memoryLines.map(line => `- ${line}`).join('\n') +
                         `\nInstruksi: Posisikan dirimu dan sesuaikan ingatanmu dengan informasi di atas saat merespon @${senderName}. Jangan menyangkal data tersebut.\n` +
                         `==================================================\n\n`;
        }
    }

    const basePrompt = personalizeSystemPrompt ? personalizeSystemPrompt(systemPrompt, senderName) : systemPrompt;
    const systemContent = `${basePrompt}${coreMemory}${contextData}`;
    
    const replyContext = sanitizeReplyContext ? sanitizeReplyContext(replyText) : (replyText ? replyText.trim() : '');
    const userContent = replyContext
        ? `Pesan yang direply oleh ${senderName}: "${replyContext}"\n\n${senderName} berkata: "${userMessage}". Jadikan pesan reply sebagai konteks tambahan saat menjawab.`
        : `${senderName} berkata: "${userMessage}".`;

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;

    const formattedHistory = (chatHistory || []).map(msg => ({
        role: msg.role || 'user',
        content: msg.content || '',
    }));

    const messages = [
        { role: 'system', content: systemContent },
        ...formattedHistory,
        { role: 'user', content: userContent },
    ];

    const response = await axios.post(
        url,
        {
            messages,
            max_tokens: 1024,
            temperature: typeof global.AI_TEMPERATURE === 'number' ? global.AI_TEMPERATURE : 1.0,
        },
        {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 30000,
        }
    );

    const result = response.data?.result;
    if (!result || !result.response) {
        throw new Error('Response kosong dari Cloudflare Workers AI');
    }

    const answer = result.response.trim();
    const tokens = result.usage?.total_tokens || 0;

    return { text: answer, tokens, provider: 'Cloudflare Llama 3.1 8B' };
}

module.exports = {
    askCloudflareAi,
    getCloudflareStat,
};
