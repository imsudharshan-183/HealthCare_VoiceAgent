export const SCRIPTS: [string, RegExp][] = [
  ['ta-IN', /[\u0B80-\u0BFF]/g], // Tamil
  ['kn-IN', /[\u0C80-\u0CFF]/g], // Kannada
  ['bn-IN', /[\u0980-\u09FF]/g], // Bengali
  ['ml-IN', /[\u0D00-\u0D7F]/g], // Malayalam
  ['hi-IN', /[\u0900-\u097F]/g], // Devanagari: Hindi and Marathi share it
];
const LATIN = /[A-Za-z]/g;

export function detectLanguage(text: string, current: string, sttLang?: string): string | null {
  const minNative = Number(process.env.SWITCH_MIN_LETTERS ?? 4);
  const minLatin = Number(process.env.SWITCH_MIN_LETTERS_EN ?? 12);
  const hint = (sttLang ?? '').toLowerCase().slice(0, 2); // 'mr', 'hi', ...

  let best: string | null = null;
  let bestN = 0;
  for (const [code, re] of SCRIPTS) {
    const n = (text.match(re) ?? []).length;
    if (n > bestN) { best = code; bestN = n; }
  }

  if (best && bestN >= minNative) {
    if (best === 'hi-IN') {
      if (hint === 'mr') return 'mr-IN';
      if (hint === 'hi') return 'hi-IN';
      if (current === 'mr-IN') return null; // no hint: keep Marathi
    }
    return best;
  }
  if ((text.match(LATIN) ?? []).length >= minLatin) return 'en-IN';
  return null;
}