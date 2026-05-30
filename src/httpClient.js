const { gotScraping } = require('got-scraping');

async function httpClient(config) {
    const method = (config.method || 'GET').toUpperCase();
    let responseType = config.responseType || 'json';
    if (responseType === 'arraybuffer') {
        responseType = 'buffer';
    }

    const gotOptions = {
        method,
        url: config.url,
        responseType,
    };

    if (config.headers) {
        const cleanedHeaders = { ...config.headers };
        for (const key of Object.keys(cleanedHeaders)) {
            if (key.toLowerCase() === 'user-agent') {
                delete cleanedHeaders[key];
            }
        }
        gotOptions.headers = cleanedHeaders;
    }

    if (config.params) {
        gotOptions.searchParams = config.params;
    }

    if (config.data) {
        if (config.data.constructor && config.data.constructor.name === 'FormData') {
            gotOptions.body = config.data;
        } else if (config.data instanceof URLSearchParams || typeof config.data === 'string') {
            gotOptions.body = config.data.toString();
        } else if (config.headers && config.headers['Content-Type'] === 'application/x-www-form-urlencoded') {
            gotOptions.form = config.data;
        } else {
            gotOptions.json = config.data;
        }
    }

    if (config.timeout) {
        gotOptions.timeout = { request: config.timeout };
    }

    try {
        const response = await gotScraping(gotOptions);
        return {
            data: response.body,
            status: response.statusCode,
            headers: response.headers
        };
    } catch (error) {
        if (error.response) {
            error.response.data = error.response.body;
            error.status = error.response.statusCode;
        }
        throw error;
    }
}

httpClient.get = async function(url, config = {}) {
    return httpClient({ ...config, method: 'GET', url });
};

httpClient.post = async function(url, data, config = {}) {
    return httpClient({ ...config, method: 'POST', url, data });
};

module.exports = httpClient;
