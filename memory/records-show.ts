import 'dotenv/config';
import { hashCallerId } from './memory.js';
import { getDb } from '../rag/store.js';

const db = await getDb();
const id = hashCallerId(process.env.TEST_CALLER_ID ?? 'test-caller-1');

console.log(`database: ${db.databaseName}`);
for (const name of ['memories', 'caller_profiles', 'incidents']) {
  console.log(`  ${name}: ${await db.collection(name).countDocuments()} document(s) in total`);
}

console.log('\n--- caller_profiles (fixed details for the test caller)');
const profile = await db.collection('caller_profiles').findOne({ callerId: id }, { projection: { _id: 0, callerId: 0 } });
console.log(profile ?? '(none yet)');

console.log('\n--- incidents (latest 10 for the test caller)');
const list = await db
  .collection('incidents')
  .find({ callerId: id }, { projection: { _id: 0, callerId: 0 } })
  .sort({ reportedAt: -1 })
  .limit(10)
  .toArray();
console.log(list.length ? list : '(none yet)');

console.log('\n--- memories (general notes, no medical details)');
const mem = await db
  .collection('memories')
  .find({ callerId: id }, { projection: { _id: 0, text: 1, type: 1 } })
  .toArray();
console.log(mem.length ? mem : '(none yet)');
process.exit(0);