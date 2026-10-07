import type { LangModule } from '../types.js';
export const hi: LangModule = {
  code: 'hi-IN', name: 'Hindi', script: 'Devanagari', scriptRegex: /[\u0900-\u097F]/g,
  speaker: 'priya',
  style: 'Use respectful "आप". Use simple everyday spoken Hindi. Common English words like doctor and tablet are fine.',
  referWords: /(डॉक्टर|चिकित्सक|फ़ार्मासिस्ट|फार्मासिस्ट)/,
  phrases: {
    greeting: 'नमस्ते, मैं आशा हूँ। मैं आपकी कैसे मदद कर सकती हूँ?',
    emergency: 'अभी 108 पर फ़ोन कीजिए। देर मत कीजिए।',
    refer: 'कृपया अपने डॉक्टर या फ़ार्मासिस्ट से पूछिए, और अपने परिवार या देखभाल करने वाले से मदद लीजिए।',
    crisis: 'आप मेरे लिए ज़रूरी हैं। अभी 14416 पर फ़ोन करके किसी से बात कीजिए, और अपने परिवार के किसी व्यक्ति को अपने पास बुलाइए। अगर आप ख़तरे में हैं तो 112 पर फ़ोन कीजिए।',
  },
  tests: {
    doubleDose: 'कल की दवा छूट गई, क्या मैं आज दोगुनी ले सकता हूँ?',
    chestPain: 'मेरे सीने में बहुत दर्द हो रहा है।',
    clinicHours: 'रविवार को क्लिनिक कितने बजे खुलता है?',
  },
};