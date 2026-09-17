#!/usr/bin/env node
/**
 * Build sonrasi scripts/ icindeki .js ve .sql dosyalarini dist/scripts/ icine
 * kopyalar. tsc bunlari otomatik kopyalamaz cunku:
 *   1) scripts/ rootDir disinda (src/ rootDir oldu)
 *   2) .js dosyalari tsc tarafindan emit edilmez
 *
 * Boylece `node dist/scripts/apply-migration.js` gibi CLI scriptler
 * build sonrasi hala calisir.
 */

const fs = require('fs');
const path = require('path');

const SRC_DIR = __dirname; // server/scripts/
const DST_DIR = path.join(__dirname, '..', 'dist', 'scripts');

// Bu dosyanin kendisi kopyalanmamali (sonsuz dongu)
const SELF = path.basename(__filename);

fs.mkdirSync(DST_DIR, { recursive: true });

let count = 0;
for (const file of fs.readdirSync(SRC_DIR)) {
  if (file === SELF) continue;
  const src = path.join(SRC_DIR, file);
  const dst = path.join(DST_DIR, file);
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    fs.copyFileSync(src, dst);
    count++;
  }
}

console.log(`[copy-scripts] ${count} dosya dist/scripts/ icine kopyalandi.`);
