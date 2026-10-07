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
const variants = [
  { name: 'default (medium)', extra: {} },
  { name: 'low', extra: { reasoning_effort: 'low' } },
  { name: 'off (null)', extra: { reasoning_effort: null } },
];

for (const v of variants) {
  const t0 = Date.now();
  const res = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify({ model: MODEL, messages, temperature: 0.2, stream: true, ...v.extra }),
  });
  if (!res.ok) { console.log(v.name, res.status, await res.text()); continue; }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '', first = null, text = '', reasoning = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data: ') || line.includes('[DONE]')) continue;
      try {
        const d = JSON.parse(line.slice(6)).choices?.[0]?.delta;
        if (d?.reasoning_content) reasoning++;
        if (d?.content) { if (first === null) first = Date.now() - t0; text += d.content; }
      } catch {}
    }
  }
  console.log(`${v.name}: first spoken text at ${first}ms, total ${Date.now() - t0}ms, reasoning chunks ${reasoning}`);
  console.log('   ->', text.trim());
}