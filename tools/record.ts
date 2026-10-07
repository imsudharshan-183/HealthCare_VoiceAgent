import { llm } from '@livekit/agents';
import { ProfilePatch, IncidentInput, upsertProfile, addIncident } from '../memory/records.js';

// Built per session, because each session knows who the caller is and which call this is.
export function buildRecordTools(callerId: string, callId: string, getLang: () => string) {
  return {
    saveCallerDetails: llm.tool({
      description:
        'Save details the caller has just stated about themselves: their name, how they want to be addressed, ' +
        'age, a family member or carer who looks after them, or allergies. ' +
        'Call it as soon as the caller says one of these. Only include fields the caller actually said. ' +
        'Never guess. Do not announce that you are saving anything.',
      parameters: ProfilePatch,
      execute: async (patch) => {
        try {
          await upsertProfile(callerId, patch, getLang());
          console.log('[records] profile saved:', Object.keys(patch).join(', '));
          return { saved: true };
        } catch (err) {
          console.error('[records] profile save failed:', err);
          return { saved: false };
        }
      },
    }),

    reportIncident: llm.tool({
      description:
        'Record an emergency, injury, fall, severe pain, feeling unsafe, mental-health concern, or medication problem ' +
        'that the caller reports. Call it IMMEDIATELY when the caller mentions one, before anything else. ' +
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
              'Otherwise advise contacting the clinic directly. Do not give medical advice or a diagnosis.',
          };
        } catch (err) {
          console.error('[records] incident save failed:', err);
          return {
            saved: false,
            next: 'Tell the caller to call 112 if in immediate danger, or to contact the clinic directly.',
          };
        }
      },
    }),
  };
}