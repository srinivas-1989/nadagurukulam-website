// One-time fix: converts a mongodb+srv:// MONGODB_URI in backend/.env into a standard
// mongodb:// multi-host URI. Node's c-ares can reject Atlas's DNS SRV response
// (querySrv EBADRESP) even when the OS resolves it fine, and the non-SRV string
// avoids the SRV lookup entirely. Run from backend/: node scripts/fix-mongo-uri.js
// Never prints credentials — only success/failure and the host list.
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const line = env.split('\n').find(l => l.startsWith('MONGODB_URI='));
if (!line) { console.error('MONGODB_URI not found in .env'); process.exit(1); }
const uri = line.slice('MONGODB_URI='.length).trim().replace(/^["']|["']$/g, '');
if (!uri.startsWith('mongodb+srv://')) { console.log('Already non-SRV — nothing to do'); process.exit(0); }

const u = new URL(uri);
const user = decodeURIComponent(u.username), pass = decodeURIComponent(u.password);
const db = u.pathname.replace(/^\//, '') || 'admin';
const params = new URLSearchParams(u.search);
params.set('replicaSet', params.get('replicaSet') || 'ac-fcvmszr-shard-0');
params.set('tls', 'true');
params.set('authSource', params.get('authSource') || 'admin');

// Shard hosts come from CLI args if given (node scripts/fix-mongo-uri.js host1:27017 ...),
// else from a DNS SRV resolve — which is exactly what fails on this machine, so prefer args.
const argvHosts = process.argv.slice(2);
const mongoose = require('mongoose');

const connectAndSave = (hosts) => {
  const standard = `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${hosts.join(',')}/${db}?${params}`;
  (async () => {
    try {
      await mongoose.connect(standard, { serverSelectionTimeoutMS: 15000, dbName: db });
      const info = await mongoose.connection.db.admin().buildInfo();
      console.log('CONNECTED via standard URI — mongo', info.version);
      fs.writeFileSync(envPath, env.replace(line, 'MONGODB_URI="' + standard + '"'));
      console.log('.env updated: MONGODB_URI is now the standard (non-SRV) connection string');
      await mongoose.disconnect();
    } catch (e) {
      console.error('STANDARD URI FAILED TOO:', e.code || '', e.message);
      process.exit(1);
    }
  })();
};

if (argvHosts.length) {
  connectAndSave(argvHosts);
} else {
  require('dns').resolveSrv(`_mongodb._tcp.${u.hostname}`, (err, records) => {
    if (err || !records.length) {
      console.error('SRV resolve failed (' + (err ? err.code : 'no records') + ') — pass the shard hosts as args: node scripts/fix-mongo-uri.js host1:27017 host2:27017 host3:27017');
      process.exit(1);
    }
    connectAndSave(records.map(r => `${r.name}:${r.port}`));
  });
}
