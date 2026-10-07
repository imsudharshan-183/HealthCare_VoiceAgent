import 'dotenv/config';
import { hashCallerId, forgetCaller } from './memory.js';

const raw = process.env.TEST_CALLER_ID ?? 'test-caller-1';
console.log('deleted', await forgetCaller(hashCallerId(raw)));
process.exit(0);