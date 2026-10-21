import { fileURLToPath } from 'node:url';
import { defineAgent, cli, ServerOptions, voice, llm, type JobContext, type JobProcess } from '@livekit/agents';
import * as sarvam from '@livekit/agents-plugin-sarvam';
import * as openai from '@livekit/agents-plugin-openai';
import * as silero from '@livekit/agents-plugin-silero';
import { z } from 'zod';
import {
  LANG_MODE,
  AGENT_LANGUAGE,
  ENABLE_TRANSLATE,
  AGENT_NAME,
  ENABLE_KB,
  KB_TOOL_TIMEOUT_MS,
  MEMORY_ENABLED,
  MEMORY_LOAD_TIMEOUT_MS,
  MEMORY_MIN_USER_TURNS,
  MEMORY_SAVE_EVERY_TURNS,
  RECORDS_ENABLED,
  RECALL_TRANSCRIPTS,
  CALLER_ID_MODE,
  TEST_CALLER_ID,
  NAME_FALLBACK,
  SILENCE_TIMEOUT_MS,
  MAX_CALL_MS,
  ENDPOINTING_MIN_DELAY,
  ENDPOINTING_MAX_DELAY,
} from './config.js';
import { sarvamClient } from './sarvam-client.js';
import { LANGS, buildPrompt, buildMultiPrompt } from './prompts/index.js';
import { detectLanguage } from './lang.js';
import { translate, TRANSLATE_LANGS } from './translate.js';
import { retrieve } from './rag/kb.js';
import { recentMemories, formatMemoryBlock, saveMemories, warmMemory } from './memory/memory.js';
import { resolveCallerId } from './memory/caller.js';
import { buildRecordTools } from './tools/record.js';
import { buildRecallTool } from './tools/recall.js';
import { SessionTranscript, getRecentExchanges, formatTranscriptBlock } from './memory/transcripts.js';
import {
  saveRecordFromTranscript,
  upsertProfile,
  getProfile,
  formatProfileBlock,
  listContacts,
  formatContactsBlock,
  getRecentIncidents,
  formatIncidentBlock,
  ensureRecordIndexes,
  touchProfileSession,
} from './memory/records.js';

// auto = start in AGENT_LANGUAGE, then follow the caller's language
const AUTO = LANG_MODE === 'auto';
const L = LANGS[AGENT_LANGUAGE] ?? LANGS['en-IN'];

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

// English-only backup. Deliberately strict.
const NAME_STOPWORDS = new Set([
  'a', 'an', 'the', 'not', 'sorry', 'fine', 'good', 'ok', 'okay', 'back', 'later', 'now', 'please',
  'tomorrow', 'today', 'when', 'if', 'at', 'in', 'on', 'so', 'very', 'just', 'here', 'there',
  'and', 'but', 'still', 'really', 'actually', 'asha', 'what', 'who', 'why', 'how', 'something', 'anything',
]);

function extractSpokenName(text: string): { field: 'name' | 'preferredName'; value: string } | null {
  const m = text.match(/\b(my name is|my name's|call me)\s+([A-Za-z][A-Za-z'-]{1,29})\b/i);
  if (!m) return null;
  const w = m[2].toLowerCase();
  if (NAME_STOPWORDS.has(w) || w.endsWith('ing')) return null;
  const value = w.charAt(0).toUpperCase() + w.slice(1);
  return { field: m[1].toLowerCase() === 'call me' ? 'preferredName' : 'name', value };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), ms)),
  ]);
}

// Translate tool: only for simple non-medical text the caller asks for.
const translateTool = llm.tool({
  description:
    'Translate a short, non-medical sentence into another language. Use ONLY when the caller explicitly asks. ' +
    'NEVER use it for medicines, doses, symptoms or health advice.',
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
    'Get current date, day and time in India. Use whenever caller asks time, date or day.',
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
    'Look up clinic facts (timings, location, booking, doctors, fees) from the clinic knowledge base. ' +
    'Use for ANY question about the clinic.',
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
          note: 'No clinic information found. Say you do not have that detail and clinic staff can confirm it.',
        };
      }
      return { found: true, info: hits.map((h: any) => h.text) };
    } catch (e) {
      console.warn('[kb] lookup failed:', e instanceof Error ? e.message : e);
      return {
        found: false,
        note: 'Lookup unavailable. Say you could not check and clinic staff can confirm it.',
      };
    }
  },
});

