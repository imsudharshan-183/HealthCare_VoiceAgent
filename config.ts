// config.ts — single source of truth for all environment variables.
// Every other module imports from here instead of reading process.env directly.
import 'dotenv/config';

// ---------- Language & Voice ----------
export const LANG_MODE = (process.env.LANG_MODE ?? 'fixed') as 'fixed' | 'auto';
export const AGENT_LANGUAGE = process.env.AGENT_LANGUAGE ?? 'en-IN';
export const ENABLE_TRANSLATE = (process.env.ENABLE_TRANSLATE ?? 'true') !== 'false';

// ---------- Agent identity ----------
export const AGENT_NAME = process.env.AGENT_NAME ?? 'hc-va';
export const ASSISTANT_NAME = process.env.ASSISTANT_NAME ?? 'Asha';
export const CLINIC_NAME = process.env.CLINIC_NAME ?? 'our clinic';

// ---------- Sarvam API ----------
export const SARVAM_API_KEY = process.env.SARVAM_API_KEY!;

// ---------- Knowledge base (RAG) ----------
export const ENABLE_KB = (process.env.ENABLE_KB ?? 'true') !== 'false';
export const KB_TOOL_TIMEOUT_MS = Number(process.env.KB_TOOL_TIMEOUT_MS ?? 4000);
export const KB_MIN_SCORE = Number(process.env.KB_MIN_SCORE ?? 0.5);

// ---------- Memory ----------
export const MEMORY_ENABLED = (process.env.MEMORY_ENABLED ?? 'false') === 'true';
export const MEMORY_LOAD_TIMEOUT_MS = Number(process.env.MEMORY_LOAD_TIMEOUT_MS ?? 2000);
export const MEMORY_MIN_USER_TURNS = Number(process.env.MEMORY_MIN_USER_TURNS ?? 2);
export const MEMORY_SAVE_EVERY_TURNS = Number(process.env.MEMORY_SAVE_EVERY_TURNS ?? 4);
export const MEMORY_MIN_SCORE = Number(process.env.MEMORY_MIN_SCORE ?? 0.35);
export const MEMORY_TTL_DAYS = Number(process.env.MEMORY_TTL_DAYS ?? 180);
export const MEMORY_DEBUG = (process.env.MEMORY_DEBUG ?? 'false') === 'true';
export const MEMORY_SALT = process.env.MEMORY_SALT ?? '';

// ---------- Records ----------
export const RECORDS_ENABLED = (process.env.RECORDS_ENABLED ?? 'true') !== 'false';
export const RECORDS_DEBUG = (process.env.RECORDS_DEBUG ?? 'false') === 'true';
export const INCIDENT_TTL_DAYS = Number(process.env.INCIDENT_TTL_DAYS ?? 365);
export const INCIDENT_RECALL_DAYS = Number(process.env.INCIDENT_RECALL_DAYS ?? 30);
export const PROFILE_ON_NAME_CHANGE = process.env.PROFILE_ON_NAME_CHANGE ?? 'archive';

// ---------- Transcripts ----------
export const SAVE_TRANSCRIPTS = (process.env.SAVE_TRANSCRIPTS ?? 'true') !== 'false';
export const RECALL_TRANSCRIPTS = (process.env.RECALL_TRANSCRIPTS ?? 'true') !== 'false';
export const TRANSCRIPT_TTL_DAYS = Number(process.env.TRANSCRIPT_TTL_DAYS ?? 90);

// ---------- Caller ----------
export const CALLER_ID_MODE = process.env.CALLER_ID_MODE ?? 'test';
export const TEST_CALLER_ID = process.env.TEST_CALLER_ID?.trim() ?? '';
export const NAME_FALLBACK = (process.env.NAME_FALLBACK ?? 'true') !== 'false';

// ---------- Call limits ----------
export const SILENCE_TIMEOUT_MS = Number(process.env.SILENCE_TIMEOUT_MS ?? 10000);
export const MAX_CALL_MS = Number(process.env.MAX_CALL_MS ?? 10 * 60 * 1000);

// ---------- Language detection ----------
export const SWITCH_MIN_LETTERS = Number(process.env.SWITCH_MIN_LETTERS ?? 4);
export const SWITCH_MIN_LETTERS_EN = Number(process.env.SWITCH_MIN_LETTERS_EN ?? 12);

// ---------- Embedding ----------
export const EMBED_PROVIDER = process.env.EMBED_PROVIDER ?? 'gemini';
export const EMBED_MODEL = process.env.EMBED_MODEL;
export const EMBED_DIM_OVERRIDE = process.env.EMBED_DIM ? Number(process.env.EMBED_DIM) : undefined;
export const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
export const COHERE_API_KEY = process.env.COHERE_API_KEY;
export const OLLAMA_URL = process.env.OLLAMA_URL ?? 'http://localhost:11434';
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// ---------- MongoDB ----------
export const MONGODB_URI = process.env.MONGODB_URI!;
export const MONGODB_DB = process.env.MONGODB_DB ?? 'hcva';
