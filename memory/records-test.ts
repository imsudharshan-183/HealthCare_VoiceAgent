import 'dotenv/config';
import { resolveCallerId } from './caller.js';
import { getDb } from '../rag/store.js';
import {
  upsertProfile,
  getProfile,
  saveContact,
  listContacts,
  addIncident,
  saveRecordFromTranscript,
} from './records.js';

// Dedicated isolated test caller ID (never collides with .env or live callers)
const { rawId, callerHash } = resolveCallerId('test-caller-records-isolated');

console.log('=== Records & Contacts Test (Isolated) ===');
console.log(`[callerId resolution]`);
console.log(`  rawId:      "${rawId}"`);
console.log(`  callerHash: "${callerHash.slice(0, 8)}..."\n`);

console.log('--- 1. Writing profile and 2 contacts (write path: callerHash)');
console.log(`[write profile]`);
await upsertProfile(
  callerHash,
  {
    name: 'Lakshmi',
    preferredName: 'Lakshmi amma',
    age: 72,
    language: 'ta',
    allergies: ['penicillin', 'sulfa'],
  },
  'ta-IN',
);
console.log('  Profile saved.');

console.log(`[write contact 1: Arun]`);
const c1 = await saveContact(callerHash, {
  name: 'Arun',
  relation: 'grandson',
  phone: '+91 98765 43210',
});
console.log(`  Contact 1 saved: ${c1.name} (${c1.phone})`);

console.log(`[write contact 2: Dr. Mehta]`);
const c2 = await saveContact(callerHash, {
  name: 'Dr. Mehta',
  relation: 'family doctor',
  phone: '+91 91234 56789',
  email: 'dr.mehta@clinic.org',
});
console.log(`  Contact 2 saved: ${c2.name} (${c2.phone}, ${c2.email})`);

console.log('\n--- 2. Reading back profile and contacts (read path: callerHash)');
const readProfile = await getProfile(callerHash);
console.log('[read profile]');
console.log(readProfile);

const readContacts = await listContacts(callerHash);
console.log(`[read contacts: ${readContacts.length} found]`);
console.log(readContacts);

console.log('\n--- 3. Verifying write & read callerId match');
const profileCallerIdMatch = readProfile?.callerId === callerHash;
const contactsCallerIdMatch = readContacts.every((c) => c.callerId === callerHash);
console.log(`  Profile callerId match:  ${profileCallerIdMatch ? 'PASSED (exact match)' : 'FAILED'}`);
console.log(`  Contacts callerId match: ${contactsCallerIdMatch ? 'PASSED (exact match)' : 'FAILED'}`);

console.log('\n--- 4. Direct incident write');
console.log(
  'incident added:',
  await addIncident(
    callerHash,
    { type: 'fall', severity: 'high', summary: 'Caller says she fell in the bathroom and her knee hurts a lot.' },
    'ta-IN',
    'records-test-1',
    'live_tool',
  ),
);

console.log('\n--- 5. End-of-session transcript extraction');
const transcript = [
  'Caller: Hello, my name is Lakshmi. Please call me Lakshmi amma.',
  'Assistant: Hello Lakshmi amma, how can I help you?',
  'Caller: Yesterday I fell in the bathroom and my knee is hurting a lot.',
  'Assistant: I am sorry to hear that. Please contact the clinic.',
  'Caller: I am 72 years old and allergic to penicillin.',
].join('\n');

const extractResult = await saveRecordFromTranscript(callerHash, 'en-IN', transcript, 'records-test-1');
console.log('Transcript extraction result:', extractResult);
console.log('(Incident deduping: fall was already logged by live tool, so incidentsAdded should be 0)');

// Clean up only its own isolated test data
const db = await getDb();
await db.collection('caller_profiles').deleteMany({ callerId: callerHash });
await db.collection('caller_contacts').deleteMany({ callerId: callerHash });
await db.collection('incidents').deleteMany({ callerId: callerHash });
await db.collection('caller_profiles_history').deleteMany({ callerId: callerHash });
console.log(`\n--- 6. Cleaned up isolated test data for ${rawId} (${callerHash.slice(0, 8)})`);

process.exit(0);