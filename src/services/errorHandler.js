const fs = require('fs');
const path = require('path');

const DEFAULT_LOG_FILE = path.join(process.cwd(), 'realtime_logs.txt');

function formatError(error) {
    if (!error) return 'Unknown error';
    if (error.stack) return error.stack;
    if (error.message) return error.message;
    return String(error);
}

function safeMessage(error, maxLength = 120) {
    const raw = error?.message || String(error || 'Unknown error');
    if (!maxLength || raw.length <= maxLength) return raw;
    return raw.slice(0, maxLength);
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
            message: `[${scope}] ${error?.message || String(error)}`,
        };
        context.stats.realtimeLogs.unshift(entry);
        if (context.stats.realtimeLogs.length > 200) context.stats.realtimeLogs.pop();
        context.logEmitter?.emit?.('log', entry);
    }

    return message;
}

function warnError(scope, message, error, options = {}) {
    const suffix = error ? `: ${safeMessage(error, options.maxLength || 120)}` : '';
    console.warn(`[${scope}] ${message}${suffix}`);
}

function createErrorHandler(baseContext = {}) {
    return {
        handleError(error, context = {}) {
            return handleError(error, { ...baseContext, ...context });
        },
        warnError(scope, message, error, options = {}) {
            return warnError(scope, message, error, options);
        },
        safeMessage,
    };
}

function ignoreExpectedError(error, context = {}) {
    if (context.log) {
        handleError(error, { ...context, level: 'warn' });
    }
}

module.exports = {
    createErrorHandler,
    handleError,
    ignoreExpectedError,
    warnError,
    safeMessage,
    formatError,
};
