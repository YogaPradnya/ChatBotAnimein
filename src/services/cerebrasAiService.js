const axios = require('axios');
const { CONFIG } = require('../config');

const cerebrasStat = {
    active: true,
    requests: 0,
    errors: 0,
    lastError: '',
    cooldownUntil: 0,
};

// Rate Limiter: Maksimal 30 RPM (Requests Per Minute)
const requestTimestamps = [];
const MAX_RPM = 30;
const ONE_MINUTE_MS = 60 * 1000;

function cleanOldTimestamps(now) {
    while (requestTimestamps.length > 0 && now - requestTimestamps[0] > ONE_MINUTE_MS) {
        requestTimestamps.shift();
    }
}

function getCerebrasStat() {
    cleanOldTimestamps(Date.now());
    cerebrasStat.currentRpm = requestTimestamps.length;
    return cerebrasStat;
}

/**
 * Memanggil API Cerebras AI (OpenAI-compatible) untuk model gemma-4-31b
 */
async function askCerebrasAi({
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
    const apiKey = CONFIG.CEREBRAS_API_KEY;
    const model = CONFIG.CEREBRAS_MODEL || 'gemma-4-31b';

    if (!apiKey) {
        throw new Error('Cerebras API Key belum dikonfigurasi.');
    }

    const now = Date.now();
    cleanOldTimestamps(now);

    // Cek batas 30 RPM
    if (requestTimestamps.length >= MAX_RPM) {
        const oldestRequest = requestTimestamps[0];
        const waitMs = ONE_MINUTE_MS - (now - oldestRequest);
        cerebrasStat.lastError = `Rate limit 30 RPM tercapai. Tunggu ${Math.ceil(waitMs / 1000)}s`;
        throw new Error(`Cerebras rate limit (30 RPM) reached. Retry in ${Math.ceil(waitMs / 1000)}s.`);
    }

    cerebrasStat.requests++;
    requestTimestamps.push(now);

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
    
    const cleanMessage = String(userMessage || '').replace(/^[:\s]+/, '').trim();
    const replyContext = sanitizeReplyContext ? sanitizeReplyContext(replyText) : (replyText ? replyText.trim() : '');
    const userContent = replyContext
        ? `[Pesan yang di-reply oleh @${senderName}: "${replyContext}"]\n${cleanMessage}`
        : cleanMessage;

    const url = 'https://api.cerebras.ai/v1/chat/completions';

    const formattedHistory = (chatHistory || []).map(msg => ({
        role: msg.role || 'user',
        content: msg.content || '',
    }));

    const messages = [
        { role: 'system', content: systemContent },
        ...formattedHistory,
        { role: 'user', content: userContent },
    ];

    try {
        const response = await axios.post(
            url,
            {
                model,
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

        const choices = response.data?.choices;
        if (!choices || choices.length === 0 || !choices[0].message) {
            throw new Error('Response kosong dari Cerebras AI.');
        }

        const answer = choices[0].message.content.trim();
        const tokens = response.data?.usage?.total_tokens || 0;

        return { text: answer, tokens, provider: `Cerebras (${model})` };
    } catch (err) {
        cerebrasStat.errors++;
        const errMsg = err.response?.data?.message || err.message || '';
        cerebrasStat.lastError = errMsg.slice(0, 100);

        // Jika error 402 (payment required) atau 429 (rate limit), beri cooldown 60s
        if (err.response?.status === 402 || err.response?.status === 429 || errMsg.includes('payment_required')) {
            cerebrasStat.cooldownUntil = Date.now() + 60000;
        }

        throw err;
    }
}

module.exports = {
    askCerebrasAi,
    getCerebrasStat,
};
