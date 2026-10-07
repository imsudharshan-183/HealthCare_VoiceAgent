import { z } from 'zod';
import { getDb } from '../rag/store.js';
import { llmClient } from './memory.js';

// ---------- FIXED SCHEMA: change these lists to change what the agent records ----------
export const INCIDENT_TYPES = [
  'emergency', 'injury', 'fall', 'pain_or_symptom', 'mental_health', 'medication_issue', 'other',
] as const;
export const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const;

export const ProfilePatch = z.object({
  name: z.string().min(1).max(80).optional().describe("Caller's full name"),
  preferredName: z.string().min(1).max(80).optional().describe('How the caller wants to be addressed'),
  age: z.number().int().min(0).max(120).optional(),
  caregiverName: z.string().min(1).max(80).optional().describe('Family member or carer who looks after the caller'),
  caregiverRelation: z.string().min(1).max(40).optional().describe('For example daughter, son, neighbour'),
  allergies: z.array(z.string().min(1).max(60)).max(10).optional().describe('Allergies the caller states'),
});
export type ProfilePatchT = z.infer<typeof ProfilePatch>;

export const IncidentInput = z.object({
  type: z.enum(INCIDENT_TYPES),
  severity: z.enum(SEVERITIES).describe('critical = immediate danger; high = urgent; medium = needs follow-up; low = minor'),
  summary: z.string().min(3).max(300).describe('One or two factual sentences in English, in the caller\'s own terms. No diagnosis.'),
});
export type IncidentInputT = z.infer<typeof IncidentInput>;

const INCIDENT_TTL_DAYS = Number(process.env.INCIDENT_TTL_DAYS ?? 365);
// archive (default) = a different name starts a fresh profile and the old one moves to history
// merge = keep the old behaviour (fields are merged into one profile)
const ON_NAME_CHANGE = process.env.PROFILE_ON_NAME_CHANGE ?? 'archive';

type ProfileDoc = ProfilePatchT & {
  callerId: string; language: string; createdAt: Date; updatedAt: Date; lastCallId?: string;
};
type IncidentDoc = IncidentInputT & {
  callerId: string;
  callId: string;
  language: string;
  status: 'new' | 'reviewed' | 'closed';
  source: 'live_tool' | 'end_of_call';
  reportedAt: Date;
  expiresAt: Date;
};

const profiles = async () => (await getDb()).collection<ProfileDoc>('caller_profiles');
const incidents = async () => (await getDb()).collection<IncidentDoc>('incidents');

// Run once (add to memory/setup.ts). Plain indexes only, so no search-index slot is used.
export async function ensureRecordIndexes() {
  const p = await profiles();
  await p.createIndex({ callerId: 1 }, { unique: true });
  const i = await incidents();
  await i.createIndex({ callerId: 1, reportedAt: -1 });
  await i.createIndex({ status: 1, severity: 1, reportedAt: -1 }); // staff queue: new + critical first
  await i.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  console.log('[records] indexes ready');
}

// ---------- write ----------
export async function upsertProfile(
  callerId: string,
  patch: ProfilePatchT,
  language: string,
  callId?: string,
): Promise<{ conflict: boolean }> {
  const { allergies, ...rest } = patch;
  const c = await profiles();
  const existing: any = await c.findOne({ callerId });

  // A different name on the same ID, written by an EARLIER call, means a different person.
  // A correction inside the same call (callId matches) just updates the profile.
  const nameChanged =
    !!callId &&
    !!rest.name &&
    !!existing?.name &&
    existing.lastCallId !== callId &&
    existing.name.trim().toLowerCase() !== rest.name.trim().toLowerCase();

  if (nameChanged && ON_NAME_CHANGE !== 'merge') {
    const { _id, ...old } = existing;
    const db = await getDb();
    await db.collection('caller_profiles_history').insertOne({
      ...old,
      archivedAt: new Date(),
      replacedByName: rest.name,
    });
    await c.deleteOne({ callerId });
    console.log(`[records] name changed (${existing.name} -> ${rest.name}): old profile archived, new profile started`);
  }

  const set: Record<string, unknown> = { language, updatedAt: new Date() };
  if (callId) set.lastCallId = callId;
  for (const [k, v] of Object.entries(rest)) if (v !== undefined && v !== '') set[k] = v;

  const update: any = { $set: set, $setOnInsert: { createdAt: new Date() } };
  if (allergies?.length) update.$addToSet = { allergies: { $each: allergies } };
  await c.updateOne({ callerId }, update, { upsert: true });

  return { conflict: nameChanged };
}

