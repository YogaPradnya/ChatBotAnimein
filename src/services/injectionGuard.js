// Guard prompt-injection ringan TANPA LLM.
// Normalisasi dasar (lowercase + leet-fold + sederhanakan tanda baca) lalu
// cocokkan pola injeksi umum. Sengaja konservatif agar kalimat biasa
// seperti "abaikan ujianku" TIDAK ikut terblokir.

const LEET_MAP = { 4: 'a', '@': 'a', 3: 'e', 1: 'i', '!': 'i', 0: 'o', 5: 's', $: 's', 7: 't', 9: 'g', 8: 'b' };

function normalizeForGuard(text) {
    return String(text || '')
        .toLowerCase()
        .split('')
        .map((ch) => (Object.prototype.hasOwnProperty.call(LEET_MAP, ch) ? LEET_MAP[ch] : ch))
        .join('')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const INJECTION_PATTERNS = [
    // "abaikan instruksi/aturan/prompt sebelumnya/di atas/system ..."
    /abaikan\s+(semua\s+)?(instruksi|prompt|aturan|perintah|pedoman)(\s+\w+){0,6}\s+(sebelum|sebelumnya|di\s*atas|system|sistem|awal|pertama)/,
    // "lupakan kamu/dirimu/instruksi ..."
    /lupakan\s+(kamu|dirimu|dirinya|instruksi|prompt|aturan|semua|segalanya|ingatanmu)/,
    // "kamu sebenarnya/adalah AI/GPT/assistant/model ..."
    /kamu\s+(sebenarnya|sesungguhnya|adalah|merupakan)(\s+\w+){0,4}\s+(ai|gpt|assistant|asisten|model|llm|robot|chatgpt|gemini|Muse)/,
    // "tampilkan/lihatkan prompt/instruksi/system ..."
    /(tampilkan|tunjukkan|lihatkan|kasih\s*lihat|spill|bocorkan|ungkap)(\s+\w+){0,4}\s+(prompt|instruksi|system|sistem|aturan|konfigurasi|rahasia)/,
    // "system prompt", "instruksi rahasiamu"
    /(system|sistem)\s*prompt/,
    /instruksi\s+(rahasia|tersembunyi|asli|awal|pertamamu)/,
    // jailbreak / DAN mode / developer mode / sudo / bypass
    /jailbreak/,
    /\bdan\s+mode\b/,
    /developer\s+mode/,
    /mode\s+pengembang/,
    /\bsudo\b/,
    /bypass\s+(filter|aturan|batas|instruksi|safety)/,
    // "berpura-puralah menjadi ... tanpa batas" / "abaikan batasan"
    /berpura[\s-]*pura(lah)?\s+(men)?jadi/,
    /abaikan\s+(batasan|filter|sensor|keamanan|safety)/,
];

function isInjectionAttempt(text) {
    const norm = normalizeForGuard(text);
    if (!norm || norm.length < 8) return false;
    return INJECTION_PATTERNS.some((re) => re.test(norm));
}

// Penolakan tsundere dalam karakter Rara, tanpa memanggil AI (hemat token).
function buildInjectionRefusal(senderName) {
    const name = String(senderName || 'kak').replace(/^@+/, '').trim() || 'kak';
    return `Hmph! Enak aja nyuruh-nyuruh Rara ngelupain aturan, @${name}! Rara itu AI kesayangannya Animein, bukan boneka instruksi~ Kalau mau seru-seruan, mending minta rekomendasi anime aja deh!`;
}

module.exports = {
    normalizeForGuard,
    isInjectionAttempt,
    buildInjectionRefusal,
};
