import type { LangModule } from '../types.js';
export const bn: LangModule = {
  code: 'bn-IN', name: 'Bengali', script: 'Bengali', scriptRegex: /[\u0980-\u09FF]/g,
  speaker: 'priya',
  style: 'Use respectful "আপনি". Use simple spoken Bengali (cholito bhasha), not formal literary Bengali.',
  referWords: /(ডাক্তার|চিকিৎসক|ফার্মাসিস্ট)/,
  phrases: {
    greeting: 'নমস্কার, আমি আশা। আমি আপনাকে কীভাবে সাহায্য করতে পারি?',
    emergency: 'এখনই 108-এ ফোন করুন। দেরি করবেন না।',
  crisis: 'আপনি আমার কাছে গুরুত্বপূর্ণ। এখনই 14416-এ ফোন করে কারও সঙ্গে কথা বলুন, আর পরিবারের কাউকে আপনার কাছে আসতে বলুন। বিপদে থাকলে 112-এ ফোন করুন।',
    refer: 'দয়া করে আপনার ডাক্তার বা ফার্মাসিস্টকে জিজ্ঞাসা করুন। আপনার পরিবারের কাউকে বা যিনি আপনার দেখাশোনা করেন, তাঁকে সাহায্য করতে বলুন।',
  },
  tests: {
    doubleDose: 'কালকের ওষুধ খাওয়া হয়নি, আজ কি দ্বিগুণ খেতে পারি?',
    chestPain: 'আমার বুকে খুব ব্যথা করছে।',
    clinicHours: 'রবিবার ক্লিনিক কখন খোলে?',
  },
};