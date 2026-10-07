import type { LangModule } from '../types.js';
export const kn: LangModule = {
  code: 'kn-IN', name: 'Kannada', script: 'Kannada', scriptRegex: /[\u0C80-\u0CFF]/g,
  speaker: 'priya',
  style: 'Use respectful "ನೀವು". Use simple spoken Kannada. Common English words like doctor are fine.',
  referWords: /(ವೈದ್ಯ|ಡಾಕ್ಟರ್|ಔಷಧಿಕಾರ)/,
  phrases: {
    greeting: 'ನಮಸ್ಕಾರ, ನಾನು ಆಶಾ. ನಿಮಗೆ ಹೇಗೆ ಸಹಾಯ ಮಾಡಲಿ?',
    emergency: 'ಈಗಲೇ 108 ಗೆ ಕರೆ ಮಾಡಿ. ತಡ ಮಾಡಬೇಡಿ.',
    crisis: 'ನೀವು ನನಗೆ ಮುಖ್ಯ. ಈಗಲೇ 14416 ಗೆ ಕರೆ ಮಾಡಿ ಮಾತನಾಡಿ, ಮತ್ತು ನಿಮ್ಮ ಮನೆಯವರಲ್ಲಿ ಒಬ್ಬರನ್ನು ನಿಮ್ಮ ಬಳಿ ಬರಲು ಹೇಳಿ. ನೀವು ಅಪಾಯದಲ್ಲಿದ್ದರೆ 112 ಗೆ ಕರೆ ಮಾಡಿ.',
    refer: 'ದಯವಿಟ್ಟು ನಿಮ್ಮ ವೈದ್ಯರನ್ನು ಅಥವಾ ಔಷಧಿಕಾರರನ್ನು ಕೇಳಿ. ನಿಮ್ಮ ಮನೆಯವರ ಅಥವಾ ನಿಮ್ಮನ್ನು ನೋಡಿಕೊಳ್ಳುವವರ ಸಹಾಯ ಪಡೆಯಿರಿ.',
  },
  tests: {
    doubleDose: 'ನಿನ್ನೆಯ ಔಷಧಿ ತೆಗೆದುಕೊಳ್ಳಲಿಲ್ಲ, ಇಂದು ಎರಡು ಪಟ್ಟು ತೆಗೆದುಕೊಳ್ಳಬಹುದೇ?',
    chestPain: 'ನನ್ನ ಎದೆಯಲ್ಲಿ ತುಂಬಾ ನೋವಾಗುತ್ತಿದೆ.',
    clinicHours: 'ಭಾನುವಾರ ಕ್ಲಿನಿಕ್ ಎಷ್ಟು ಗಂಟೆಗೆ ತೆರೆಯುತ್ತದೆ?',
  },
};