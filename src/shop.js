/**
 * Sistem Reward Shop (Toko Rara)
 * User bisa menukar XP untuk item: custom title, free hint, extra image limit.
 */

const { createShopRepo } = require('./database/shopRepo');

const SHOP_ITEMS = [
    {
        id: 1,
        name: 'Custom Title',
        description: 'Pilih gelar kustom',
        price: 6500,
        type: 'custom_title',
        consumable: false,
    },
    {
        id: 2,
        name: 'Hint Pack (x3)',
        description: '3 hint gratis kuis',
        price: 1800,
        type: 'free_hint',
        consumable: true,
        quantity: 3,
    },
    {
        id: 3,
        name: 'Extra Gambar (+3)',
        description: '+3 limit gambar',
        price: 3000,
        type: 'extra_image',
        consumable: true,
        quantity: 3,
    },
    {
        id: 4,
        name: 'Extra Limit (+1)',
        description: '+1 limit hari ini',
        price: 2500,
        type: 'extra_cmd_limit',
        consumable: true,
        quantity: 1,
    },
];

function resolveShopRepo(repoOrDb) {
    if (repoOrDb && typeof repoOrDb.getItemCount === 'function' && typeof repoOrDb.addItem === 'function') {
        return repoOrDb;
    }
    return createShopRepo(repoOrDb);
}

function getItemPrice(item) {
    let basePrice = item.price;
    if (global.priceCustomTitle !== undefined) {
        if (item.type === 'custom_title') basePrice = global.priceCustomTitle;
        if (item.type === 'free_hint') basePrice = global.priceHintPack;
        if (item.type === 'extra_image') basePrice = global.priceExtraImage;
        if (item.type === 'extra_cmd_limit') basePrice = global.priceExtraLimit;
    }
    
    if (global.isDiscountEvent) {
        const factor = (100 - (global.discountPercent || 50)) / 100;
        return Math.floor(basePrice * factor);
    }
    return basePrice;
}

function getShopMessage() {
    const lines = [
        `┌── 🛒 𝗧𝗢𝗞𝗢 𝗥𝗔𝗥𝗔`,
        `├───────────────────`,
    ];
    SHOP_ITEMS.forEach(item => {
        const finalPrice = getItemPrice(item);
        const p = finalPrice.toLocaleString('id-ID');
        const discountTag = global.isDiscountEvent ? ` (🎁 DISKON ${global.discountPercent}%)` : '';
        lines.push(`│ ${item.id}. ${item.name}`);
        lines.push(`│   ${p} XP${discountTag}`);
        lines.push(`│   ${item.description}`);
    });
    lines.push(`├───────────────────`);
    lines.push(`│ .beli [nomor]`);
    lines.push(`│ Cth: .beli 2`);
    lines.push(`└───────────────────`);
    return lines.join('\n');
}

async function initShopTables(repoOrDb) {
    const shopRepo = resolveShopRepo(repoOrDb);
    await shopRepo.initTables();
}

/**
 * Dapatkan jumlah item tertentu yang dimiliki user.
 */
async function getItemCount(repoOrDb, userId, itemType) {
    const shopRepo = resolveShopRepo(repoOrDb);
    try {
        const res = await shopRepo.getItemCount(userId, itemType);
        return res.rows.length > 0 ? Number(res.rows[0].quantity) : 0;
    } catch (e) {
        console.warn(`[SHOP] Gagal cek inventory ${userId}/${itemType}:`, e.message);
        return 0;
    }
}

/**
 * Tambah item ke inventory user.
 */
async function addItem(repoOrDb, userId, username, itemType, amount = 1, itemValue = '') {
    const shopRepo = resolveShopRepo(repoOrDb);
    try {
        await shopRepo.addItem(userId, username, itemType, amount, itemValue);
        return true;
    } catch (e) {
        console.warn(`[SHOP] Gagal tambah item ${itemType} ke ${username}(${userId}):`, e.message);
        return false;
    }
}

/**
 * Gunakan (kurangi) item dari inventory.
 * Return true jika berhasil (item cukup), false jika gagal.
 */
async function useItem(repoOrDb, userId, itemType, amount = 1) {
    const shopRepo = resolveShopRepo(repoOrDb);
    const current = await getItemCount(shopRepo, userId, itemType);
    if (current < amount) return false;
    try {
        await shopRepo.useItem(userId, itemType, amount);
        return true;
    } catch (e) {
        console.warn(`[SHOP] Gagal gunakan item ${itemType} dari ${userId}:`, e.message);
        return false;
    }
}

/**
 * Proses pembelian item.
 * Mengembalikan { success, message, xpDeducted }.
 */
async function buyItem(repoOrDb, userId, username, itemId, userXP, extraArgs = {}) {
    const shopRepo = resolveShopRepo(repoOrDb);
    const item = SHOP_ITEMS.find(i => i.id === itemId);
    if (!item) {
        return { success: false, message: 'Item tidak ditemukan. Ketik .toko untuk lihat daftar.' };
    }

    const quantity = extraArgs.quantity || 1;
    if (quantity < 1) {
        return { success: false, message: 'Jumlah pembelian minimal 1.' };
    }

    if (item.type === 'custom_title' && quantity > 1) {
        return { success: false, message: 'Custom Title tidak bisa dibeli dalam jumlah banyak.' };
    }

    const totalPrice = getItemPrice(item) * quantity;
    if (userXP < totalPrice) {
        return {
            success: false,
            message: `XP kamu tidak cukup. Butuh ${totalPrice.toLocaleString('id-ID')} XP, kamu punya ${userXP.toLocaleString('id-ID')} XP.`
        };
    }

    // Handle custom title: perlu argumen title
    if (item.type === 'custom_title') {
        const titleName = extraArgs.titleName ? extraArgs.titleName.trim() : '';
        if (!titleName) {
            return {
                success: false,
                message: `Ketik nama title yang kamu inginkan.\nContoh: .beli 1 Yogaa Ganteng`
            };
        }

        if (titleName.length > 15) {
            return {
                success: false,
                message: `Nama title terlalu panjang (maksimal 15 karakter).`
            };
        }

        try {
            // Set custom title langsung di user_stats
            await shopRepo.setCustomTitle(userId, username, titleName);

            return { success: true, message: `Title berhasil diubah menjadi: ${titleName}`, xpDeducted: totalPrice };
        } catch (e) {
            return { success: false, message: 'Gagal memproses pembelian title.' };
        }
    }

    // Consumable items
    const totalQuantity = (item.quantity || 1) * quantity;
    const added = await addItem(shopRepo, userId, username, item.type, totalQuantity);
    if (!added) {
        return { success: false, message: 'Gagal menambahkan item ke inventory.' };
    }

    return {
        success: true,
        message: `Berhasil membeli ${quantity}x ${item.name}! (+${totalQuantity} ${item.type})`,
        xpDeducted: totalPrice,
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
