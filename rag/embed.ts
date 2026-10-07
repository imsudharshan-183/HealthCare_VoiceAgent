// Choose a provider with EMBED_PROVIDER=gemini | cohere | ollama | openai in .env
const PROVIDER = process.env.EMBED_PROVIDER ?? 'gemini';

export const EMBED_DIM: number =
  Number(process.env.EMBED_DIM) ||
  ({ gemini: 768, cohere: 1024, ollama: 1024, openai: 1536 } as Record<string, number>)[PROVIDER] ||
  768;

type Kind = 'document' | 'query';

async function post(url: string, body: unknown, headers: Record<string, string>) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) throw new Error(`embed ${PROVIDER} ${r.status}: ${await r.text()}`);
  return r.json() as Promise<any>;
}

export async function embed(texts: string[], kind: Kind = 'document'): Promise<number[][]> {
  if (PROVIDER === 'gemini') {
    const model = process.env.EMBED_MODEL ?? 'gemini-embedding-001';
    const d = await post(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
      {
        requests: texts.map((t) => ({
          model: `models/${model}`,
          content: { parts: [{ text: t }] },
          taskType: kind === 'query' ? 'RETRIEVAL_QUERY' : 'RETRIEVAL_DOCUMENT',
          outputDimensionality: EMBED_DIM,
        })),
      },
      { 'x-goog-api-key': process.env.GEMINI_API_KEY! },
    );
    return d.embeddings.map((e: any) => e.values);
  }

  if (PROVIDER === 'cohere') {
    const d = await post(
      'https://api.cohere.com/v2/embed',
      {
        model: process.env.EMBED_MODEL ?? 'embed-multilingual-v3.0',
        texts,
        input_type: kind === 'query' ? 'search_query' : 'search_document',
        embedding_types: ['float'],
      },
      { Authorization: `Bearer ${process.env.COHERE_API_KEY}` },
    );
    return d.embeddings.float;
  }

  if (PROVIDER === 'ollama') {
    const d = await post(
      `${process.env.OLLAMA_URL ?? 'http://localhost:11434'}/api/embed`,
      { model: process.env.EMBED_MODEL ?? 'bge-m3', input: texts },
      {},
    );
    return d.embeddings;
  }

  const d = await post(
    'https://api.openai.com/v1/embeddings',
    { model: process.env.EMBED_MODEL ?? 'text-embedding-3-small', input: texts },
    { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  );
  return d.data.map((x: any) => x.embedding);
}