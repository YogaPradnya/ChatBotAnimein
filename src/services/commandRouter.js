function createCommandRouter() {
    const exact = new Map();
    const prefixes = [];

    function register(commandNames, handler, options = {}) {
        const names = Array.isArray(commandNames) ? commandNames : [commandNames];
        for (const name of names) {
            const normalized = String(name).toLowerCase();
            if (options.prefix) {
                prefixes.push({ name: normalized, handler });
            } else {
                exact.set(normalized, handler);
            }
        }
        return api;
    }

    function resolve(messageText) {
        const lower = String(messageText || '').toLowerCase().trim();
        const firstToken = lower.split(/\s+/)[0];

        if (exact.has(lower)) return exact.get(lower);
        if (exact.has(firstToken)) return exact.get(firstToken);

        for (const entry of prefixes) {
            if (lower === entry.name || lower.startsWith(`${entry.name} `)) {
                return entry.handler;
            }
        }
        return null;
    }

    async function execute(context) {
        const handler = resolve(context.lowerMsg);
        if (!handler) return false;
        await handler(context);
        return true;
    }

    const api = { register, resolve, execute };
    return api;
}

module.exports = {
    createCommandRouter,
};
