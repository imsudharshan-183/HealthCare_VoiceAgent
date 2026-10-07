import { embed, EMBED_DIM } from './embed.js';
import { getDb } from './store.js';

export const KB_INDEX = 'kb_vec';
const KB_MIN_SCORE = Number(process.env.KB_MIN_SCORE ?? 0.5);

type KbDoc = { source: string; chunkIdx: number; text: string; embedding: number[]; createdAt: Date };
const col = async () => (await getDb()).collection<KbDoc>('kb');

// Run once: creates the collection and the vector index.
export async function ensureKbIndex() {
  const db = await getDb();
  if (!(await db.listCollections({ name: 'kb' }).toArray()).length) await db.createCollection('kb');
  const c = await col();
  if (!(await c.listSearchIndexes().toArray()).some((i) => i.name === KB_INDEX)) {
    await c.createSearchIndex({
      name: KB_INDEX,
      type: 'vectorSearch',
      definition: { fields: [{ type: 'vector', path: 'embedding', numDimensions: EMBED_DIM, similarity: 'cosine' }] },
    });
    console.log('[kb] vector index created (wait for READY in Atlas)');
  }
}

// Split on blank lines, then pack paragraphs into chunks of about `max` characters.
export function chunkText(text: string, max = 800): string[] {
  const out: string[] = [];
  let cur = '';
  for (const p of text.split(/\n\s*\n/).map((s) => s.trim()).filter(Boolean)) {
    if (cur && (cur + '\n\n' + p).length > max) { out.push(cur); cur = p; }
    else cur = cur ? cur + '\n\n' + p : p;
  }
  if (cur) out.push(cur);
  return out;
}

// Re-ingesting the same source replaces its old chunks, so it is safe to re-run.
export async function ingestDoc(source: string, text: string): Promise<number> {
  const chunks = chunkText(text);
  const c = await col();
  await c.deleteMany({ source });
  const docs: KbDoc[] = [];
  for (let i = 0; i < chunks.length; i += 20) {
    const batch = chunks.slice(i, i + 20);
    const vecs = await embed(batch, 'document');
    batch.forEach((t, j) =>
      docs.push({ source, chunkIdx: i + j, text: t, embedding: vecs[j], createdAt: new Date() }));
  }
  if (docs.length) await c.insertMany(docs);
  return docs.length;
}

export async function retrieve(query: string, k = 3): Promise<{ text: string; source: string; score: number }[]> {
  const [vector] = await embed([query], 'query');
  const c = await col();
  const hits = await c
    .aggregate<{ text: string; source: string; score: number }>([
      { $vectorSearch: { index: KB_INDEX, path: 'embedding', queryVector: vector, numCandidates: 50, limit: k } },
      { $project: { text: 1, source: 1, score: { $meta: 'vectorSearchScore' } } },
    ])
    .toArray();
  return hits.filter((h) => h.score >= KB_MIN_SCORE);
}
