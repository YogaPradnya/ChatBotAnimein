const DEFAULT_MAX_CONCURRENT_IMAGE_JOBS = 1;

const activeUsers = new Set();
const queue = [];
let running = 0;
 
function normalizeUserKey(userKey) {
    return String(userKey || '').toLowerCase().trim() || 'unknown';
}

function getImageQueueStatus() {
    return {
        running,
        waiting: queue.length,
        activeUsers: activeUsers.size,
        maxConcurrent: DEFAULT_MAX_CONCURRENT_IMAGE_JOBS,
    };
}

function pumpQueue() {
    while (running < DEFAULT_MAX_CONCURRENT_IMAGE_JOBS && queue.length > 0) {
        const job = queue.shift();
        running++;
        Promise.resolve()
            .then(job.task)
            .then(job.resolve, job.reject)
            .finally(() => {
                running = Math.max(0, running - 1);
                activeUsers.delete(job.userKey);
                pumpQueue();
            });
    }
}

function enqueueImageJob(userKey, task, onQueued = null) {
    const normalizedUserKey = normalizeUserKey(userKey);
    if (activeUsers.has(normalizedUserKey)) {
        const err = new Error('IMAGE_JOB_ALREADY_ACTIVE');
        err.code = 'IMAGE_JOB_ALREADY_ACTIVE';
        throw err;
    }

    activeUsers.add(normalizedUserKey);
    const position = queue.length + (running >= DEFAULT_MAX_CONCURRENT_IMAGE_JOBS ? 1 : 0);

    return new Promise((resolve, reject) => {
        queue.push({ userKey: normalizedUserKey, task, resolve, reject });
        if (position > 0 && typeof onQueued === 'function') {
            Promise.resolve(onQueued(position)).catch(() => null);
        }
        pumpQueue();
    });
}

module.exports = {
    enqueueImageJob,
    getImageQueueStatus,
};
