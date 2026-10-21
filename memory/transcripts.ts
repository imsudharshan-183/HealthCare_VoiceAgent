import { getDb } from '../rag/store.js';
import { TRANSCRIPT_TTL_DAYS, SAVE_TRANSCRIPTS } from '../config.js';

const TTL_DAYS = TRANSCRIPT_TTL_DAYS;
const ENABLED = SAVE_TRANSCRIPTS;
let indexed = false;

type Exchange = { n: number; q?: string; a?: string; qAt?: Date; aAt?: Date };

// One document per session. Each exchange = one caller message + the agent's reply, stored together.
export class SessionTranscript {
  private exchanges: Exchange[] = [];
  private startedAt = new Date();
  private endedAt?: Date;
  private dirty = false;
  private saving: Promise<void> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private callId: string,
    private callerId: string,
    private getLang: () => string,
  ) {}

  // Call for every finished message (voice or typed).
  add(role: 'user' | 'assistant', text: string) {
    if (!ENABLED) return;
    const t = text.trim();
    if (!t) return;
    const now = new Date();
    const last = this.exchanges[this.exchanges.length - 1];

    if (role === 'user') {
      if (last && last.q && !last.a) last.q += ' ' + t;            // caller kept talking before any reply
      else this.exchanges.push({ n: this.exchanges.length + 1, q: t, qAt: now });
      return;                                                       // written when the reply arrives
    }

    if (last) {
      if (last.a) last.a += ' ' + t;                                // agent said more in the same turn
      else { last.a = t; last.aAt = now; }
    } else {
      this.exchanges.push({ n: 1, a: t, aAt: now });                // greeting: no question before it
    }

    // Debounce flush by 3 seconds so rapid turns batch together
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => void this.flush(), 3000);
  }

  async end() {
    if (!ENABLED) return;
    clearTimeout(this.debounceTimer);
    this.endedAt = new Date();
    await this.flush();
  }

  // One write at a time. Writes that arrive during a save are merged into one follow-up write.
  flush(): Promise<void> {
    if (!ENABLED || !this.exchanges.length) return Promise.resolve();
    if (this.saving) { this.dirty = true; return this.saving; }
    this.saving = (async () => {
      try {
        do { this.dirty = false; await this.write(); } while (this.dirty);
      } catch (e) {
        console.warn('[transcript] save failed:', e instanceof Error ? e.message : e);
      } finally {
        this.saving = null;
      }
    })();
    return this.saving;
  }

  // Human-readable copy, one line per row, same layout as `npm run transcripts:show`.
  private readable(): string[] {
    const out = [
      `== ${this.callId} | ${this.getLang()} | ${this.exchanges.length} exchange(s) | ended: ${this.endedAt ? 'yes' : 'no'}`,
    ];
    for (const x of this.exchanges) {
      out.push(`${x.n}. Q: ${x.q ?? '-'}`);
      out.push(`   A: ${x.a ?? '-'}`);
    }
    return out;
  }

  private async write() {
    const c = (await getDb()).collection<any>('transcripts');
    if (!indexed) {
      await c.createIndex({ callerId: 1, startedAt: -1 });
      await c.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
      indexed = true;
    }
    const now = new Date();
    const set: Record<string, unknown> = {
      callerId: this.callerId,
      language: this.getLang(),
      readable: this.readable(),          // for people; use .join('\n') for a single string instead
      exchanges: this.exchanges,          // for the agent's recall code
      exchangeCount: this.exchanges.length,
      updatedAt: now,
      expiresAt: new Date(now.getTime() + TTL_DAYS * 86400_000),
    };
    if (this.endedAt) set.endedAt = this.endedAt;
    await c.updateOne({ _id: this.callId }, { $set: set, $setOnInsert: { startedAt: this.startedAt } }, { upsert: true });
  }
}

// ---------- recall helpers (used by agent.ts and tools/recall.ts) ----------
const clean = (s: string, max = 160) => s.replace(/[\r\n]+/g, ' ').trim().slice(0, max);
const idFilter = (exclude?: string) => (exclude ? { _id: { $ne: exclude } } : {});

// The last real exchanges of the most recent earlier session
export async function getRecentExchanges(callerId: string, n = 6, excludeCallId?: string) {
  const c = (await getDb()).collection<any>('transcripts');
  const doc = await c.findOne(
    { callerId, ...idFilter(excludeCallId), exchangeCount: { $gte: 2 } },
    { sort: { startedAt: -1 }, projection: { exchanges: 1, startedAt: 1 } },
  );
  if (!doc) return [];
  return (doc.exchanges as Exchange[])
    .filter((e) => e.q && e.a)
    .slice(-n)
    .map((e) => ({ q: e.q!, a: e.a!, at: doc.startedAt as Date }));
}

export function formatTranscriptBlock(list: { q: string; a: string; at: Date }[]): string {
  if (!list.length) return '';
  const when = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }).format(new Date(list[0].at));
  const lines = list.map((x) => `- Caller: ${clean(x.q)}\n  You: ${clean(x.a)}`).join('\n');
  return `\n\nLast call (${when}):\n${lines}`;
}

// Keyword search over the caller's 20 most recent earlier sessions
export async function searchExchanges(callerId: string, topic: string, excludeCallId?: string, maxHits = 5) {
  const words = topic.toLowerCase().split(/\s+/).filter((w) => w.length >= 3);
  if (!words.length) return [];
  const c = (await getDb()).collection<any>('transcripts');
  const docs = await c
    .find({ callerId, ...idFilter(excludeCallId) }, { projection: { exchanges: 1, startedAt: 1 } })
    .sort({ startedAt: -1 })
    .limit(20)
    .toArray();
  const hits: { date: string; q: string; a: string }[] = [];
  for (const d of docs) {
    for (const e of [...(d.exchanges as Exchange[])].reverse()) {
      const text = `${e.q ?? ''} ${e.a ?? ''}`.toLowerCase();
      if (words.some((w) => text.includes(w)))
        hits.push({ date: new Date(d.startedAt).toISOString().slice(0, 10), q: clean(e.q ?? ''), a: clean(e.a ?? '') });
      if (hits.length >= maxHits) return hits;
    }
  }
  return hits;
}
