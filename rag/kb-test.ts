import 'dotenv/config';
import { retrieve } from './kb.js';

for (const q of ['what are the clinic timings', 'கிளினிக் எத்தனை மணிக்கு திறக்கும்', 'क्लिनिक कब खुलता है']) {
  const hits = await retrieve(q);
  console.log(q, '=>', hits.map((h) => `${h.score.toFixed(2)} ${h.source}`));
}
process.exit(0);