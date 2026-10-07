import 'dotenv/config';
import { hashCallerId, saveMemories, recall, forgetCaller, isSafeMemory } from './memory.js';

const id = hashCallerId('test-caller-memory');

const transcript = `
Caller: Hello, please call me Lakshmi amma.
Agent: Hello Lakshmi amma, how can I help?
Caller: My grandson Arun is visiting from Chennai this weekend. I like old Tamil songs.
Agent: That sounds lovely.
Caller: I take my metformin 500 mg twice a day and my sugar is high.
Agent: I cannot advise on medicines. Please ask your doctor.
`;

console.log('--- saving');
console.log('saved:', await saveMemories(id, 'ta-IN', transcript, 'test-call-1'));

console.log('--- recall (English / Tamil / Hindi queries)');
for (const q of ['family visiting', 'பேரன் வருகிறான்', 'गाने सुनना पसंद', 'what medicine does she take']) {
  const hits = await recall(id, q);
  console.log(q, '=>', hits.map((h) => `${h.score.toFixed(2)} ${h.text}`));
}

console.log('--- filter check (all must be false)');
for (const t of ['Takes metformin 500 mg daily', 'Has high sugar level', 'ती दवा घेते', 'மாத்திரை சாப்பிடுகிறார்']) {
  console.log(isSafeMemory(t), '|', t);
}

if (process.argv.includes('--clean')) console.log('deleted', await forgetCaller(id));
process.exit(0);