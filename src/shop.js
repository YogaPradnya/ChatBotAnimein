/**
 * Sistem Reward Shop (Toko Rara)
 * User bisa menukar XP untuk item: custom title, free hint, extra image limit.
 */

const SHOP_ITEMS = [
    {
        id: 1,
        name: 'Custom Title',
        description: 'Pilih gelar kustom dari daftar tersedia',
        price: 5000,
        type: 'custom_title',
        consumable: false,
    },
    {
        id: 2,
        name: 'Hint Pack (x3)',
        description: '3 hint gratis untuk kuis (tanpa potong XP)',
        price: 300,
        type: 'free_hint',
        consumable: true,
        quantity: 3,
    },
    {
        id: 3,
        name: 'Extra Gambar (+3)',
        description: '+3 limit gambar tambahan hari ini',
        price: 500,
        type: 'extra_image',
        consumable: true,
        quantity: 3,
    },
];

function getShopMessage() {
    const lines = [
        `-- TOKO RARA --`,
        `--------------------`,
    ];
    SHOP_ITEMS.forEach(item => {
        lines.push(`${item.id}. ${item.name} - ${item.price.toLocaleString('id-ID')} XP`);
        lines.push(`   ${item.description}`);
    });
    lines.push(`--------------------`);
    lines.push(`Ketik .beli [nomor]`);
    lines.push(`Contoh: .beli 2`);
    return lines.join('\n');
}

async function initShopTables(db) {
    await db.execute(`
        CREATE TABLE IF NOT EXISTS user_inventory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT NOT NULL,
            item_type TEXT NOT NULL,
            item_value TEXT DEFAULT '',
            quantity INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    // Unique constraint per user per item_type agar bisa di-upsert
    await db.execute(`CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_type ON user_inventory (username, item_type)`);
}

/**
 * Dapatkan jumlah item tertentu yang dimiliki user.
 */
async function getItemCount(db, username, itemType) {
    try {
        const res = await db.execute({
            sql: "SELECT quantity FROM user_inventory WHERE username = ? AND item_type = ?",
            args: [username, itemType]
        });
        return res.rows.length > 0 ? Number(res.rows[0].quantity) : 0;
    } catch (e) {
        console.warn(`[SHOP] Gagal cek inventory ${username}/${itemType}:`, e.message);
        return 0;
    }
}

/**
 * Tambah item ke inventory user.
 */
async function addItem(db, username, itemType, amount = 1, itemValue = '') {
    try {
        await db.execute({
            sql: `INSERT INTO user_inventory (username, item_type, item_value, quantity, updated_at)
                  VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                  ON CONFLICT(username, item_type) DO UPDATE SET
                  quantity = quantity + ?, item_value = CASE WHEN ? != '' THEN ? ELSE item_value END, updated_at = CURRENT_TIMESTAMP`,
            args: [username, itemType, itemValue, amount, amount, itemValue, itemValue]
        });
        return true;
    } catch (e) {
        console.warn(`[SHOP] Gagal tambah item ${itemType} ke ${username}:`, e.message);
        return false;
    }
}

/**
 * Gunakan (kurangi) item dari inventory.
 * Return true jika berhasil (item cukup), false jika gagal.
 */
async function useItem(db, username, itemType, amount = 1) {
    const current = await getItemCount(db, username, itemType);
    if (current < amount) return false;
    try {
        await db.execute({
            sql: "UPDATE user_inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? AND item_type = ?",
            args: [amount, username, itemType]
        });
        return true;
    } catch (e) {
        console.warn(`[SHOP] Gagal gunakan item ${itemType} dari ${username}:`, e.message);
        return false;
    }
}

/**
 * Proses pembelian item.
 * Mengembalikan { success, message, xpDeducted }.
 */
async function buyItem(db, username, itemId, userXP, extraArgs = {}) {
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
        return { success: false, message: 'Item tidak ditemukan. Ketik .shop untuk lihat daftar.' };
    }

    if (userXP < item.price) {
        return {
            success: false,
            message: `XP kamu tidak cukup. Butuh ${item.price.toLocaleString('id-ID')} XP, kamu punya ${userXP.toLocaleString('id-ID')} XP.`
        };
    }

    // Handle custom title: perlu argumen title
    if (item.type === 'custom_title') {
        const titleName = extraArgs.titleName;
        if (!titleName) {
            // Ambil daftar title yang tersedia
            try {
                const titleRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
                const titles = titleRes.rows.length > 0 ? JSON.parse(titleRes.rows[0].value) : [];
                if (titles.length === 0) {
                    return { success: false, message: 'Belum ada custom title yang tersedia. Hubungi admin.' };
                }
                const titleList = titles.map((t, i) => `  ${i + 1}. ${t}`).join('\n');
                return {
                    success: false,
                    message: `Pilih title yang kamu mau:\n${titleList}\n\nKetik: .beli 1 [nama title]\nContoh: .beli 1 ${titles[0]}`
                };
            } catch (e) {
                return { success: false, message: 'Gagal mengambil daftar title.' };
            }
        }

        // Validasi title ada di daftar
        try {
            const titleRes = await db.execute({ sql: "SELECT value FROM settings WHERE key = 'available_titles'" });
            const titles = titleRes.rows.length > 0 ? JSON.parse(titleRes.rows[0].value) : [];
            const matched = titles.find(t => t.toLowerCase() === titleName.toLowerCase());
            if (!matched) {
                return { success: false, message: `Title "${titleName}" tidak tersedia. Ketik .beli 1 untuk lihat daftar.` };
            }

            // Set custom title langsung di user_stats
            await db.execute({
                sql: "INSERT INTO user_stats (username, xp, level, custom_title) VALUES (?, 0, 1, ?) ON CONFLICT(username) DO UPDATE SET custom_title = ?",
                args: [username, matched, matched]
            });

            return { success: true, message: `Title berhasil diubah menjadi: ${matched}`, xpDeducted: item.price };
        } catch (e) {
            return { success: false, message: 'Gagal memproses pembelian title.' };
        }
    }

    // Consumable items
    const added = await addItem(db, username, item.type, item.quantity || 1);
    if (!added) {
        return { success: false, message: 'Gagal menambahkan item ke inventory.' };
    }

    return {
        success: true,
        message: `Berhasil membeli ${item.name}! (+${item.quantity || 1} ${item.type})`,
        xpDeducted: item.price,
    };
}

module.exports = {
    SHOP_ITEMS,
    getShopMessage,
    initShopTables,
    getItemCount,
    addItem,
    useItem,
    buyItem,
};
