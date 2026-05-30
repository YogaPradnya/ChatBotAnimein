function normalizeKnowledgeItem(item = {}) {
    const keywords = Array.isArray(item.keywords)
        ? item.keywords.map(keyword => String(keyword).trim()).filter(Boolean)
        : [];

    return {
        domain: String(item.domain || 'general').trim().toLowerCase(),
        help_topic: item.help_topic ? String(item.help_topic).trim().toLowerCase() : '',
        help_label: item.help_label ? String(item.help_label).trim() : '',
        keywords: [...new Set(keywords)],
        info: item.info ? String(item.info).trim() : '',
        help_text: item.help_text ? String(item.help_text).trim() : '',
    };
}

function normalizeKnowledgeList(value) {
    const list = Array.isArray(value) ? value : [];
    return list
        .map(normalizeKnowledgeItem)
        .filter(item => item.info || item.help_text || item.keywords.length || item.help_topic)
        .sort((a, b) => {
            const domainCompare = a.domain.localeCompare(b.domain);
            if (domainCompare !== 0) return domainCompare;
            return (a.help_topic || a.help_label).localeCompare(b.help_topic || b.help_label);
        });
}

function findKnowledgeByHelpTopic(knowledgeList, helpArg) {
    const topic = String(helpArg || '').trim().toLowerCase();
    if (!topic) return null;

    const normalizedList = normalizeKnowledgeList(knowledgeList);
    let match = normalizedList.find(item => item.help_topic === topic);
    if (match) return match;

    let bestScore = 0;
    normalizedList.forEach(item => {
        const score = (item.keywords || []).filter(keyword => {
            const lk = keyword.toLowerCase();
            if (lk.length <= 3) return topic.split(/\s+/).includes(lk);
            return topic.includes(lk) || lk.includes(topic);
        }).length;
        if (score > bestScore) {
            bestScore = score;
            match = item;
        }
    });

    return match || null;
}

function buildKnowledgeContext(knowledgeList, question, detectedDomain = null) {
    const normalizedList = normalizeKnowledgeList(knowledgeList);
    const q = String(question || '').toLowerCase();
    const scopedKnowledge = detectedDomain
        ? normalizedList.filter(item => item.domain === detectedDomain)
        : normalizedList;

    const relevantKnowledge = scopedKnowledge.filter(item =>
        (item.keywords || []).some(keyword => q.includes(String(keyword).toLowerCase()))
    );

    const sourceList = relevantKnowledge.length ? relevantKnowledge : scopedKnowledge.slice(0, 3);
    return sourceList
        .map(item => item.info || item.help_text)
        .filter(Boolean)
        .join('\n');
}

function createKnowledgeRepo(settingsRepo, settingsKeys) {
    return {
        async loadList(key, fallback = []) {
            const value = await settingsRepo.get(key);
            if (!value) {
                if (fallback.length > 0) await settingsRepo.setJSON(key, normalizeKnowledgeList(fallback));
                return normalizeKnowledgeList(fallback);
            }
            return normalizeKnowledgeList(JSON.parse(value));
        },

        async saveList(key, list) {
            const normalized = normalizeKnowledgeList(list);
            await settingsRepo.setJSON(key, normalized);
            return normalized;
        },

        loadAnimeinKnowledge(fallback = []) {
            return this.loadList(settingsKeys.ANIMEIN_KNOWLEDGE, fallback);
        },

        saveAnimeinKnowledge(list) {
            return this.saveList(settingsKeys.ANIMEIN_KNOWLEDGE, list);
        },
    };
}

module.exports = {
    createKnowledgeRepo,
    normalizeKnowledgeItem,
    normalizeKnowledgeList,
    findKnowledgeByHelpTopic,
    buildKnowledgeContext,
};
