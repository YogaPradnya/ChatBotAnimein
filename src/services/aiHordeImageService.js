const fs = require('fs');
const path = require('path');
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
    const hordeApiKey = apiKey || '0000000000';
    const groqClients = groqKeys.filter(Boolean).map(key => new Groq({ apiKey: key }));

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

    async function requestJson(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                apikey: hordeApiKey,
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
        });
    }

    async function waitForGeneration(id) {
        const startedAt = Date.now();

        while (Date.now() - startedAt < timeoutMs) {
            const status = await requestJson(`https://stablehorde.net/api/v2/generate/check/${id}`, {
                method: 'GET',
            });

            console.log(`[AI HORDE] Status ${id}: done=${status.done || 0}, processing=${status.processing || 0}, waiting=${status.waiting || 0}, queue=${status.queue_position ?? '-'}, wait=${status.wait_time ?? '-'}s`);

            if (status.done) return status;
            if (status.faulted) throw new Error('AI Horde job gagal di worker.');

            await sleep(pollIntervalMs);
        }

        throw new Error(`Timeout menunggu AI Horde setelah ${Math.round(timeoutMs / 1000)} detik.`);
    }

    async function saveGenerationImage(id) {
        const result = await requestJson(`https://stablehorde.net/api/v2/generate/status/${id}`, {
            method: 'GET',
        });
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

        let ext = mimeType.split('/')[1] || 'png';
        if (ext === 'jpeg') ext = 'jpg';

        const tempDir = path.join(projectRoot, 'src', 'temp_images');
        if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

        const filePath = path.join(tempDir, `horde_${Date.now()}_${Math.floor(Math.random() * 1000)}.${ext}`);
        fs.writeFileSync(filePath, buffer);

        return {
            filePath,
            mimeType,
            model: generation.model || '-',
            worker: generation.worker_name || '-',
        };
    }

    async function generateImageWithHorde(prompt, options = {}) {
        const negativePrompt = options.negativePrompt || 'low quality, blurry, bad anatomy, watermark, text, cropped, worst quality';
        const translatedPrompt = await translatePromptToEnglish(prompt);
        const submitResult = await submitGeneration(translatedPrompt, negativePrompt);

        if (!submitResult.id) {
            throw new Error('AI Horde tidak mengembalikan job id.');
        }

        console.log(`[AI HORDE] Job ${submitResult.id}, kudos cost: ${submitResult.kudos || 0}, prompt: ${translatedPrompt}`);
        await waitForGeneration(submitResult.id);

        const imageData = await saveGenerationImage(submitResult.id);
        return {
            ...imageData,
            id: submitResult.id,
            kudos: submitResult.kudos || 0,
            translatedPrompt,
        };
    }

    return {
        translatePromptToEnglish,
        generateImageWithHorde,
    };
}

module.exports = {
    createAiHordeImageService,
};
