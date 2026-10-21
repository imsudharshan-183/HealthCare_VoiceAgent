// Shared Sarvam LLM client (OpenAI-compatible).
// Used by agent.ts (for the voice LLM) and memory.ts / records.ts (for extraction).
// Created once, imported everywhere — no duplication.
import OpenAI from 'openai';
import { SARVAM_API_KEY } from './config.js';

export const sarvamClient = new OpenAI({
  apiKey: SARVAM_API_KEY,
  baseURL: 'https://api.sarvam.ai/v1',
  defaultHeaders: { 'api-subscription-key': SARVAM_API_KEY },
  fetch: async (input: any, init?: any) => {
    if (typeof init?.body === 'string') {
      const body = JSON.parse(init.body);
      body.reasoning_effort = null; // thinking off
      init = { ...init, body: JSON.stringify(body) };
    }
    return fetch(input, init);
  },
});
