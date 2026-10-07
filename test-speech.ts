import 'dotenv/config';
import { writeFileSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { LANGS } from './prompts/index.js';

// usage: npx tsx test-speech.ts            -> all languages
//        npx tsx test-speech.ts ml-IN ta-IN -> only these
//        npx tsx test-speech.ts ml-IN --text "your own sentence"
const args = process.argv.slice(2);
const tIdx = args.indexOf('--text');
const customText = tIdx >= 0 ? args[tIdx + 1] : undefined;
const wanted = args.filter((a, i) => !a.startsWith('--') && i !== tIdx + 1);
const targets = (wanted.length ? wanted : Object.keys(LANGS)).filter((k) => LANGS[k]);

function play(file: string) {
  const [cmd, a]: [string, string[]] =
    process.platform === 'win32' ? ['powershell', ['-c', `(New-Object Media.SoundPlayer '${file}').PlaySync()`]]
    : process.platform === 'darwin' ? ['afplay', [file]]
    : ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', file]];
  return new Promise<void>((res) => spawn(cmd, a, { stdio: 'inherit' }).on('close', () => res()));
}

mkdirSync('out', { recursive: true });

for (const key of targets) {
  const L: any = LANGS[key];
  const text = customText ?? L.phrases.greeting;
  const t0 = Date.now();
  const r = await fetch('https://api.sarvam.ai/text-to-speech', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-subscription-key': process.env.SARVAM_API_KEY!,
    },
    body: JSON.stringify({
      text,
      target_language_code: L.code,
      speaker: L.speaker,
      model: 'bulbul:v3',
    }),
  });
  if (!r.ok) { console.error(`${L.code} FAILED ${r.status}: ${await r.text()}`); continue; }
  const data: any = await r.json();
  const file = `out/${L.code}.wav`;
  writeFileSync(file, Buffer.from(data.audios[0], 'base64'));
  console.log(`${L.code}  speaker=${L.speaker}  ${Date.now() - t0} ms  "${text}"`);
  await play(file);
}