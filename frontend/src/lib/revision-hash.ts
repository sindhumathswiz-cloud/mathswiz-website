import { createHash } from 'node:crypto';
import { normalizeForMatch } from './revision-content';

// Server-only: kept apart from revision-content.ts so the client components that
// import that file's labels and helpers never pull node:crypto into the browser bundle.
export function revisionContentHash(body: string): string {
  return createHash('sha256').update(normalizeForMatch(body)).digest('hex').slice(0, 24);
}
