const axios = require('axios');
const { CONFIG } = require('../config');

const nvidiaStat = {
    active: true,
    requests: 0,
    errors: 0,
    lastError: '',
    cooldownUntil: 0,
};

function getNvidiaStat() {
    return nvidiaStat;
}

/**
 * Memanggil NVIDIA NIM API (OpenAI-compatible) untuk model meta/llama-3.1-8b-instruct
 */
async function askNvidiaAi({
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
    const apiKey = CONFIG.NVIDIA_API_KEY || "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";
    const model = CONFIG.NVIDIA_MODEL || "meta/llama-3.1-8b-instruct";

    if (!apiKey) {
        throw new Error('NVIDIA API Key belum dikonfigurasi.');
    }

    nvidiaStat.requests++;

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

    const url = 'https://integrate.api.nvidia.com/v1/chat/completions';

    const formattedHistory = (chatHistory || []).map(msg => ({
        role: msg.role || 'user',
        content: msg.content || '',
    }));

    const messages = [];
    if (systemContent.trim()) {
        messages.push({ role: 'system', content: systemContent.trim() });
    }
    messages.push(...formattedHistory);
    messages.push({ role: 'user', content: userContent });

    try {
        const response = await axios.post(
            url,
            {
                model,
                messages,
                temperature: 0.5,
                top_p: 1,
                max_tokens: 1024,
            },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 30000,
            }
        );

        const data = response.data;
        const answer = data.choices?.[0]?.message?.content || '';
        const totalTokens = data.usage?.total_tokens || 0;

        return {
            answer,
            tokens: totalTokens,
            model: data.model || model,
        };
    } catch (error) {
        nvidiaStat.errors++;
        const errMsg = error.response?.data?.detail || error.response?.data?.message || error.message;
        nvidiaStat.lastError = String(errMsg).slice(0, 100);

        if (error.response?.status === 429) {
            nvidiaStat.cooldownUntil = Date.now() + 60000;
        }

        throw new Error(`NVIDIA API Error: ${errMsg}`);
    }
}

module.exports = {
    askNvidiaAi,
    getNvidiaStat,
};
