import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import OpenAI from 'openai';
import { LANGS, buildPrompt } from './prompts/index.js';

// usage: npx tsx test-voice.ts                          -> all languages, "doubleDose" question
//        npx tsx test-voice.ts ta-IN kn-IN              -> only these
//        npx tsx test-voice.ts --q chestPain            -> doubleDose | chestPain | clinicHours
//        npx tsx test-voice.ts ta-IN --text "your own question"
const args = process.argv.slice(2);
const opt = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const q = (opt('--q') ?? 'doubleDose') as 'doubleDose' | 'chestPain' | 'clinicHours';
const customText = opt('--text');
const skip = new Set([opt('--q'), opt('--text')]);
const wanted = args.filter((a) => !a.startsWith('--') && !skip.has(a));
const targets = (wanted.length ? wanted : Object.keys(LANGS)).filter((k) => LANGS[k]);

const client = new OpenAI({
  apiKey: process.env.SARVAM_API_KEY!,
  baseURL: 'https://api.sarvam.ai/v1',
  defaultHeaders: { 'api-subscription-key': process.env.SARVAM_API_KEY! },
  fetch: async (input: any, init?: any) => {
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      body.reasoning_effort = null;
      init = { ...init, body: JSON.stringify(body) };
    }
    return fetch(input, init);
  },
});

function play(file: string) {
  file = resolve(file);
  const [cmd, a]: [string, string[]] =
    process.platform === 'win32' ? ['powershell', ['-c', `(New-Object Media.SoundPlayer '${file}').PlaySync()`]]
    : process.platform === 'darwin' ? ['afplay', [file]]
    : ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]];
  return new Promise<void>((res) => spawn(cmd, a, { stdio: 'inherit' }).on('close', () => res()));
}

mkdirSync('out', { recursive: true });

for (const key of targets) {
  const L = LANGS[key];
  const question = customText ?? L.tests[q];
  console.log(`\n=== ${L.name} (${L.code})`);
  console.log(`Caller: ${question}`);

  const t0 = Date.now();
  const chat = await client.chat.completions.create({
    model: 'sarvam-105b',
    temperature: 0.9,
    messages: [
      { role: 'system', content: buildPrompt(L) },
      { role: 'user', content: question },
    ],
  } as any);
  const reply = chat.choices[0]?.message?.content?.trim() ?? '';
  const tLlm = Date.now() - t0;
  console.log(`Agent: ${reply}`);
  if (!reply) { console.error('empty reply'); continue; }

  const t1 = Date.now();
  const r = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': process.env.SARVAM_API_KEY!,
    },
    body: JSON.stringify({
      text: reply,
      target_language_code: L.code,
      speaker: L.speaker,
      model: 'bulbul:v3',
    }),
  });
  if (!r.ok) { console.error(`TTS FAILED ${r.status}: ${await r.text()}`); continue; }
  const data: any = await r.json();
  const file = `out/${L.code}-${q}.wav`;
  writeFileSync(file, Buffer.from(data.audios[0], 'base64'));
  console.log(`LLM ${tLlm} ms | TTS ${Date.now() - t1} ms | saved ${file}`);
  if (!args.includes('--nosound')) await play(file);
}