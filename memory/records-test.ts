import 'dotenv/config';
import { hashCallerId } from './memory.js';
import { addIncident, upsertProfile, saveRecordFromTranscript } from './records.js';

const id = hashCallerId(process.env.TEST_CALLER_ID ?? 'test-caller-1');

console.log('--- direct writes (what the live tools do)');
await upsertProfile(id, { name: 'Lakshmi', preferredName: 'Lakshmi amma' }, 'ta-IN');
console.log('incident added:', await addIncident(
  id,
  { type: 'fall', severity: 'high', summary: 'Caller says she fell in the bathroom and her knee hurts a lot.' },
  'ta-IN',
  'records-test-1',
  'live_tool',
));

console.log('--- end-of-session extraction from a transcript');
const transcript = [
  'Caller: Hello, my name is Lakshmi. Please call me Lakshmi amma.',
  'Assistant: Hello Lakshmi amma, how can I help you?',
  'Caller: Yesterday I fell in the bathroom and my knee is hurting a lot.',
  'Assistant: I am sorry to hear that. Please contact the clinic.',
  'Caller: I am allergic to penicillin. My daughter Priya looks after me.',
].join('\n');
console.log(await saveRecordFromTranscript(id, 'en-IN', transcript, 'records-test-1'));
console.log('(the fall was already saved above, so incidentsAdded should be 0 for it)');
process.exit(0);