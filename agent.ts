import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { defineAgent, cli, ServerOptions, voice, llm, type JobContext, type JobProcess } from '@livekit/agents';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import OpenAI from 'openai';
import { z } from 'zod';
import { LANGS, buildPrompt, buildMultiPrompt } from './prompts/index.js';
import { detectLanguage } from './lang.js';
import { translate, TRANSLATE_LANGS } from './translate.js';
import { retrieve } from './rag/kb.js';
import { hashCallerId, recentMemories, formatMemoryBlock, saveMemories, warmMemory } from './memory/memory.js';
import { buildRecordTools } from './tools/record.js';
import { saveRecordFromTranscript } from './memory/records.js';

// auto = start in AGENT_LANGUAGE, then follow the caller's language
const AUTO = (process.env.LANG_MODE ?? 'fixed') === 'auto';
const L = LANGS[process.env.AGENT_LANGUAGE ?? 'en-IN'] ?? LANGS['en-IN'];
const ENABLE_TRANSLATE = (process.env.ENABLE_TRANSLATE ?? 'true') !== 'false';

// Knowledge-base (RAG) settings
const ENABLE_KB = (process.env.ENABLE_KB ?? 'true') !== 'false';
const KB_TOOL_TIMEOUT_MS = Number(process.env.KB_TOOL_TIMEOUT_MS ?? 4000);

// Memory settings
const MEMORY_ENABLED = (process.env.MEMORY_ENABLED ?? 'false') === 'true';
const MEMORY_LOAD_TIMEOUT_MS = Number(process.env.MEMORY_LOAD_TIMEOUT_MS ?? 2000);
const MEMORY_MIN_USER_TURNS = Number(process.env.MEMORY_MIN_USER_TURNS ?? 2);
const SAVE_EVERY_TURNS = Number(process.env.MEMORY_SAVE_EVERY_TURNS ?? 4); // snapshot during the call

// Fixed record (name, emergencies, injuries, ...). RECORDS_ENABLED=false turns it off.
const RECORDS_ENABLED = (process.env.RECORDS_ENABLED ?? 'true') !== 'false';

// Who is the caller?
//   test        = TEST_CALLER_ID from .env (change it to switch persona)
//   participant = LiveKit participant "userId" attribute, else identity
const CALLER_ID_MODE = process.env.CALLER_ID_MODE ?? 'test';

// Dispatch name. Must match AGENT_NAME in hc-web/.env.local (blank = automatic dispatch).
const AGENT_NAME = process.env.AGENT_NAME ?? 'hc-va';

// Hang-up settings
const SILENCE_MS = Number(process.env.SILENCE_TIMEOUT_MS ?? 10000);
const MAX_CALL_MS = Number(process.env.MAX_CALL_MS ?? 10 * 60 * 1000);

// Goodbye lines: have a native speaker check these.
const BYE_LINE: Record<string, string> = {
  'en-IN': 'Take care. Goodbye!',
  'hi-IN': 'अपना ध्यान रखिए। नमस्ते!',
  'ta-IN': 'உடல்நலத்தைப் பார்த்துக்கொள்ளுங்கள். வணக்கம்!',
  'kn-IN': 'ಜಾಗರೂಕರಾಗಿರಿ. ನಮಸ್ಕಾರ!',
  'bn-IN': 'ভালো থাকবেন। নমস্কার!',
  'mr-IN': 'काळजी घ्या. नमस्कार!',
  'ml-IN': 'ശ്രദ്ധിക്കണേ. നമസ്കാരം!',
};

const BYE_WORDS =
  /\b(bye|goodbye|good bye|that'?s all|see you)\b|अलविदा|बाय|फिर मिलेंगे|रखता हूँ|रखती हूँ|பை|வைக்கிறேன்|போய் வருகிறேன்|ಬಾಯ್|ಇಡುತ್ತೇನೆ|ಹೋಗಿ ಬರುತ್ತೇನೆ|বাই|রাখছি|বিদায়|येतो|येते|ठेवतो|ठेवते|ബൈ|വയ്ക്കട്ടെ|പോട്ടെ/i;

// Only short utterances count, so "bye" inside a long sentence doesn't hang up.
const isBye = (t: string) => t.trim().split(/\s+/).length <= 8 && BYE_WORDS.test(t);

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

const sarvamClient = new OpenAI({
  apiKey: process.env.SARVAM_API_KEY!,
  baseURL: 'https://api.sarvam.ai/v1',
  defaultHeaders: { 'api-subscription-key': process.env.SARVAM_API_KEY! },
  fetch: async (input: any, init?: any) => {
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      body.reasoning_effort = null; // thinking off
      init = { ...init, body: JSON.stringify(body) };
    }
    return fetch(input, init);
  },
});

