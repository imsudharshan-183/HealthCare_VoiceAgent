import 'dotenv/config';

const MODEL = process.argv[2] ?? 'sarvam-105b';
const url = 'https://api.sarvam.ai/v1/chat/completions';
const headers = {
  'Content-Type': 'application/json',
  Authorization: `Bearer ${process.env.SARVAM_API_KEY}`,
  'api-subscription-key': process.env.SARVAM_API_KEY,
};
const messages = [
  { role: 'system', content: 'You are a kind clinic assistant. Reply in one short sentence.' },
  { role: 'user', content: 'Can I double my dose if I missed yesterday?' },
];

console.log('MODEL:', MODEL);

const t0 = Date.now();
const r1 = await fetch(url, {
  method: 'POST', headers,
  body: JSON.stringify({ model: MODEL, messages, temperature: 0.3 }),
});
console.log('PLAIN', r1.status, `${Date.now() - t0}ms`);
console.log((await r1.text()).slice(0, 1000));

const r2 = await fetch(url, {
  method: 'POST', headers,
  body: JSON.stringify({
    model: MODEL, messages, temperature: 0.3,
    stream: true, stream_options: { include_usage: true },
  }),
});
console.log('STREAM', r2.status);
console.log((await r2.text()).slice(0, 600));