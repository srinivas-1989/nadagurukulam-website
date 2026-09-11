// Diagnoses/fixes the MongoDB connection in backend/.env. Run from backend/:
//   node scripts/probe-mongo.js
// Tries (A) a direct connection to one Atlas shard host, then (B) the full
// replica-set standard URI. On the first success it rewrites MONGODB_URI in .env
// with the working standard (non-SRV) connection string.
// Background: Node's c-ares rejects Atlas's DNS SRV response (querySrv EBADRESP)
// even when the OS resolves it, so mongodb+srv:// URIs fail in Node on this
// machine — the standard multi-host URI avoids SRV entirely.
// Never prints credentials — only success/failure labels.
const fs = require('fs');
const path = require('path');
const envPath = path.join(__dirname, '..', '.env');
const env = fs.readFileSync(envPath, 'utf8');
const line = env.split('\n').find(l => l.startsWith('MONGODB_URI='));
if (!line) { console.error('MONGODB_URI not found in .env'); process.exit(1); }
const uri = line.slice('MONGODB_URI='.length).trim().replace(/^["']|["']$/g, '');
if (!uri.startsWith('mongodb+srv://')) { console.log('Already non-SRV — test with the running server instead'); process.exit(0); }

const u = new URL(uri);
const user = decodeURIComponent(u.username), pass = decodeURIComponent(u.password);
const db = u.pathname.replace(/^\//, '') || 'admin';
const enc = encodeURIComponent(user) + ':' + encodeURIComponent(pass);
const HOSTS = ['ac-fcvmszr-shard-00-00', 'ac-fcvmszr-shard-00-01', 'ac-fcvmszr-shard-00-02']
  .map(h => `${h}.e6leqhx.mongodb.net:27017`).join(',');
const mongoose = require('mongoose');

async function tryConnect(label, uri_, opts) {
  try {
    await mongoose.connect(uri_, opts);
    const info = await mongoose.connection.db.admin().buildInfo();
    console.log(label + ' → CONNECTED, mongo ' + info.version);
    await mongoose.disconnect();
    return true;
  } catch (e) {
    console.log(label + ' → FAILED: ' + (e.name || '') + ' ' + (e.code || '') + ' :: ' + (e.message || '').split('\n')[0]);
    try { await mongoose.disconnect(); } catch (_) {}
    return false;
  }
}

(async () => {
  const base = 'serverSelectionTimeoutMS=30000&connectTimeoutMS=20000';
  const direct = `mongodb://${enc}@ac-fcvmszr-shard-00-00.e6leqhx.mongodb.net:27017/${db}?tls=true&authSource=admin&directConnection=true&${base}`;
  if (await tryConnect('A direct+tls', direct, {})) {
    console.log('Direct works — replicaSet discovery is the problem. Investigate the replicaSet name before using the standard URI.');
    process.exit(0);
  }
  const rs = `mongodb://${enc}@${HOSTS}/${db}?tls=true&authSource=admin&replicaSet=ac-fcvmszr-shard-0&${base}`;
  if (await tryConnect('B replicaSet', rs, {})) {
    fs.writeFileSync(envPath, env.replace(line, 'MONGODB_URI="' + rs + '"'));
    console.log('.env updated with the working standard (non-SRV) URI — restart the backend.');
  } else {
    console.log('Both failed. Check: (1) Atlas Network Access allows this machine\'s public IP (curl -s https://api.ipify.org), (2) cluster is not paused, (3) credentials.');
    process.exit(1);
  }
})();