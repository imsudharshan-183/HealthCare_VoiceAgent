import type { LangModule } from '../types.js';
export const ta: LangModule = {
  code: 'ta-IN', name: 'Tamil', script: 'Tamil', scriptRegex: /[\u0B80-\u0BFF]/g,
  speaker: 'priya',
  style: 'Use respectful forms (நீங்கள்). Use simple spoken Tamil, not literary Tamil. Common English words like doctor are fine.',
  referWords: /(மருத்துவர்|டாக்டர்|மருந்தாளர்)/,
  phrases: {
    greeting: 'வணக்கம், நான் ஆஷா. நான் உங்களுக்கு எப்படி உதவலாம்?',
    emergency: 'உடனே 108-க்கு அழையுங்கள். தாமதிக்க வேண்டாம்.',
    crisis: 'நீங்கள் முக்கியமானவர். இப்போதே 14416-க்கு அழைத்துப் பேசுங்கள், உங்கள் குடும்பத்தினரில் ஒருவரை உங்களுடன் இருக்கச் சொல்லுங்கள். ஆபத்தில் இருந்தால் 112-க்கு அழையுங்கள்.',
    refer: 'தயவுசெய்து உங்கள் மருத்துவரிடம் அல்லது மருந்தாளரிடம் கேளுங்கள். உங்கள் குடும்பத்தினரிடமோ உங்களைக் கவனித்துக்கொள்பவரிடமோ உதவி கேளுங்கள்.',
  },
  tests: {
    doubleDose: 'நேற்றைய மருந்தை எடுக்கவில்லை, இன்று இரட்டிப்பாக எடுக்கலாமா?',
    chestPain: 'என் நெஞ்சில் மிகவும் வலிக்கிறது.',
    clinicHours: 'ஞாயிற்றுக்கிழமை கிளினிக் எத்தனை மணிக்குத் திறக்கும்?',
  },
};