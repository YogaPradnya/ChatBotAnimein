const fs = require('fs');
const path = require('path');

const DEFAULT_LOG_FILE = path.join(process.cwd(), 'realtime_logs.txt');

const ERROR_CATEGORY = {
    API: 'API_ERROR',
    NETWORK: 'NETWORK_ERROR',
    AUTH: 'AUTH_ERROR',
    RATE_LIMIT: 'RATE_LIMIT',
    DATA_EMPTY: 'DATA_EMPTY',
    VALIDATION: 'VALIDATION_ERROR',
    UNKNOWN: 'UNKNOWN_ERROR',
};

function maskSecretValue(value) {
    const text = String(value || '');
    if (text.length <= 6) return '****';
    return `${text.slice(0, 2)}****${text.slice(-2)}`;
}

function maskSensitiveText(value) {
    return String(value || '')
        .replace(/((?:key_client|password|token|authorization|api[_-]?key|groq_api_key)\s*[=:]\s*)([^\s&]+)/gi, (_, prefix, secret) => `${prefix}${maskSecretValue(secret)}`)
        .replace(/(Bearer\s+)([A-Za-z0-9._-]+)/gi, (_, prefix, secret) => `${prefix}${maskSecretValue(secret)}`);
}

function formatError(error) {
    if (!error) return 'Unknown error';
    const raw = error.stack || error.message || String(error);
    return maskSensitiveText(raw);
}

function safeMessage(error, maxLength = 120) {
    const raw = maskSensitiveText(error?.message || String(error || 'Unknown error'));
    if (!maxLength || raw.length <= maxLength) return raw;
    return raw.slice(0, maxLength);
}

function inferErrorCategory(error) {
    const status = error?.response?.status;
    const code = String(error?.code || '').toUpperCase();
    const msg = String(error?.message || '').toLowerCase();

    if (status === 401 || status === 403) return ERROR_CATEGORY.AUTH;
    if (status === 429) return ERROR_CATEGORY.RATE_LIMIT;
    if (status >= 400 || /request failed with status code/.test(msg)) return ERROR_CATEGORY.API;
    if (/ENOTFOUND|ECONNRESET|ETIMEDOUT|ECONNABORTED|EAI_AGAIN|NETWORK/i.test(code) || /timeout|getaddrinfo|network/i.test(msg)) return ERROR_CATEGORY.NETWORK;
    return ERROR_CATEGORY.UNKNOWN;
}

function logError({ category, scope = 'APP', message = 'Terjadi error', error, level = 'warn', maxLength = 160 } = {}) {
    const finalCategory = category || inferErrorCategory(error);
    const suffix = error ? `: ${safeMessage(error, maxLength)}` : '';
    const line = `[${finalCategory}] [${scope}] ${maskSensitiveText(message)}${suffix}`;
    if (level === 'error') console.error(line);
    else console.warn(line);
    return line;
}

function handleError(error, context = {}) {
    const scope = context.scope || 'APP';
    const detail = context.detail ? ` ${context.detail}` : '';
    const message = `[${new Date().toISOString()}] [${scope}]${detail} ${formatError(error)}`;

    if (context.level === 'warn') {
        console.warn(message);
    } else {
        console.error(message);
    }

    if (context.writeFile !== false) {
        const logFile = context.logFile || DEFAULT_LOG_FILE;
        fs.promises.appendFile(logFile, `${message}\n`).catch(() => {
            // Jangan lempar error dari logger agar bot tetap berjalan.
        });
    }

    if (context.stats && Array.isArray(context.stats.realtimeLogs)) {
        const entry = {
            time: new Date().toLocaleTimeString('id-ID', { hour12: false }),
            type: context.level === 'warn' ? 'warn' : 'error',
            message: `[${scope}] ${safeMessage(error, 180)}`,
        };
        context.stats.realtimeLogs.unshift(entry);
        if (context.stats.realtimeLogs.length > 200) context.stats.realtimeLogs.pop();
        context.logEmitter?.emit?.('log', entry);
    }

    return message;
}

function warnError(scope, message, error, options = {}) {
    return logError({
        category: options.category,
        scope,
        message,
        error,
        level: 'warn',
        maxLength: options.maxLength || 120,
    });
}

function createErrorHandler(baseContext = {}) {
    return {
        handleError(error, context = {}) {
            return handleError(error, { ...baseContext, ...context });
        },
        warnError(scope, message, error, options = {}) {
            return warnError(scope, message, error, options);
        },
        logError(options = {}) {
            return logError({ ...baseContext, ...options });
        },
        safeMessage,
    };
}

function ignoreExpectedError(error, context = {}) {
    if (context.log) {
        handleError(error, { ...context, level: 'warn' });
    }
}

async function executeWithRetry(fn, { retries = 3, delayMs = 1000, scope = 'RETRY' } = {}) {
    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            lastError = err;
            if (attempt === retries) break;
            const category = inferErrorCategory(err);
            if (category === ERROR_CATEGORY.NETWORK || category === ERROR_CATEGORY.RATE_LIMIT) {
                const waitTime = delayMs * Math.pow(2, attempt - 1);
                logError({ scope, message: `Percobaan ${attempt} gagal, mencoba ulang (${attempt}/${retries}) dalam ${waitTime}ms`, error: err, level: 'warn' });
                await new Promise(res => setTimeout(res, waitTime));
            } else {
                throw err;
            }
        }
    }
    throw lastError;
}

module.exports = {
    ERROR_CATEGORY,
    createErrorHandler,
    handleError,
    ignoreExpectedError,
    warnError,
    logError,
    safeMessage,
    formatError,
    maskSensitiveText,
    inferErrorCategory,
    executeWithRetry,
};
