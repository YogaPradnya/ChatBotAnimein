const fs = require('fs');
const os = require('os');
const path = require('path');
const sharp = require('sharp');
const Groq = require('groq-sdk');

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function sanitizePromptLine(text) {
    return String(text || '')
        .replace(/^"|"$/g, '')
        .replace(/^Prompt:\s*/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function createAiHordeImageService({
    apiKey,
    apiKeys = [],
    groqKeys = [],
    projectRoot,
    timeoutMs = 300000,
    pollIntervalMs = 10000,
    width = 512,
    height = 512,
    steps = 20,
    cfgScale = 7,
    sampler = 'k_euler_a',
    model = '',
    clientAgent = 'AnimeinBot:1.0',
}) {
    const hordeApiKeys = [...new Set([...apiKeys, apiKey].filter(Boolean))];
    if (!hordeApiKeys.length) hordeApiKeys.push('0000000000');
    const groqClients = groqKeys.filter(Boolean).map(key => new Groq({ apiKey: key }));

    function getKeyLabel(index) {
        return `key ${index + 1}/${hordeApiKeys.length}`;
    }

    async function translatePromptToEnglish(prompt) {
        const rawPrompt = String(prompt || '').trim();
        if (!rawPrompt) throw new Error('Prompt kosong.');

        if (!groqClients.length) {
            return sanitizePromptLine(rawPrompt);
        }

        const systemPrompt = [
            'You convert user image prompts into stable English prompts for Stable Diffusion.',
            'If the input is Indonesian, translate it to English first.',
            'If the input is already English, improve clarity but keep the same meaning.',
            'Return only one English image prompt, no explanation, no markdown.',
            'Keep it safe, concise, visual, and descriptive.'
        ].join(' ');

        let lastError;
        for (const client of groqClients) {
            try {
                const res = await client.chat.completions.create({
                    model: 'llama-3.1-8b-instant',
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: rawPrompt }
                    ],
                    temperature: 0.2,
                    max_tokens: 120,
                });

                const translated = sanitizePromptLine(res.choices?.[0]?.message?.content || '');
                if (translated) return translated;
            } catch (error) {
                lastError = error;
            }
        }

        console.warn('[AI HORDE] Translate gagal, pakai prompt asli:', lastError?.message || lastError);
        return sanitizePromptLine(rawPrompt);
    }

    async function requestJson(url, options = {}, key = hordeApiKeys[0]) {
        const response = await fetch(url, {
            ...options,
            headers: {
                apikey: key,
                'Client-Agent': clientAgent,
                'Content-Type': 'application/json',
                ...(options.headers || {})
            }
        });

        const text = await response.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch (_) {
            data = { raw: text };
        }

        if (!response.ok) {
            const error = new Error(data.message || data.raw || `AI Horde HTTP ${response.status}`);
            error.status = response.status;
            error.data = data;
            throw error;
        }

        return data;
    }

    async function submitGeneration(englishPrompt, negativePrompt) {
        const payload = {
            prompt: `${englishPrompt} ### ${negativePrompt}`,
            params: {
                sampler_name: sampler,
                cfg_scale: cfgScale,
                width,
                height,
                steps,
                n: 1,
                format: 'jpg',
            },
            nsfw: false,
            censor_nsfw: true,
            trusted_workers: false,
            slow_workers: true,
            replacement_filter: true,
        };

        if (model) payload.models = [model];

        return requestJson('https://stablehorde.net/api/v2/generate/async', {
            method: 'POST',
            body: JSON.stringify(payload),
        }, options.apiKey);
    }

    async function waitForGeneration(id, apiKey, keyIndex, maxInitialWaitMs = 20000) {
        const startedAt = Date.now();
        let lastStatus = null;

        while (Date.now() - startedAt < timeoutMs) {
            const status = await requestJson(`https://stablehorde.net/api/v2/generate/check/${id}`, {
                method: 'GET',
            }, apiKey);
            lastStatus = status;

            console.log(`[AI HORDE] ${getKeyLabel(keyIndex)} status ${id}: done=${status.done || 0}, processing=${status.processing || 0}, waiting=${status.waiting || 0}, queue=${status.queue_position ?? '-'}, wait=${status.wait_time ?? '-'}s`);

            if (status.done) return { done: true, status };
            if (status.faulted) throw new Error('AI Horde job gagal di worker.');

            const elapsed = Date.now() - startedAt;
            if (elapsed >= maxInitialWaitMs && Number(status.processing || 0) <= 0 && Number(status.waiting || 0) > 0) {
                return { done: false, shouldRotate: true, status };
            }

            await sleep(pollIntervalMs);
        }

        throw new Error(`Timeout menunggu AI Horde setelah ${Math.round(timeoutMs / 1000)} detik. Status terakhir: ${JSON.stringify(lastStatus || {})}`);
    }

    async function saveGenerationImage(id, apiKey) {
        const result = await requestJson(`https://stablehorde.net/api/v2/generate/status/${id}`, {
            method: 'GET',
        }, apiKey);
        const generation = result.generations?.[0];

        if (!generation?.img) {
            throw new Error('AI Horde tidak mengembalikan gambar.');
        }

        let buffer;
        let mimeType = 'image/png';

        if (/^https?:\/\//i.test(generation.img)) {
            const imageResponse = await fetch(generation.img);
            if (!imageResponse.ok) throw new Error(`Gagal download hasil AI Horde: HTTP ${imageResponse.status}`);
            mimeType = String(imageResponse.headers.get('content-type') || 'image/png').split(';')[0];
            buffer = Buffer.from(await imageResponse.arrayBuffer());
        } else {
            const match = generation.img.match(/^data:(image\/\w+);base64,/);
            if (match) mimeType = match[1];
            const base64 = generation.img.replace(/^data:image\/\w+;base64,/, '');
            buffer = Buffer.from(base64, 'base64');
        }

        const originalMimeType = mimeType;
        buffer = await sharp(buffer)
            .rotate()
            .jpeg({ quality: 90, mozjpeg: true })
            .toBuffer();
        mimeType = 'image/jpeg';
        const ext = 'jpg';

        const tempDir = path.join(os.tmpdir(), 'animein-temp-images');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const filePath = path.join(tempDir, `horde_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`);
        fs.writeFileSync(filePath, buffer);

        const fileSize = buffer.length;
        console.log(`[AI HORDE] Image saved: original=${originalMimeType}, mime=${mimeType}, ext=${ext}, size=${Math.round(fileSize / 1024)}KB`);

        return {
            filePath,
            mimeType,
            sourceUrl: 'ai-horde',
            model: generation.model || '-',
            worker: generation.worker_name || '-',
        };
    }

    async function generateImageWithHorde(prompt, options = {}) {
        const negativePrompt = options.negativePrompt || 'low quality, blurry, bad anatomy, watermark, text, cropped, worst quality';
        const translatedPrompt = await translatePromptToEnglish(prompt);
        let lastError = null;

        for (let keyIndex = 0; keyIndex < hordeApiKeys.length; keyIndex++) {
            const apiKeyForJob = hordeApiKeys[keyIndex];
            try {
                const submitResult = await submitGeneration(translatedPrompt, negativePrompt, { apiKey: apiKeyForJob });

                if (!submitResult.id) {
                    throw new Error('AI Horde tidak mengembalikan job id.');
                }

                console.log(`[AI HORDE] ${getKeyLabel(keyIndex)} job ${submitResult.id}, kudos cost: ${submitResult.kudos || 0}, prompt: ${translatedPrompt}`);
                const waitResult = await waitForGeneration(submitResult.id, apiKeyForJob, keyIndex, options.rotateAfterMs || 20000);

                if (!waitResult.done && waitResult.shouldRotate && keyIndex < hordeApiKeys.length - 1) {
                    console.warn(`[AI HORDE] ${getKeyLabel(keyIndex)} masih waiting >20s dan belum processing, pindah ${getKeyLabel(keyIndex + 1)}.`);
                    continue;
                }

                if (!waitResult.done) {
                    console.warn(`[AI HORDE] ${getKeyLabel(keyIndex)} tidak selesai, lanjut tunggu karena tidak ada key lain.`);
                    await waitForGeneration(submitResult.id, apiKeyForJob, keyIndex, timeoutMs);
                }

                const imageData = await saveGenerationImage(submitResult.id, apiKeyForJob);
                return {
                    ...imageData,
                    id: submitResult.id,
                    kudos: submitResult.kudos || 0,
                    translatedPrompt,
                };
            } catch (error) {
                lastError = error;
                console.warn(`[AI HORDE] ${getKeyLabel(keyIndex)} gagal: ${error.message}`);
                if (keyIndex >= hordeApiKeys.length - 1) break;
            }
        }

        throw lastError || new Error('Semua API key AI Horde gagal membuat gambar.');
    }

    return {
        translatePromptToEnglish,
        generateImageWithHorde,
    };
}

module.exports = {
    createAiHordeImageService,
};
