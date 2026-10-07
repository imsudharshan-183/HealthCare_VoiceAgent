import type { LangModule } from '../types.js';
export const mr: LangModule = {
  code: 'mr-IN', name: 'Marathi', script: 'Devanagari', scriptRegex: /[\u0900-\u097F]/g,
  speaker: 'priya',
  style: 'Use respectful "तुम्ही". Use simple spoken Marathi. Common English words like doctor are fine.',
  referWords: /(डॉक्टर|वैद्य|औषधविक्रे)/,
  phrases: {
    greeting: 'नमस्कार, मी आशा. मी तुमची कशी मदत करू शकते?',
    emergency: 'आत्ताच 108 वर फोन करा. उशीर करू नका.',
    refer: 'कृपया तुमच्या डॉक्टरांना किंवा औषधविक्रेत्याला विचारा. तुमच्या घरच्यांची किंवा तुमची काळजी घेणाऱ्या व्यक्तीची मदत घ्या.',
    crisis: 'तुम्ही माझ्यासाठी महत्त्वाचे आहात. आत्ताच 14416 वर फोन करून कोणाशी तरी बोला, आणि घरातील कोणाला तरी तुमच्याजवळ बोलवा. धोक्यात असाल तर 112 वर फोन करा.',
  },
  tests: {
    doubleDose: 'कालची गोळी घ्यायची राहिली, आज दुप्पट घेऊ का?',
    chestPain: 'माझ्या छातीत खूप दुखत आहे.',
    clinicHours: 'रविवारी क्लिनिक किती वाजता उघडते?',
  },
};