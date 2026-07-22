/**
 * Message Processing Pipeline
 * Menangani tahap pra-pemrosesan pesan, routing command/intent, dan pembentukan konteks respon.
 */

function createMessagePipeline({ commandRouter, deterministicAnswerRouter, aiService, limitService }) {
    return {
        async processMessage(context) {
            const { message, senderName, senderUserId } = context;

            // 1. Cek Rate Limit & Daily Limit jika service tersedia
            if (limitService) {
                const isAllowed = await limitService.checkAndIncrementLimit(senderUserId, senderName);
                if (!isAllowed) {
                    return {
                        handled: true,
                        response: 'Maaf, batas penggunaan harian Anda telah habis.',
                    };
                }
            }

            // 2. Cek Command Router (Command terdaftar seperti .help, .profil, .kuis, dll)
            if (commandRouter) {
                const commandMatch = commandRouter.match(message);
                if (commandMatch) {
                    return {
                        handled: true,
                        isCommand: true,
                        match: commandMatch,
                    };
                }
            }

            // 3. Cek Deterministic Answer Router
            if (deterministicAnswerRouter) {
                const deterministicResult = await deterministicAnswerRouter.route(message, context);
                if (deterministicResult && deterministicResult.handled) {
                    return deterministicResult;
                }
            }

            // 4. Default ke AI Service jika tidak ditangani handler deterministik
            return {
                handled: false,
                requiresAi: true,
            };
        },
    };
}

module.exports = {
    createMessagePipeline,
};
