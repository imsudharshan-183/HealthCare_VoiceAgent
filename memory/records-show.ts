import 'dotenv/config';
import { resolveCallerId } from './caller.js';
import { getDb } from '../rag/store.js';

const db = await getDb();
const { rawId, callerHash: id } = resolveCallerId();

console.log(`database: ${db.databaseName}`);
console.log(`[callerId resolution] rawId: "${rawId}", callerHash: "${id}"`);

for (const name of ['memories', 'caller_profiles', 'caller_contacts', 'incidents']) {
  console.log(`  ${name}: ${await db.collection(name).countDocuments()} document(s) in total`);
}

console.log('\n--- caller_profiles (details for this caller)');
const profile = await db.collection('caller_profiles').findOne({ callerId: id }, { projection: { _id: 0, callerId: 0 } });
console.log(profile ?? '(none yet)');

console.log('\n--- caller_contacts (contacts for this caller)');
const contactsList = await db
  .collection('caller_contacts')
  .find({ callerId: id }, { projection: { _id: 0, callerId: 0 } })
  .sort({ name: 1 })
  .toArray();
console.log(contactsList.length ? contactsList : '(none yet)');

console.log('\n--- incidents (latest 10 for this caller)');
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