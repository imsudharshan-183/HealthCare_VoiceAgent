// memory/test-ids.ts
import { hashCallerId } from './memory.js';
import { getDb } from '../rag/store.js';

export const SCRIPT_IDS = {
  records: 'script-records-test',
  memory: 'script-memory-test',
  profileSelftest: 'script-profile-selftest',
} as const;

// Deletes only documents whose callerId is the hash of a script-only ID. Refuses anything else.
export async function cleanupScriptData(rawId: string): Promise<Record<string, number>> {
  if (!rawId.startsWith('script-')) throw new Error('refusing: not a script-only ID');
  if (rawId === process.env.TEST_CALLER_ID) throw new Error('refusing: equals TEST_CALLER_ID');
  const hash = hashCallerId(rawId);
  const db = await getDb();
  const out: Record<string, number> = {};
  for (const c of await db.listCollections().toArray()) {
    if (c.name.startsWith('system.')) continue;
    const r = await db.collection(c.name).deleteMany({ callerId: hash });
    if (r.deletedCount) out[c.name] = r.deletedCount;
  }
  return out;
}