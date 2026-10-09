import { createHash } from 'node:crypto';

export interface CallerIdentity {
  rawId: string;
  callerHash: string;
}

/**
 * Computes a deterministic SHA-256 hash for a given caller ID.
 * Never stores or returns the raw ID into MongoDB collections.
 */
export function hashCallerId(raw: string): string {
  const salt = process.env.MEMORY_SALT ?? '';
  return createHash('sha256').update(`${salt}:${raw.trim()}`).digest('hex');
}

/**
 * Resolves caller identity consistently across live sessions, console tests, and unit tests.
 * Never uses a hidden fallback string. If an ID is missing, it throws a clear Error.
 */
export function resolveCallerId(explicitRawId?: string | null): CallerIdentity {
  const rawId = (explicitRawId && explicitRawId.trim().length > 0)
    ? explicitRawId.trim()
    : process.env.TEST_CALLER_ID?.trim();

  if (!rawId) {
    throw new Error(
      '[caller] No caller ID could be resolved. When CALLER_ID_MODE is "fixed" or "test", ' +
      'TEST_CALLER_ID must be set in .env or the environment.'
    );
  }

  const callerHash = hashCallerId(rawId);
  return { rawId, callerHash };
}
