function createShopRepo(db) {
    return {
        initTables() {
            return Promise.all([
                db.execute(`
                    CREATE TABLE IF NOT EXISTS user_inventory (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL,
                        item_type TEXT NOT NULL,
                        item_value TEXT DEFAULT '',
                        quantity INTEGER DEFAULT 0,
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                `),
                db.execute('CREATE UNIQUE INDEX IF NOT EXISTS idx_inventory_user_type ON user_inventory (username, item_type)'),
            ]);
        },

        getItemCount(username, itemType) {
            return db.execute({
                sql: 'SELECT quantity FROM user_inventory WHERE username = ? AND item_type = ?',
                args: [username, itemType],
            });
        },

        addItem(username, itemType, amount = 1, itemValue = '') {
            return db.execute({
                sql: `INSERT INTO user_inventory (username, item_type, item_value, quantity, updated_at)
                      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
                      ON CONFLICT(username, item_type) DO UPDATE SET
                      quantity = quantity + ?, item_value = CASE WHEN ? != '' THEN ? ELSE item_value END, updated_at = CURRENT_TIMESTAMP`,
                args: [username, itemType, itemValue, amount, amount, itemValue, itemValue],
            });
        },

        useItem(username, itemType, amount = 1) {
            return db.execute({
                sql: 'UPDATE user_inventory SET quantity = quantity - ?, updated_at = CURRENT_TIMESTAMP WHERE username = ? AND item_type = ?',
                args: [amount, username, itemType],
            });
        },

        setCustomTitle(username, titleName) {
            return db.execute({
                sql: 'INSERT INTO user_stats (username, xp, level, custom_title) VALUES (?, 0, 1, ?) ON CONFLICT(username) DO UPDATE SET custom_title = ?',
                args: [username, titleName, titleName],
            });
        },
    };
}

module.exports = { createShopRepo };