// Translate tool: only for simple non-medical text the caller asks for.
const translateTool = llm.tool({
  description:
    'Translate a short, non-medical sentence (greetings, directions, appointment wording) into another language. ' +
    'Use ONLY when the caller explicitly asks. NEVER use it for medicines, doses, symptoms or health advice. ' +
    "For normal conversation, answer directly in the caller's language.",
  parameters: z.object({
    text: z.string().describe('The exact text to translate'),
    targetLanguage: z
      .enum(TRANSLATE_LANGS)
      .describe('en-IN, hi-IN, bn-IN, kn-IN, mr-IN, ta-IN or ml-IN'),
    tone: z.enum(['formal', 'colloquial', 'code-mixed']).optional(),
  }),
  execute: async ({ text, targetLanguage, tone }) => {
    try {
      return { translated: await translate(text, targetLanguage, { tone: tone ?? 'formal' }) };
    } catch (err) {
      console.error('[translate] failed:', err);
      return { error: 'Translation unavailable right now. Apologise briefly and continue.' };
    }
  },
});

// Time tool: the model cannot read a clock, so give it one.
const timeTool = llm.tool({
  description:
    'Get the current date, day and time in India. Use whenever the caller asks the time, date or day.',
  parameters: z.object({}),
  execute: async () => {
    const now = new Date();
    const fmt = (o: Intl.DateTimeFormatOptions) =>
      new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', ...o }).format(now);
    return {
      date: fmt({ day: 'numeric', month: 'long', year: 'numeric' }),
      day: fmt({ weekday: 'long' }),
      time: fmt({ hour: 'numeric', minute: '2-digit', hour12: true }),
    };
  },
});

