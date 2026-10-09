import 'dotenv/config';
import { resolveCallerId } from './caller.js';
import { getDb } from '../rag/store.js';

const arg = (n: string) => process.argv.find(a => a.startsWith(`--${n}=`))?.split('=')[1];
const APPLY = process.argv.includes('--apply');
const INCLUDE_MEM = process.argv.includes('--include-memories');
const EXPECT = arg('expect-prefix') ?? '';
const NEW_NAME = arg('name') ?? 'Tom';

const { callerHash: h } = resolveCallerId();
if (!EXPECT || !h.startsWith(EXPECT)) {
  console.log(`abort: caller prefix ${h.slice(0, 8)} does not match --expect-prefix`);
  process.exit(1);
}

const FAKE = /\b(lakshmi|amma|arun|mehta|penicillin|sulfa)\b/i;
const db = await getDb();
const profiles = db.collection('caller_profiles');
const contacts = db.collection('caller_contacts');
const mem = db.collection('memories'); // ASSUMED collection name

console.log(APPLY ? 'MODE: APPLY' : 'MODE: DRY RUN (nothing is written)');
console.log('caller prefix:', h.slice(0, 8));

const p: any = await profiles.findOne({ callerId: h });
console.log(
  'profile now:',
  p
    ? JSON.stringify({
        name: p.name, preferredName: p.preferredName, age: p.age, language: p.language,
        allergies: p.allergies, lastCallIdPresent: !!p.lastCallId, createdAt: p.createdAt, updatedAt: p.updatedAt,
      })
    : 'no caller_profiles document',
);

const cs: any[] = await contacts.find({ callerId: h }).toArray();
console.log(`caller_contacts: ${cs.length}`);
const isFakeContact = (c: any) => FAKE.test(`${c.name ?? ''} ${c.relation ?? ''}`);
for (const c of cs)
  console.log(' -', JSON.stringify({ name: c.name, relation: c.relation, hasPhone: !!c.phone, hasEmail: !!c.email, fake: isFakeContact(c) }));
const fakeContactIds = cs.filter(isFakeContact).map(c => c._id);

const counts: Record<string, number> = {};
for (const c of await db.listCollections().toArray()) {
  if (c.name.startsWith('system.')) continue;
  const n = await db.collection(c.name).countDocuments({ callerId: h });
  if (n) counts[c.name] = n;
}
console.log('documents per collection for this caller:', JSON.stringify(counts));

const memDocs: any[] = await mem.find({ callerId: h }, { projection: { text: 1 } }).limit(200).toArray();
const fakeMem = memDocs.filter(d => FAKE.test(String(d.text ?? '')));
console.log(`memories: ${memDocs.length} note(s), ${fakeMem.length} mention fake test names`);
for (const d of fakeMem.slice(0, 5)) console.log('   note:', String(d.text).slice(0, 70));

console.log(`PLAN profile: $set name="${NEW_NAME}"; $unset preferredName, age, allergies`);
console.log(`PLAN contacts: delete ${fakeContactIds.length} fake contact(s) by _id`);
console.log(`PLAN memories: ${INCLUDE_MEM ? `delete ${fakeMem.length} by _id` : 'report only (add --include-memories to delete)'}`);
if (!APPLY) { console.log('Review, then re-run with --apply'); process.exit(0); }

if (p)
  await profiles.updateOne(
    { callerId: h },
    { $set: { name: NEW_NAME, updatedAt: new Date() }, $unset: { preferredName: '', age: '', allergies: '' } },
  );
if (fakeContactIds.length)
  console.log('contacts deleted:', (await contacts.deleteMany({ callerId: h, _id: { $in: fakeContactIds } })).deletedCount);
if (INCLUDE_MEM && fakeMem.length)
  console.log('memories deleted:', (await mem.deleteMany({ callerId: h, _id: { $in: fakeMem.map(d => d._id) } })).deletedCount);
console.log('done');
process.exit(0);