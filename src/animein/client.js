function createAnimeinClient({ axios, baseUrl, defaultHeaders = {}, recordPath = () => {} }) {
    function normalizeBaseUrl() {
        return String(typeof baseUrl === 'function' ? baseUrl() : baseUrl || '').replace(/\/$/, '');
    }

    function normalizePath(routePath) {
        if (/^https?:\/\//i.test(routePath)) return routePath;
        return routePath.startsWith('/') ? routePath : `/${routePath}`;
    }

    function buildUrl(routePath) {
        const normalizedPath = normalizePath(routePath);
        if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
        return `${normalizeBaseUrl()}${normalizedPath}`;
    }

    function buildHeaders(extraHeaders = {}) {
        return {
            ...defaultHeaders,
            ...extraHeaders,
        };
    }

    function track(routePath) {
        if (!/^https?:\/\//i.test(routePath)) {
            recordPath(normalizePath(routePath));
        }
    }

    async function get(routePath, options = {}) {
        const { headers, ...rest } = options;
        track(routePath);
        return axios.get(buildUrl(routePath), {
            ...rest,
            headers: buildHeaders(headers),
        });
    }

    async function post(routePath, data, options = {}) {
        const { headers, ...rest } = options;
        track(routePath);
        return axios.post(buildUrl(routePath), data, {
            ...rest,
            headers: buildHeaders(headers),
        });
    }

    async function postForm(routePath, form, options = {}) {
        const formHeaders = typeof form.getHeaders === 'function' ? form.getHeaders() : {};
        return post(routePath, form, {
            ...options,
            headers: buildHeaders({
                ...formHeaders,
                ...(options.headers || {}),
            }),
        });
    }

    return {
        buildUrl,
        buildHeaders,
        get,
        post,
        postForm,
    };
}

module.exports = {
    createAnimeinClient,
};
