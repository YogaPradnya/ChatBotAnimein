function createReportRepo(db) {
    async function createReport(username, message) {
        return db.execute({
            sql: 'INSERT INTO laporan (username, pesan) VALUES (?, ?)',
            args: [username, message],
        });
    }

    async function listReports(limit = 100) {
        return db.execute({
            sql: 'SELECT * FROM laporan ORDER BY id DESC LIMIT ?',
            args: [limit],
        });
    }

    async function updateReportStatus(id, status) {
        return db.execute({
            sql: 'UPDATE laporan SET status = ? WHERE id = ?',
            args: [status, id],
        });
    }

    async function deleteReport(id) {
        return db.execute({
            sql: 'DELETE FROM laporan WHERE id = ?',
            args: [id],
        });
    }

    async function deleteAllReports() {
        return db.execute('DELETE FROM laporan');
    }

    async function countReports() {
        return db.execute('SELECT COUNT(*) as count FROM laporan');
    }

    return {
        createReport,
        listReports,
        updateReportStatus,
        deleteReport,
        deleteAllReports,
        countReports,
    };
}

module.exports = {
    createReportRepo,
};
