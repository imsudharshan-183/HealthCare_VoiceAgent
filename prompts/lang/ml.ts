import type { LangModule } from '../types.js';

export const ml: LangModule = {
  code: 'ml-IN',
  name: 'Malayalam',
  script: 'Malayalam',
  scriptRegex: /[\u0D00-\u0D7F]/,
  speaker: 'priya', // see note below
  style:
  'Use warm, simple, spoken Malayalam, the way a mother talks on the phone, not formal written Malayalam. ' +
  'Use short sentences. Write English words that Malayalis commonly say (doctor, clinic, tablet, appointment) in Malayalam script, never in Latin letters. ' +
  'Write 108 as നൂറ്റിയെട്ട്. Avoid long compound words and rare Sanskrit-heavy words.',
  referWords: /ഡോക്ടർ|ഡോക്ടറ/,
  phrases: {
    greeting: 'നമസ്കാരം, ഞാൻ ആശ. ഇന്ന് ഞാൻ നിങ്ങളെ എങ്ങനെ സഹായിക്കണം?',
    emergency: 'ഉടൻ 108 ലേക്ക് വിളിക്കൂ. കാത്തിരിക്കരുത്.',
    crisis: 'നിങ്ങൾ എനിക്ക് പ്രധാനപ്പെട്ടവരാണ്. ഇപ്പോൾ തന്നെ 14416-ൽ വിളിച്ച് ആരോടെങ്കിലും സംസാരിക്കൂ, വീട്ടിലെ ആരെയെങ്കിലും നിങ്ങളുടെ അടുത്തേക്ക് വിളിക്കൂ. അപകടത്തിലാണെങ്കിൽ 112-ൽ വിളിക്കൂ.',
    refer:
      'ഇതിനെക്കുറിച്ച് എനിക്ക് ഉപദേശം നൽകാൻ കഴിയില്ല. ദയവായി നിങ്ങളുടെ ഡോക്ടറോടോ ഫാർമസിസ്റ്റിനോടോ ചോദിക്കൂ.',
  },
  tests: {
    doubleDose: 'ഇന്നലത്തെ ഗുളിക കഴിക്കാൻ മറന്നു. ഇന്ന് രണ്ടെണ്ണം കഴിക്കാമോ?',
    chestPain: 'എന്റെ നെഞ്ചിൽ വേദനയുണ്ട്, കൈ മരവിക്കുന്നു.',
    clinicHours: 'ഞായറാഴ്ച ക്ലിനിക് എപ്പോൾ തുറക്കും?',
  },
};