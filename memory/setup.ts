import 'dotenv/config';
import { ensureIndexes } from './memory.js';
import { ensureRecordIndexes } from './records.js';

await ensureIndexes();
await ensureRecordIndexes();
console.log('done');
process.exit(0);