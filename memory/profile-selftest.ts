import 'dotenv/config';
import { resolveCallerId } from './caller.js';
import { getDb } from '../rag/store.js';
import { upsertProfile } from './records.js';

const { callerHash: h } = resolveCallerId('script-profile-selftest');
let live = '';
try { live = resolveCallerId().callerHash; } catch { /* no live ID set */ }
if (h === live) { console.log('abort: collides with the live caller'); process.exit(1); }

const db = await getDb();
const prof = db.collection('caller_profiles');
const wipe = async () => {
  await prof.deleteMany({ callerId: h });
  await db.collection('caller_profiles_history').deleteMany({ callerId: h });
};
const get = async () => (await prof.findOne({ callerId: h })) as any;
const checks: [string, boolean][] = [];

try {
  await wipe();
  await upsertProfile(h, { name: 'Lakshmi', preferredName: 'Amma', age: 72, allergies: ['Penicillin'] } as any, 'en-IN', 'call-1');
  await upsertProfile(h, { name: 'Tom' } as any, 'en-IN', 'call-1');
  let p = await get();
  checks.push(['same-call name correction overwrites', p.name === 'Tom']);
  await upsertProfile(h, { preferredName: 'Thomas', age: 73 } as any, 'en-IN', 'call-1');
  p = await get();
  checks.push(['preferredName and age overwrite', p.preferredName === 'Thomas' && p.age === 73]);
  await upsertProfile(h, { name: null, preferredName: '  ', age: undefined } as any, 'en-IN', 'call-1');
  p = await get();
  checks.push(['null, blank and missing never overwrite', p.name === 'Tom' && p.preferredName === 'Thomas' && p.age === 73]);
  await upsertProfile(h, { allergies: ['penicillin', 'Sulfa'] } as any, 'en-IN', 'call-1');
  p = await get();
  checks.push(['allergies merge, dedupe case-insensitively', p.allergies.length === 2]);
  await upsertProfile(h, { removeAllergies: ['SULFA'] } as any, 'en-IN', 'call-1');
  p = await get();
  checks.push(['allergy removed on request', p.allergies.length === 1 && p.allergies[0].toLowerCase() === 'penicillin']);
  await upsertProfile(h, { allergies: Array.from({ length: 12 }, (_, i) => `a${i}`) } as any, 'en-IN', 'call-1');
  p = await get();
  checks.push(['allergies capped at 10 (newest kept)', p.allergies.length === 10 && p.allergies.includes('a11')]);
  await upsertProfile(h, { name: 'Ravi' } as any, 'en-IN', 'call-2');
  p = await get();
  checks.push(['new call + new name starts fresh', p.name === 'Ravi' && !p.preferredName && !p.allergies?.length]);
  const hist = await db.collection('caller_profiles_history').countDocuments({ callerId: h });
  checks.push(['old profile archived', hist >= 1]);
} finally {
  await wipe();
}
for (const [n, ok] of checks) console.log(ok ? 'PASS' : 'FAIL', n);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
