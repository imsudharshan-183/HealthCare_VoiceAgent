// Sarvam translation (text -> text). Parameter names are from memory:
// confirm at https://docs.sarvam.ai if you get a 4xx error.
export const TRANSLATE_LANGS = [
  'en-IN', 'hi-IN', 'bn-IN', 'kn-IN', 'mr-IN', 'ta-IN', 'ml-IN',
] as const;
export type TranslateLang = (typeof TRANSLATE_LANGS)[number];
export type Tone = 'formal' | 'colloquial' | 'code-mixed';

const MODE: Record<Tone, string> = {
  formal: 'formal',
  colloquial: 'modern-colloquial',
  'code-mixed': 'code-mixed',
};

const API_URL = 'https://api.sarvam.ai/translate';
const MAX_CHARS = 900;   // stay under the per-request limit (about 1000 characters)
const TIMEOUT_MS = 5000;
const CACHE_MAX = 300;

// Optional: set SARVAM_TRANSLATE_MODEL in .env to pin a specific model.
const MODEL = process.env.SARVAM_TRANSLATE_MODEL;

const cache = new Map<string, string>();

// Split long text at sentence ends so each request stays under the limit.
function splitText(text: string): string[] {
  const sentences = text.split(/(?<=[.!?।])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (const s of sentences) {
    if (s.length > MAX_CHARS) {
      if (cur) { chunks.push(cur); cur = ''; }
      for (let i = 0; i < s.length; i += MAX_CHARS) chunks.push(s.slice(i, i + MAX_CHARS));
      continue;
    }
    if (cur && (cur + ' ' + s).length > MAX_CHARS) {
      chunks.push(cur);
      cur = s;
    } else {
      cur = cur ? `${cur} ${s}` : s;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function translateOne(
  input: string,
  target: TranslateLang,
  tone: Tone,
  source: string,
): Promise<string> {
  const body: Record<string, unknown> = {
    input,
    source_language_code: source,
    target_language_code: target,
    mode: MODE[tone],
    numerals_format: 'international', // keep 1, 2, 3
  };
  if (MODEL) body.model = MODEL;

  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-subscription-key': process.env.SARVAM_API_KEY!,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err: any) {
    if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
      throw new Error(`Sarvam translate timed out after ${TIMEOUT_MS} ms`);
    }
    throw new Error(`Sarvam translate network error: ${err?.message ?? err}`);
  }

  if (!res.ok) throw new Error(`Sarvam translate ${res.status}: ${await res.text()}`);
  const data = (await res.json()) as { translated_text?: string };
  if (!data.translated_text) throw new Error('Sarvam translate returned no text');
  return data.translated_text;
}

export async function translate(
  text: string,
  target: TranslateLang,
  opts: { tone?: Tone; source?: string } = {},
): Promise<string> {
  const input = text.trim();
  if (!input) return '';

  const tone = opts.tone ?? 'formal';
  const source = opts.source ?? 'auto';
  const key = `${target}|${tone}|${source}|${input}`;

  const hit = cache.get(key);
  if (hit) return hit;

  const parts: string[] = [];
  for (const chunk of splitText(input)) {
    parts.push(await translateOne(chunk, target, tone, source));
  }
  const result = parts.join(' ');

  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(key, result);
  return result;
}