export async function addIncident(
  callerId: string,
  inc: IncidentInputT,
  language: string,
  callId: string,
  source: 'live_tool' | 'end_of_call',
): Promise<boolean> {
  const c = await incidents();
  // The end-of-call pass must not duplicate what the live tool already saved this session.
  if (source === 'end_of_call' && (await c.findOne({ callerId, callId, type: inc.type }))) return false;
  const now = new Date();
  await c.insertOne({
    ...inc,
    callerId,
    callId,
    language,
    status: 'new',
    source,
    reportedAt: now,
    expiresAt: new Date(now.getTime() + INCIDENT_TTL_DAYS * 86400_000),
  });
  return true;
}

// ---------- end-of-session extraction with the same fixed schema ----------
// The model sometimes returns null or empty values, which fail validation. Drop them first.
const dropEmpty = (o: any): Record<string, unknown> =>
  Object.fromEntries(
    Object.entries(o ?? {}).filter(
      ([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0),
    ),
  );

async function extractRecord(transcript: string): Promise<{ profile: ProfilePatchT; incidents: IncidentInputT[] }> {
  const res = await llmClient.chat.completions.create({
    model: 'sarvam-105b',
    temperature: 0,
    messages: [
      {
        role: 'system',
        content:
          'You fill a fixed record from a conversation between a clinic voice assistant and a caller. ' +
          'Output ONLY one JSON object, no other text, in exactly this shape: ' +
          '{"profile": {"name"?: string, "preferredName"?: string, "age"?: number, "caregiverName"?: string, ' +
          '"caregiverRelation"?: string, "allergies"?: string[]}, ' +
          `"incidents": [{"type": one of ${JSON.stringify(INCIDENT_TYPES)}, ` +
          `"severity": one of ${JSON.stringify(SEVERITIES)}, "summary": string}]}. ` +
          'RULES: include a field ONLY if the CALLER explicitly said it. Never guess or infer. Omit unknown fields; never use null. ' +
          'Write summaries in English, factual, one or two sentences, no diagnosis and no advice. ' +
          'An incident is any emergency, injury, fall, severe pain, feeling unsafe, or medication problem the caller reports. ' +
          'Do not record medicine names or doses. If nothing applies, output {"profile": {}, "incidents": []}.',
      },
      { role: 'user', content: transcript.slice(0, 6000) },
    ],
  } as any);

  const raw = res.choices[0]?.message?.content ?? '';
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return { profile: {}, incidents: [] };
  try {
    const obj = JSON.parse(m[0]);
    const profile = ProfilePatch.safeParse(dropEmpty(obj.profile));
    const list = Array.isArray(obj.incidents) ? obj.incidents : [];
    return {
      profile: profile.success ? profile.data : {},
      incidents: list
        .map((x: unknown) => IncidentInput.safeParse(dropEmpty(x)))
        .filter((r: any) => r.success)
        .map((r: any) => r.data),
    };
  } catch {
    return { profile: {}, incidents: [] };
  }
}

export async function saveRecordFromTranscript(callerId: string, language: string, transcript: string, callId: string) {
  const { profile, incidents: found } = await extractRecord(transcript);
  if (Object.keys(profile).length) await upsertProfile(callerId, profile, language, callId);
  let added = 0;
  for (const inc of found) if (await addIncident(callerId, inc, language, callId, 'end_of_call')) added++;
  return { profileFields: Object.keys(profile).length, incidentsAdded: added };
}