/**
 * Client build output'unu server/public/ icine kopyalar.
 * Tek Railway service ile hem API hem frontend serve edilir.
 *
 * Calistirma: node scripts/copy-client-to-server.cjs
 * Veya: npm run build (otomatik cagirir)
 */

const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = path.join(root, 'client', 'dist');
const dest = path.join(root, 'server', 'public');

if (!fs.existsSync(src)) {
  console.error(`[copy-client] client/dist bulunamadi: ${src}`);
  console.error('[copy-client] Once `npm run build --workspace=client` calistirin');
  process.exit(1);
}

// Hedef klasor
fs.mkdirSync(dest, { recursive: true });

// Mevcut icerigi temizle
for (const entry of fs.readdirSync(dest)) {
  const entryPath = path.join(dest, entry);
  fs.rmSync(entryPath, { recursive: true, force: true });
}

// Kopyala
function copyDir(srcDir, destDir) {
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(destPath, { recursive: true });
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

copyDir(src, dest);

const size = fs.readdirSync(dest, { withFileTypes: true })
  .filter(e => e.isFile())
  .reduce((acc, e) => acc + fs.statSync(path.join(dest, e.name)).size, 0);
console.log(`[copy-client] ${src} -> ${dest} (${(size / 1024).toFixed(1)} KB)`);
