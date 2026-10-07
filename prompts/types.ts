export type LangModule = {
  code: string;          // Sarvam language code
  name: string;          // English name
  script: string;        // script name used in the prompt
  scriptRegex: RegExp;   // used by tests
  speaker: string;       // Bulbul voice
  style: string;
  referWords: RegExp;    // "doctor" words, used by tests
  phrases: { greeting: string; emergency: string; refer: string; crisis: string };
  tests: { doubleDose: string; chestPain: string; clinicHours: string };
};