import { en } from './lang/en.js';
import { hi } from './lang/hi.js';
import { ta } from './lang/ta.js';
import { kn } from './lang/kn.js';
import { bn } from './lang/bn.js';
import { ml } from './lang/ml.js';
import { mr } from './lang/mr.js';
import type { LangModule } from './types.js';

export const LANGS: Record<string, LangModule> = {
  'en-IN': en, 'hi-IN': hi, 'ta-IN': ta, 'kn-IN': kn, 'bn-IN': bn, 'mr-IN': mr,'ml-IN': ml,
};
export { buildPrompt, buildMultiPrompt } from './base.js';