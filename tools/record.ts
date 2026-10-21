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
      'Call the moment caller states or corrects their details, before replying.',
    parameters: ProfilePatch,
    execute: async (patch) => {
      try {
        const cleaned = cleanPatch(patch as Record<string, unknown>);
        if (!Object.keys(cleaned).length) {
          return { saved: false, next: 'Nothing to save.' };
        }
        const r = await upsertProfile(callerId, cleaned as ProfilePatchT, getLang(), callId);
        console.log('[records] profile saved:', Object.keys(cleaned).join(', '));
        return {
          saved: true,
          next: r?.conflict ? 'Name changed; confirm with caller.' : 'Saved. Continue naturally.',
        };
      } catch (err) {
        console.error('[records] profile save failed:', err);
        return {
          saved: false,
          next: 'Save failed silently. Continue.',
        };
      }
    },
  });

  const saveContactTool = llm.tool({
    description:
      'Save a contact person the caller wants kept on file (e.g. daughter, son, neighbor, doctor). ' +
      'Requires name and at least a phone number or email address.',
    parameters: ContactInput,
    execute: async (input) => {
      try {
        if (!input.phone?.trim() && !input.email?.trim()) {
          return {
            saved: false,
            next: `Ask for phone or email for ${input.name}.`,
          };
        }
        const saved = await saveContact(callerId, input);
        console.log(`[records] contact saved: ${saved.name} (${saved.relation ?? 'no relation'})`);
        return {
          saved: true,
          contact: { name: saved.name, relation: saved.relation },
          next: `Saved ${saved.name}. Acknowledge warmly.`,
        };
      } catch (err) {
        console.error('[records] contact save failed:', err);
        return {
          saved: false,
          next: 'Save failed silently. Continue.',
        };
      }
    },
  });

  const listContactsTool = llm.tool({
    description: 'List all stored contacts for this caller.',
    parameters: z.object({}),
    execute: async () => {
      try {
        const all = await listContacts(callerId);
        if (!all.length) {
          return { found: false, message: 'No contacts on file.' };
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
    description: 'Remove a stored contact by name.',
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
      'Reach out to a stored contact via sms, email, or call. ' +
      'Requires explicit user confirmation before dispatching.',
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
            next: `No contact "${contactName}". Ask for details.`,
          };
        }

        const destination = channel === 'email' ? contact.email : contact.phone;
        if (!destination) {
          return {
            status: 'missing_destination',
            next: `${contact.name} has no ${channel === 'email' ? 'email' : 'phone'}. Ask for it.`,
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
            next: `Confirm with caller before sending ${channel} to ${contact.name}.`,
          };
        }

        const finalMessage = pendingReach.get(key) ?? message;
        pendingReach.delete(key);

        console.log(`[reachOut] SIMULATED: channel=${channel}, to="${contact.name}" (${maskDest(destination)})`);
        return {
          status: 'dispatched',
          message: finalMessage,
          next: `${channel} to ${contact.name} sent. Inform caller.`,
        };
      } catch (err) {
        console.error('[reachOut] reachOut failed:', err);
        return {
          status: 'error',
          next: 'Send failed. Apologise briefly.',
        };
      }
    },
  });

  const reportIncidentTool = llm.tool({
    description:
      'Record an emergency, injury, fall, severe pain, feeling unsafe, or medication issue reported by caller. ' +
      'Call IMMEDIATELY without diagnosing or giving medical advice.',
    parameters: IncidentInput,
    execute: async (incident) => {
      try {
        await addIncident(callerId, incident, getLang(), callId, 'live_tool');
        console.log(`[records] incident saved: ${incident.type} / ${incident.severity}`);
        return {
          saved: true,
          next: 'If in danger, say call 112. Else advise clinic.',
        };
      } catch (err) {
        console.error('[records] incident save failed:', err);
        return {
          saved: false,
          next: 'Tell caller: call 112 or contact clinic.',
        };
      }
    },
  });

  return {
    saveProfile: saveProfileTool,
    saveContact: saveContactTool,
    listContacts: listContactsTool,
    removeContact: removeContactTool,
    reachOut: reachOutTool,
    reportIncident: reportIncidentTool,
  };
}
