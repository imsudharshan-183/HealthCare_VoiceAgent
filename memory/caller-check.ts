import 'dotenv/config';
import { resolveCallerId } from './caller.js';

const r = resolveCallerId('test-caller-memory-isolated');
console.log(
  r.rawId === process.env.TEST_CALLER_ID ? 'RESOLVES TO TEST_CALLER_ID (bug)' : 'isolated (ok)',
  '| hash prefix:', r.callerHash.slice(0, 8),
);
process.exit(0);