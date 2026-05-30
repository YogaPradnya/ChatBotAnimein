const { CONFIG, ANIMEIN_HEADERS, ANIMEIN_HEADERS_FULL, warnMissingConfig } = require('../config');
const { ENV_CONFIG, getEnv, getNumberEnv, warnMissingEnv } = require('./env');
const constants = require('./constants');

module.exports = {
    CONFIG,
    ENV_CONFIG,
    ANIMEIN_HEADERS,
    ANIMEIN_HEADERS_FULL,
    warnMissingConfig,
    warnMissingEnv,
    getEnv,
    getNumberEnv,
    ...constants,
};
