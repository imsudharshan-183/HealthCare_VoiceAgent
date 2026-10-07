import 'dotenv/config';
import { embed, EMBED_DIM } from './embed.js';

const cos = (a: number[], b: number[]) => {
  let d = 0, x = 0, y = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; x += a[i] ** 2; y += b[i] ** 2; }
  return d / Math.sqrt(x * y);
};

const [en, ta, hi, other] = await embed([
  'My grandson is visiting this weekend',   // English
  'என் பேரன் இந்த வார இறுதியில் வருகிறான்', // Tamil, same meaning
  'मेरा पोता इस सप्ताहांत आ रहा है',          // Hindi, same meaning
  'The bus leaves at nine in the morning',  // unrelated
]);

console.log('dimensions:', en.length, '(expected', EMBED_DIM + ')');
console.log('EN vs TA   :', cos(en, ta).toFixed(2), ' (should be high)');
console.log('EN vs HI   :', cos(en, hi).toFixed(2), ' (should be high)');
console.log('EN vs other:', cos(en, other).toFixed(2), ' (should be clearly lower)');