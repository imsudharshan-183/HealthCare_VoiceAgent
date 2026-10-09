import { llm } from '@livekit/agents';
import { z } from 'zod';
import {
  ProfilePatch,
  ContactInput,
  IncidentInput,
  upsertProfile,
  saveContact,
  listContacts,
  findContact,
  removeContact,
  addIncident,
  type ProfilePatchT,
} from '../memory/records.js';

// Drop null, undefined, blank strings and empty arrays, so an empty value can never overwrite stored data.
function cleanPatch(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(p)) {
    if (v === undefined || v === null) continue;
    if (typeof v === 'string') {
      const t = v.trim();
      if (t) out[k] = t;
      continue;
    }
    if (Array.isArray(v)) {
      const a = v.filter((x) => typeof x !== 'string' || x.trim() !== '');
      if (a.length) out[k] = a;
      continue;
    }
    out[k] = v;
  }
  return out;
}

// Logs must never show full phone numbers or emails.
function maskDest(d: string): string {
  if (d.includes('@')) {
    const [u, dom] = d.split('@');
    return `${u.slice(0, 1)}***@${dom}`;
  }
  const digits = d.replace(/\D/g, '');
  return digits.length >= 2 ? `****${digits.slice(-2)}` : '****';
}

// Built per session, because each session knows who the caller is and which call this is.
export function buildRecordTools(callerId: string, callId: string, getLang: () => string) {
  // reachOut needs a confirmation step in THIS session before anything is sent.
  const pendingReach = new Map<string, string>();

  const saveProfileTool = llm.tool({
    description:
      'Save or update caller profile details (name, preferredName, age, language, allergies). ' +
      'MUST be called the moment the caller states their name (e.g. "my name is Tom", "call me Tom"), ' +
      'age, language preference, or allergies. Call it BEFORE you reply. ' +
      'If the caller CORRECTS a detail (for example "actually call me Thomas" or "my name is Tom, not Lakshmi"), ' +
      'call this again immediately with the new value. ' +
      'Use removeAllergies only when the caller says they do not have an allergy. ' +
      'Never include fields the caller did not state. Never overwrite with empty values. ' +
      'Do not announce that you are saving anything.',
    parameters: ProfilePatch,
    execute: async (patch) => {
      try {
        const cleaned = cleanPatch(patch as Record<string, unknown>);
        if (!Object.keys(cleaned).length) {
          return { saved: false, next: 'Nothing to save. Continue the conversation naturally.' };
        }
        const r = await upsertProfile(callerId, cleaned as ProfilePatchT, getLang(), callId);
        console.log('[records] profile saved:', Object.keys(cleaned).join(', '));
        return {
          saved: true,
          next: r?.conflict
            ? 'This name differs from the one on file, so a new profile was started. Politely confirm the caller\'s name before using it. Do not mention saving.'
            : 'Continue conversation naturally. If you now know their name, use it warmly. Do not mention that anything was saved.',
        };
      } catch (err) {
        console.error('[records] profile save failed:', err);
        return {
          saved: false,
          next: 'Continue conversation naturally. Do not mention any save error to the caller.',
        };
      }
    },
  });

  const saveContactTool = llm.tool({
    description:
      'Save a contact person the caller wants kept on file (e.g. daughter, son, neighbor, doctor). ' +
      "Must include the person's name and at least a phone number or email address. " +
      'Call this whenever the caller provides contact details for someone they might want reached.',
    parameters: ContactInput,
    execute: async (input) => {
      try {
        if (!input.phone?.trim() && !input.email?.trim()) {
          return {
            saved: false,
            next: `Ask the caller for a phone number or email address for ${input.name}, then save again.`,
          };
        }
        const saved = await saveContact(callerId, input);
        console.log(`[records] contact saved: ${saved.name} (${saved.relation ?? 'no relation'})`);
        return {
          saved: true,
          contact: { name: saved.name, relation: saved.relation },
          next: `Acknowledge warmly that you have saved ${saved.name} in their contacts.`,
        };
      } catch (err) {
        console.error('[records] contact save failed:', err);
        return {
          saved: false,
          next: 'Continue conversation naturally without alerting the caller to a technical error.',
        };
      }
    },
  });

  const listContactsTool = llm.tool({
    description:
      'List all stored contacts for this caller. Use when the caller asks who you have on file, ' +
      'or who can be contacted.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const all = await listContacts(callerId);
        if (!all.length) {
          return { found: false, message: 'No contacts on file for this caller.' };
        }
        return {
          found: true,
          contacts: all.map((c) => ({
            name: c.name,
            relation: c.relation ?? 'unspecified',
            phone: c.phone ?? 'none',
            email: c.email ?? 'none',
          })),
        };
      } catch (err) {
        console.error('[records] list contacts failed:', err);
        return { found: false, message: 'Could not retrieve contacts right now.' };
      }
    },
  });

  const removeContactTool = llm.tool({
    description:
      'Remove a stored contact by name when the caller asks to delete or remove them from their file.',
    parameters: z.object({
      name: z.string().describe('Name of the contact to remove'),
    }),
    execute: async ({ name }) => {
      try {
        const deleted = await removeContact(callerId, name);
        if (deleted) {
          console.log(`[records] contact removed: ${name}`);
          return { removed: true, message: `Removed ${name} from contacts.` };
        }
        return { removed: false, message: `Could not find a contact named ${name}.` };
      } catch (err) {
        console.error('[records] remove contact failed:', err);
        return { removed: false, message: 'Could not remove contact at this time.' };
      }
    },
  });

  const reachOutTool = llm.tool({
    description:
      'Reach out to a stored contact via sms, email, or call on behalf of the user. ' +
      'IMPORTANT RULE: You MUST ask the user to explicitly confirm before dispatching. ' +
      'First call this tool with confirmed=false to check details, then ask the user to confirm. ' +
      'Once the user says yes, call it again with confirmed=true.',
    parameters: z.object({
      contactName: z.string().describe('Name of the contact to reach out to'),
      channel: z.enum(['sms', 'email', 'call']).describe('Channel to reach out: sms, email, or call'),
      message: z.string().describe('The message or summary to convey to the contact'),
      confirmed: z
        .boolean()
        .optional()
        .describe('Set to true only if the user has explicitly confirmed sending/calling'),
    }),
    execute: async ({ contactName, channel, message, confirmed }) => {
      try {
        const contact = await findContact(callerId, contactName);
        if (!contact) {
          return {
            status: 'not_found',
            next: `No contact named "${contactName}" is on file. Ask the user for their phone number or email first.`,
          };
        }

        const destination = channel === 'email' ? contact.email : contact.phone;
        if (!destination) {
          return {
            status: 'missing_destination',
            next: `Contact "${contact.name}" is on file, but has no ${channel === 'email' ? 'email' : 'phone number'}. Ask the user for it first.`,
          };
        }

        const key = `${contact.name.toLowerCase()}|${channel}`;

        // Code-level guard: a send needs an earlier confirmation request in this session.
        if (!confirmed || !pendingReach.has(key)) {
          pendingReach.set(key, message);
          return {
            status: 'confirmation_required',
            contactName: contact.name,
            channel,
            message,
            next: `Ask the caller explicitly: "Would you like me to send this ${channel} to ${contact.name} saying: '${message}'?" Do not send until they confirm.`,
          };
        }

        const finalMessage = pendingReach.get(key) ?? message;
        pendingReach.delete(key);

        // Provider not integrated yet: simulate. Never log the full destination.
        console.log(`[reachOut] SIMULATED: channel=${channel}, to="${contact.name}" (${maskDest(destination)})`);
        return {
          status: 'dispatched',
          message: finalMessage,
          next: `Inform the caller warmly that the ${channel} to ${contact.name} has been sent.`,
        };
      } catch (err) {
        console.error('[reachOut] reachOut failed:', err);
        return {
          status: 'error',
          next: 'Apologise briefly and let the caller know you could not send the message right now.',
        };
      }
    },
  });

  const reportIncidentTool = llm.tool({
    description:
      'Record an emergency, injury, fall, getting hurt, bleeding, severe pain, feeling unsafe, mental-health concern, ' +
      'or medication problem that the caller reports. Call it IMMEDIATELY when the caller mentions one, ' +
      'even if the wording is short or vague (for example "I got hurt"), before anything else. ' +
      'Describe only what the caller said. Do not diagnose and do not include medicine names or doses.',
    parameters: IncidentInput,
    execute: async (incident) => {
      try {
        await addIncident(callerId, incident, getLang(), callId, 'live_tool');
        console.log(`[records] incident saved: ${incident.type} / ${incident.severity}`);
        return {
          saved: true,
          next:
            'Stay calm and kind. If the caller may be in immediate danger, tell them to call the emergency number 112 now. ' +
            'Otherwise advise contacting the clinic directly. Do not give medical advice, first-aid instructions or a diagnosis.',
        };
      } catch (err) {
        console.error('[records] incident save failed:', err);
        return {
          saved: false,
          next: 'Tell the caller to call 112 if in immediate danger, or to contact the clinic directly.',
        };
      }
    },
  });

  return {
    saveProfile: saveProfileTool,
    saveCallerDetails: saveProfileTool, // backward compatibility alias
    saveContact: saveContactTool,
    listContacts: listContactsTool,
    removeContact: removeContactTool,
    reachOut: reachOutTool,
    reportIncident: reportIncidentTool,
  };
}