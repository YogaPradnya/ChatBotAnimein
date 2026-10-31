#!/usr/bin/env node
// Generate kunci Ed25519 + token JWT untuk sqld self-hosted (SQLD_AUTH_JWT_KEY).
//
// sqld memverifikasi JWT dengan public key Ed25519 dalam bentuk base64url
// (raw 32 byte, dari JWK .x) — bukan PEM. Token yang dibuat di sini tidak
// punya masa berlaku (non-expiring):
//   - secrets/sqld-jwt.token    = read-write, untuk bot & webcard (TURSO_AUTH_TOKEN)
//   - secrets/sqld-jwt-ro.token = read-only,  untuk service backup (SQLD_BACKUP_TOKEN)
//
// Penggunaan:
//   node scripts/sqld-keygen.js              # generate baru (tolak jika sudah ada)
//   node scripts/sqld-keygen.js --force      # timpa semua (ROTASI kunci — token lama langsung mati)
//   node scripts/sqld-keygen.js --from-key   # buat ulang token dari private key yang ada
//                                            # (tanpa mengubah kunci server)
//
// Output di folder secrets/ (gitignored):
//   sqld-jwt.key        private key (PKCS8 PEM) — simpan di password manager,
//                       tidak dipakai oleh server; berguna untuk --from-key
//   sqld-jwt-pub.b64    public key base64url -> isi SQLD_AUTH_JWT_KEY di compose sqld
//   sqld-jwt.token      JWT read-write        -> isi TURSO_AUTH_TOKEN (bot + webcard)
//   sqld-jwt-ro.token   JWT read-only         -> isi SQLD_BACKUP_TOKEN (service backup)

'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const SECRETS_DIR = path.join(ROOT, 'secrets');
const FILES = {
    key: path.join(SECRETS_DIR, 'sqld-jwt.key'),
    pub: path.join(SECRETS_DIR, 'sqld-jwt-pub.b64'),
    token: path.join(SECRETS_DIR, 'sqld-jwt.token'),
    tokenRo: path.join(SECRETS_DIR, 'sqld-jwt-ro.token'),
};

function b64url(data) {
    return Buffer.from(data).toString('base64url');
}

function makeToken(privateKey, claims) {
    const header = b64url(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' }));
    const payload = b64url(JSON.stringify(claims));
    const signingInput = header + '.' + payload;
    const signature = crypto.sign(null, Buffer.from(signingInput), privateKey);
    return signingInput + '.' + signature.toString('base64url');
}

function verifyToken(token, publicKey) {
    const parts = String(token).split('.');
    if (parts.length !== 3) return false;
    return crypto.verify(
        null,
        Buffer.from(parts[0] + '.' + parts[1]),
        publicKey,
        Buffer.from(parts[2], 'base64url')
    );
}

function printUsage() {
    console.log('Penggunaan: node scripts/sqld-keygen.js [--force | --from-key]');
}

function main() {
    const argv = process.argv.slice(2);
    const force = argv.includes('--force');
    const fromKey = argv.includes('--from-key');

    if (argv.includes('-h') || argv.includes('--help')) {
        printUsage();
        return;
    }

    if (force && fromKey) {
        console.error('[keygen] --force dan --from-key tidak bisa dipakai bersama.');
        console.error('  --force    = buat kunci BARU (rotasi)');
        console.error('  --from-key = pakai kunci yang sudah ada di secrets/sqld-jwt.key');
        process.exitCode = 2;
        return;
    }

    let publicKey;
    let privateKey;

    if (fromKey) {
        if (!fs.existsSync(FILES.key)) {
            console.error('[keygen] Tidak ada ' + path.relative(ROOT, FILES.key) + '.');
            console.error('[keygen] Jalankan dulu tanpa opsi untuk generate kunci baru.');
            process.exitCode = 1;
            return;
        }
        // Kunci server tidak berubah; hanya token yang ditulis ulang.
        privateKey = crypto.createPrivateKey(fs.readFileSync(FILES.key, 'utf8'));
        publicKey = crypto.createPublicKey(privateKey);
    } else {
        const existing = Object.values(FILES).filter((f) => fs.existsSync(f));
        if (existing.length > 0 && !force) {
            console.error('[keygen] File berikut sudah ada:');
            for (const f of existing) console.error('  - ' + path.relative(ROOT, f));
            console.error('[keygen] Jalankan dengan --force untuk ROTASI kunci baru,');
            console.error('[keygen] atau --from-key untuk memperbarui token dari kunci yang ada.');
            process.exitCode = 1;
            return;
        }
        ({ publicKey, privateKey } = crypto.generateKeyPairSync('ed25519'));
    }

    const jwk = publicKey.export({ format: 'jwk' });
    const pubB64 = String(jwk.x).replace(/=+$/, '');
    if (Buffer.from(pubB64, 'base64url').length !== 32) {
        console.error('[keygen] Public key bukan 32 byte — dibatalkan (jangan lanjut).');
        process.exitCode = 1;
        return;
    }

    const rwToken = makeToken(privateKey, {});            // claims kosong = akses penuh
    const roToken = makeToken(privateKey, { a: 'ro' });   // read-only

    if (!verifyToken(rwToken, publicKey) || !verifyToken(roToken, publicKey)) {
        console.error('[keygen] Self-check signature gagal — batal menulis file.');
        process.exitCode = 1;
        return;
    }

    fs.mkdirSync(SECRETS_DIR, { recursive: true, mode: 0o700 });
    if (!fromKey) {
        fs.writeFileSync(FILES.key, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    }
    fs.writeFileSync(FILES.pub, pubB64 + '\n', { mode: 0o600 });
    fs.writeFileSync(FILES.token, rwToken + '\n', { mode: 0o600 });
    fs.writeFileSync(FILES.tokenRo, roToken + '\n', { mode: 0o600 });

    console.log('');
    console.log('[keygen] OK.' + (fromKey ? ' Token dibuat ulang dari kunci yang ada.' : ' Kunci baru dibuat.'));
    console.log('');
    console.log('  sqld-jwt.key       private key  (simpan di password manager; JANGAN commit)');
    console.log('  sqld-jwt-pub.b64   -> SQLD_AUTH_JWT_KEY  (env compose sqld)');
    console.log('  sqld-jwt.token     -> TURSO_AUTH_TOKEN   (bot Render + webcard, read-write)');
    console.log('  sqld-jwt-ro.token  -> SQLD_BACKUP_TOKEN  (service backup, read-only)');
    console.log('');
    console.log('--- nilai SQLD_AUTH_JWT_KEY ---');
    console.log(pubB64);
    console.log('');
    console.log('Folder secrets/ sudah ada di .gitignore. Token non-expiring — jaga kerahasiaannya.');
    if (force) {
        console.log('ROTASI: perbarui SQLD_AUTH_JWT_KEY + kedua token di Coolify/Render, lalu redeploy sqld.');
    }
}

main();
