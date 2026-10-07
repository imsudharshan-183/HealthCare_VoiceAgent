import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { ensureKbIndex, ingestDoc } from './kb.js';

await ensureKbIndex();
for (const f of await readdir('knowledge')) {
  if (!/\.(md|txt)$/i.test(f)) continue;
  const n = await ingestDoc(f, await readFile(`knowledge/${f}`, 'utf8'));
  console.log(`[kb] ${f}: ${n} chunks`);
}
process.exit(0);