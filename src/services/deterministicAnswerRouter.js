function createDeterministicAnswerRouter(handlers = []) {
    const safeHandlers = Array.isArray(handlers) ? handlers.filter(Boolean) : [];

    async function run(ctx = {}) {
        for (const handler of safeHandlers) {
            const result = await handler(ctx);
            if (result) return result;
        }
        return null;
    }

    return {
        run,
    };
}

module.exports = {
    createDeterministicAnswerRouter,
};