// Knowledge-base tool: result comes back as part of the conversation, so it always reaches the LLM.
const clinicInfoTool = llm.tool({
  description:
    'Look up clinic facts (timings, location, booking, doctors, fees, contact, anything else about the clinic) ' +
    'from the clinic knowledge base. Use for ANY question about the clinic. Do NOT use for general questions.',
  parameters: z.object({
    question: z.string().describe("The caller's clinic question, in English if possible"),
  }),
  execute: async ({ question }) => {
    try {
      const t0 = Date.now();
      const hits: any[] = await withTimeout(retrieve(question), KB_TOOL_TIMEOUT_MS);
      console.log(`[kb] "${question}" -> ${hits.length} hit(s) in ${Date.now() - t0}ms`);
      if (!hits.length) {
        return {
          found: false,
          note: 'No clinic information found. Say you do not have that detail and the clinic staff can confirm it.',
        };
      }
      return { found: true, info: hits.map((h: any) => h.text) };
    } catch (e) {
      console.warn('[kb] lookup failed:', e instanceof Error ? e.message : e);
      return {
        found: false,
        note: 'Lookup unavailable. Say you could not check and the clinic staff can confirm it.',
      };
    }
  },
});

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
    if (MEMORY_ENABLED) {
      // Open the DB connection and the embedding client before the first caller arrives.
      try {
        await warmMemory();
      } catch (e) {
        console.warn('[memory] warm-up failed (memory will retry on use):', e instanceof Error ? e.message : e);
      }
    }
  },

  entry: async (ctx: JobContext) => {
    const tts = new sarvam.TTS({
      model: 'bulbul:v3',
      speaker: L.speaker,
      targetLanguageCode: L.code,
    });

    const session = new voice.AgentSession({
      vad: ctx.proc.userData.vad as silero.VAD,
      stt: new sarvam.STT({
        model: 'saaras:v3',
        languageCode: AUTO ? 'unknown' : L.code, // 'unknown' = auto-detect
      }),
      llm: new openai.LLM({
        model: 'sarvam-105b',
        temperature: 0.2,
        client: sarvamClient as any,
      }),
      tts,
      turnHandling: {
        endpointing: { minDelay: 800, maxDelay: 4000 },
        interruption: { mode: 'adaptive', minDuration: 500 },
      },
    });

    let current = L.code;
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;
    let ending = false;
    let connected = false;

    // ---------- memory: who is this caller, and what did they say ----------
    let rawCallerId = process.env.TEST_CALLER_ID ?? '';
    if (CALLER_ID_MODE === 'participant') {
      await ctx.connect();
      connected = true;
      const p: any = await (ctx as any).waitForParticipant();
      rawCallerId = p?.attributes?.userId || p?.identity || '';
    }
    const callerHash = MEMORY_ENABLED && rawCallerId ? hashCallerId(rawCallerId) : '';
    if (MEMORY_ENABLED && !rawCallerId) {
      console.warn('[memory] MEMORY_ENABLED is true but no caller ID is available, so memory is OFF for this run');
    }
    // Unique per session, so a new session never counts as the previous call.
    const callId = `${ctx.room.name ?? 'unknown'}-${Date.now()}`;
    const transcriptLines: string[] = [];
    let userTurns = 0;

    // Background snapshot every few caller turns, so a crash loses at most a few turns.
    let saving = false;
    const saveSnapshot = async () => {
      if (!callerHash || saving) return;
      saving = true;
      try {
        const t = transcriptLines.join('\n');
        await Promise.allSettled([
          saveMemories(callerHash, current, t, callId),
          RECORDS_ENABLED ? saveRecordFromTranscript(callerHash, current, t, callId) : Promise.resolve(),
        ]);
      } finally {
        saving = false;
      }
    };

    const clearTimer = () => {
      if (silenceTimer) clearTimeout(silenceTimer);
      silenceTimer = undefined;
    };

    // Say a short goodbye (TTS only, no LLM tokens), then close the session.
    const endCall = async (reason: string) => {
      if (ending) return;
      ending = true;
      clearTimer();
      if (maxTimer) clearTimeout(maxTimer);
      console.log(`[call] ending: ${reason}`);
      try {
        (session as any).interrupt?.();
        const h = (session as any).say(BYE_LINE[current] ?? BYE_LINE['en-IN'], {
          allowInterruptions: false,
        });
        await h?.waitForPlayout?.();
      } catch (e) {
        console.warn('[call] goodbye failed, closing anyway:', e);
      }
      ctx.shutdown(reason);
    };

    const armTimer = () => {
      clearTimer();
      if (ending) return;
      silenceTimer = setTimeout(() => void endCall('silence'), SILENCE_MS);
    };

    // Silence timer runs only while the agent is idle and the caller is quiet.
    (session as any).on('agent_state_changed', (ev: any) => {
      const s = ev?.newState ?? ev?.state;
      if (s === 'speaking' || s === 'thinking') clearTimer();
      else if (s === 'listening') armTimer();
    });
    (session as any).on('user_state_changed', (ev: any) => {
      const s = ev?.newState ?? ev?.state;
      if (s === 'speaking') clearTimer();
      else if (s === 'listening') armTimer();
    });

    // Voice only: log, detect "bye", and (auto mode) switch voice language.
    (session as any).on('user_input_transcribed', (ev: any) => {
      if (!ev?.isFinal || !ev.transcript) return;
      console.log(`[stt] "${ev.transcript}"`);

      if (isBye(ev.transcript)) {
        void endCall('caller said bye');
        return;
      }
      if (!AUTO) return;

      const next = detectLanguage(ev.transcript, current);
      if (!next || next === current) return;
      const n = LANGS[next];
      if (!n) {
        console.warn(`[lang] ${next} detected but not in LANGS, staying on ${current}`);
        return;
      }
      const t: any = tts;
      if (typeof t.updateOptions !== 'function') {
        console.warn('[lang] tts.updateOptions is not available in this plugin version');
        return;
      }
      t.updateOptions({ targetLanguageCode: n.code, speaker: n.speaker });
      console.log(`[lang] ${current} -> ${next}`);
      current = next;
    });

    // Voice AND typed turns: collect the transcript, catch typed "bye", trigger snapshots.
    (session as any).on('conversation_item_added', (ev: any) => {
      const item = ev?.item;
      const role: string | undefined = item?.role;
      const text: string = (item?.textContent ?? '').trim();
      if (!text || (role !== 'user' && role !== 'assistant')) return;

      if (role === 'user') {
        userTurns++;
        if (isBye(text)) void endCall('caller said bye');
        if (callerHash && userTurns >= MEMORY_MIN_USER_TURNS && userTurns % SAVE_EVERY_TURNS === 0) {
          void saveSnapshot();
        }
      }
      if (callerHash) {
        transcriptLines.push(`${role === 'user' ? 'Caller' : 'Assistant'}: ${text}`);
      }
    });

    // Safety net: never let a call run forever.
    maxTimer = setTimeout(() => void endCall('max duration'), MAX_CALL_MS);

    (ctx as any).addShutdownCallback?.(async () => {
      clearTimer();
      if (maxTimer) clearTimeout(maxTimer);

      // Final save: only for real conversations, and never allowed to crash shutdown.
      if (callerHash && userTurns >= MEMORY_MIN_USER_TURNS) {
        const transcript = transcriptLines.join('\n');
        const jobs: Promise<unknown>[] = [saveMemories(callerHash, current, transcript, callId)];
        if (RECORDS_ENABLED) jobs.push(saveRecordFromTranscript(callerHash, current, transcript, callId));

        const results = await Promise.allSettled(jobs);
        const labels = ['notes', 'record'];
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') console.log(`[memory] ${labels[i]} saved:`, JSON.stringify(r.value));
          else console.warn(`[memory] ${labels[i]} save failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
        });
      } else if (callerHash) {
        console.log(`[memory] not saved (only ${userTurns} caller turn(s), need ${MEMORY_MIN_USER_TURNS})`);
      }
    });

    // ---------- build the instructions ----------
    const baseInstructions = AUTO ? buildMultiPrompt(Object.values(LANGS)) : buildPrompt(L);
    let instructions = ENABLE_TRANSLATE
      ? `${baseInstructions}\n\nIf the caller explicitly asks you to translate a simple non-medical sentence, use the translateText tool and read the result aloud. For anything about medicines or health, follow the safety rules above and refer to a human.`
      : baseInstructions;

    if (ENABLE_KB) {
      instructions +=
        '\n\nFor any question about the clinic (timings, location, booking, doctors, fees, contact), ' +
        'first call the lookupClinicInfo tool and answer only from its result. ' +
        'If it finds nothing, say you do not have that detail and the clinic staff can confirm it. ' +
        'For all other questions, do not call it; answer normally.';
    }

    // Tells the LLM when to use the record tools. It never promises that staff will see anything.
    if (callerHash && RECORDS_ENABLED) {
      instructions +=
        '\n\nRECORD KEEPING: When the caller tells you their name, age, carer or allergies, call saveCallerDetails. ' +
        'If they mention an emergency, injury, fall, severe pain or feeling unsafe, call reportIncident immediately, ' +
        'then calmly tell them to call 112 if in immediate danger, or to contact the clinic directly. ' +
        'Never diagnose or give medical advice. Do not announce that you are saving notes.';
    }

    // Load notes about this caller once, at the start. If slow or failing, carry on without it.
    if (callerHash) {
      try {
        const mems = await withTimeout(recentMemories(callerHash, 4), MEMORY_LOAD_TIMEOUT_MS);
        console.log(`[memory] loaded ${mems.length} note(s)`);
        instructions += formatMemoryBlock(mems);
      } catch (e) {
        console.warn('[memory] load skipped:', e instanceof Error ? e.message : e);
      }
    }

    const agent = voice.Agent.create({
      instructions,
      tools: {
        getCurrentDateTime: timeTool,
        ...(ENABLE_KB ? { lookupClinicInfo: clinicInfoTool } : {}),
        ...(ENABLE_TRANSLATE ? { translateText: translateTool } : {}),
        ...(callerHash && RECORDS_ENABLED ? buildRecordTools(callerHash, callId, () => current) : {}),
      },
    });

    await session.start({ agent, room: ctx.room });

    if (!connected) await ctx.connect();

    session.generateReply({
      instructions: `Say exactly this sentence and nothing else: ${L.phrases.greeting}`,
    });
  },
});

// ONE runApp. AGENT_NAME defaults to 'hc-va'. Set AGENT_NAME= (blank) in .env for automatic dispatch.
cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    ...(AGENT_NAME ? { agentName: AGENT_NAME } : {}),
  }),
);