export default defineAgent({
  prewarm: async (proc: JobProcess) => {
    proc.userData.vad = await silero.VAD.load();
    try {
      await ensureRecordIndexes();
    } catch (e) {
      console.warn('[records] index creation warning:', e instanceof Error ? e.message : e);
    }
    if (MEMORY_ENABLED) {
      try {
        await warmMemory();
      } catch (e) {
        console.warn('[memory] warm-up failed:', e instanceof Error ? e.message : e);
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
        languageCode: AUTO ? 'unknown' : L.code,
      }),
      llm: new openai.LLM({
        model: 'sarvam-105b',
        temperature: 0.2,
        client: sarvamClient as any,
      }),
      tts,
      turnHandling: {
        endpointing: { minDelay: ENDPOINTING_MIN_DELAY, maxDelay: ENDPOINTING_MAX_DELAY },
        interruption: { mode: 'adaptive', minDuration: 500 },
      },
    });

    let current = L.code;
    let silenceTimer: ReturnType<typeof setTimeout> | undefined;
    let maxTimer: ReturnType<typeof setTimeout> | undefined;
    let ending = false;
    let connected = false;

    // ---------- memory: who is this caller ----------
    let rawCallerId = '';
    if (CALLER_ID_MODE === 'participant') {
      await ctx.connect();
      connected = true;
      const p: any = await (ctx as any).waitForParticipant();
      rawCallerId = p?.attributes?.userId || p?.identity || '';
      if (!rawCallerId) {
        throw new Error('[caller] CALLER_ID_MODE is "participant" but no participant userId or identity was found.');
      }
    } else if (CALLER_ID_MODE === 'fixed' || CALLER_ID_MODE === 'test') {
      rawCallerId = TEST_CALLER_ID;
      if (!rawCallerId) {
        throw new Error(`[caller] CALLER_ID_MODE is "${CALLER_ID_MODE}" but TEST_CALLER_ID is missing in .env.`);
      }
    } else {
      throw new Error(`[caller] Unknown CALLER_ID_MODE: "${CALLER_ID_MODE}". Expected "fixed", "test", or "participant".`);
    }

    const { callerHash } = resolveCallerId(rawCallerId);

    // Update profile session metadata asynchronously
    if (callerHash && RECORDS_ENABLED) {
      touchProfileSession(callerHash).catch((e) =>
        console.warn('[records] touchProfileSession failed:', e instanceof Error ? e.message : e),
      );
    }

    const callId = `${ctx.room.name ?? 'unknown'}-${Date.now()}`;
    const transcriptLines: string[] = [];
    let userTurns = 0;

    const transcript = new SessionTranscript(callId, callerHash, () => current);

    // Parallel load of all caller history to minimize startup delay
    const [profileRes, memsRes, contactsRes, incidentsRes, exchangesRes] = await Promise.allSettled([
      callerHash && RECORDS_ENABLED ? withTimeout(getProfile(callerHash), MEMORY_LOAD_TIMEOUT_MS) : Promise.resolve(null),
      callerHash && MEMORY_ENABLED ? withTimeout(recentMemories(callerHash, 4), MEMORY_LOAD_TIMEOUT_MS) : Promise.resolve([]),
      callerHash && RECORDS_ENABLED ? withTimeout(listContacts(callerHash), MEMORY_LOAD_TIMEOUT_MS) : Promise.resolve([]),
      callerHash && RECORDS_ENABLED ? withTimeout(getRecentIncidents(callerHash, 3), MEMORY_LOAD_TIMEOUT_MS) : Promise.resolve([]),
      callerHash && RECALL_TRANSCRIPTS ? withTimeout(getRecentExchanges(callerHash, 6, callId), MEMORY_LOAD_TIMEOUT_MS) : Promise.resolve([]),
    ]);

    const existingProfile = profileRes.status === 'fulfilled' ? profileRes.value : null;
    const mems = memsRes.status === 'fulfilled' ? memsRes.value : [];
    const storedContacts = contactsRes.status === 'fulfilled' ? contactsRes.value : [];
    const inc = incidentsRes.status === 'fulfilled' ? incidentsRes.value : [];
    const prev = exchangesRes.status === 'fulfilled' ? exchangesRes.value : [];

    console.log(
      `[startup] hashPrefix="${callerHash.slice(0, 8)}", profileFound=${Boolean(existingProfile)}, mems=${mems.length}, contacts=${storedContacts.length}, incidents=${inc.length}, exchanges=${prev.length}`,
    );

    // Background snapshot every few caller turns
    let saving = false;
    const saveSnapshot = async () => {
      if (!callerHash || saving) return;
      saving = true;
      try {
        const t = transcriptLines.join('\n');
        await Promise.allSettled([
          MEMORY_ENABLED ? saveMemories(callerHash, current, t, callId) : Promise.resolve(0),
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
      silenceTimer = setTimeout(() => void endCall('silence'), SILENCE_TIMEOUT_MS);
    };

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
        console.warn('[lang] tts.updateOptions is not available');
        return;
      }
      t.updateOptions({ targetLanguageCode: n.code, speaker: n.speaker });
      console.log(`[lang] ${current} -> ${next}`);
      current = next;
    });

    (session as any).on('conversation_item_added', (ev: any) => {
      const item = ev?.item;
      const role: string | undefined = item?.role;
      const text: string = (item?.textContent ?? '').trim();
      if (!text || (role !== 'user' && role !== 'assistant')) return;

      transcript.add(role as 'user' | 'assistant', text);

      if (role === 'user') {
        userTurns++;
        if (isBye(text)) void endCall('caller said bye');

        if (NAME_FALLBACK && callerHash && RECORDS_ENABLED) {
          const spoken = extractSpokenName(text);
          if (spoken) {
            upsertProfile(callerHash, { [spoken.field]: spoken.value }, current, callId)
              .then(() => console.log(`[records] ${spoken.field} saved by fallback: ${spoken.value}`))
              .catch((e) => console.warn('[records] fallback name save failed:', e instanceof Error ? e.message : e));
          }
        }

        if (callerHash && userTurns >= MEMORY_MIN_USER_TURNS && userTurns % MEMORY_SAVE_EVERY_TURNS === 0) {
          void saveSnapshot();
        }
      }
      if (callerHash) {
        transcriptLines.push(`${role === 'user' ? 'Caller' : 'Assistant'}: ${text}`);
      }
    });

    maxTimer = setTimeout(() => void endCall('max duration'), MAX_CALL_MS);

    (ctx as any).addShutdownCallback?.(async () => {
      clearTimer();
      if (maxTimer) clearTimeout(maxTimer);

      await transcript.end();

      if (callerHash && userTurns >= MEMORY_MIN_USER_TURNS) {
        const text = transcriptLines.join('\n');
        const jobs: [string, Promise<unknown>][] = [];
        if (MEMORY_ENABLED) jobs.push(['notes', saveMemories(callerHash, current, text, callId)]);
        if (RECORDS_ENABLED) jobs.push(['record', saveRecordFromTranscript(callerHash, current, text, callId)]);

        const results = await Promise.allSettled(jobs.map(([, p]) => p));
        results.forEach((r, i) => {
          const label = jobs[i][0];
          if (r.status === 'fulfilled') console.log(`[memory] ${label} saved:`, JSON.stringify(r.value));
          else console.warn(`[memory] ${label} save failed:`, r.reason instanceof Error ? r.reason.message : r.reason);
        });
      } else if (callerHash) {
        console.log(`[memory] not saved (only ${userTurns} caller turn(s), need ${MEMORY_MIN_USER_TURNS})`);
      }
    });

    // ---------- build instructions (concise, minimal token overhead) ----------
    const baseInstructions = AUTO ? buildMultiPrompt(Object.values(LANGS)) : buildPrompt(L);
    let instructions = baseInstructions;

    if (ENABLE_TRANSLATE) {
      instructions += '\n\nIf asked to translate a simple non-medical sentence, use translateText.';
    }
    if (ENABLE_KB) {
      instructions += '\n\nFor questions about the clinic (timings, doctors, location, fees), use lookupClinicInfo.';
    }
    if (RECALL_TRANSCRIPTS) {
      instructions += '\n\nIf the caller refers to an earlier conversation, use recallConversation.';
    }
    if (callerHash && RECORDS_ENABLED) {
      instructions +=
        '\n\nRecord caller details with saveProfile (name, preferredName, age, language, allergies) immediately when stated. ' +
        'Save trusted contacts with saveContact. ' +
        'Record emergencies, injuries, falls, or severe symptoms immediately with reportIncident.';
    }

    if (mems.length) instructions += formatMemoryBlock(mems);
    if (existingProfile) instructions += formatProfileBlock(existingProfile);
    if (storedContacts.length) instructions += formatContactsBlock(storedContacts);
    if (inc.length) instructions += formatIncidentBlock(inc);
    if (prev.length) instructions += formatTranscriptBlock(prev);

    const agent = voice.Agent.create({
      instructions,
      tools: {
        getCurrentDateTime: timeTool,
        ...(ENABLE_KB ? { lookupClinicInfo: clinicInfoTool } : {}),
        ...(ENABLE_TRANSLATE ? { translateText: translateTool } : {}),
        ...(callerHash && RECORDS_ENABLED ? buildRecordTools(callerHash, callId, () => current) : {}),
        ...(callerHash && RECALL_TRANSCRIPTS ? { recallConversation: buildRecallTool(callerHash, callId) } : {}),
      },
    });

    await session.start({ agent, room: ctx.room });

    if (!connected) await ctx.connect();

    // Direct greeting via TTS — saves a full LLM turn + cold-start latency!
    try {
      await session.say(L.phrases.greeting);
    } catch {
      session.generateReply({
        instructions: `Say exactly this sentence: ${L.phrases.greeting}`,
      });
    }
  },
});

cli.runApp(
  new ServerOptions({
    agent: fileURLToPath(import.meta.url),
    ...(AGENT_NAME ? { agentName: AGENT_NAME } : {}),
  }),
);
