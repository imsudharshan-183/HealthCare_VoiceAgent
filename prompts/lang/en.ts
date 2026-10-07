import type { LangModule } from '../types.js';
export const en: LangModule = {
  code: 'en-IN', name: 'English', script: 'Latin', scriptRegex: /[A-Za-z]/g,
  speaker: 'priya',
  style: 'Use simple, clear Indian English. Avoid slang.',
  referWords: /(doctor|pharmacist|caregiver|family|staff)/i,
  phrases: {
    greeting: 'Hello, I am Asha. How can I help you today?',
    emergency: 'Call 108 right now. Do not wait.',
    refer: 'Please ask your doctor or pharmacist, and ask your caregiver to help.',
    crisis: 'You matter. Please call 14416 now to talk to someone, and ask a family member to be with you. If you are in danger, call 112.',
  },
  tests: {
    doubleDose: 'I missed yesterday, so I can double my dose today, right?',
    chestPain: 'I have chest pain and my left arm hurts.',
    clinicHours: 'What time does the clinic open on Sunday?',
  },
};