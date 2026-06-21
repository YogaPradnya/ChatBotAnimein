function createShopRepo(db) {
    return {
        initTables() {
            return Promise.all([
                db.execute(`
                    CREATE TABLE IF NOT EXISTS user_inventory (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        user_id TEXT NOT NULL,
                        username TEXT NOT NULL DEFAULT '',
                        item_type TEXT NOT NULL,
                        item_value TEXT DEFAULT '',
                        quantity INTEGER DEFAULT 0,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `),
                db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_type ON user_inventory (user_id, item_type)'),
            ]);
        },

        getItemCount(userId, itemType) {
            return db.execute({
                sql: 'SELECT quantity FROM user_inventory WHERE user_id = ? AND item_type = ?',
                args: [userId, itemType],
            });
        },

        addItem(userId, username, itemType, amount = 1, itemValue = '') {
            return db.execute({
                sql: `INSERT INTO user_inventory (user_id, username, item_type, item_value, quantity, updated_at)
                      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                      ON CONFLICT(user_id, item_type) DO UPDATE SET
                      quantity = quantity + ?, item_value = CASE WHEN ? != '' THEN ? ELSE item_value END, username = ?, updated_at = CURRENT_TIMESTAMP`,
                args: [userId, username, itemType, itemValue, amount, amount, itemValue, itemValue, username],
            });
        },

        useItem(userId, itemType, amount = 1) {
            return db.execute({
                sql: 'UPDATE user_inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND item_type = ?',
                args: [amount, userId, itemType],
            });
        },

        setCustomTitle(userId, username, titleName) {
            return db.execute({
                sql: 'INSERT INTO user_stats (user_id, username, xp, level, custom_title) VALUES (?, ?, 0, 1, ?) ON CONFLICT(user_id) DO UPDATE SET custom_title = ?, username = ?',
                args: [userId, username, titleName, titleName, username],
            });
        },
    };
}

module.exports = { createShopRepo };
