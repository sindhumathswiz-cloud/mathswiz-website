/**
 * Robust parsing of JSON returned by an LLM, hardened for math content where
 * LaTeX backslashes routinely break `JSON.parse`.
 *
 * Two distinct failure modes:
 *  - `\sqrt`, `\int`, `\alpha` → invalid JSON escapes → JSON.parse THROWS (the
 *    whole response is lost).
 *  - `\frac`, `\times`, `\neq` → start with valid escape letters (\f, \t, \n) →
 *    JSON.parse SUCCEEDS but silently corrupts the value (form-feed / tab).
 *
 * Strategy: try the raw parse first (so legitimately-escaped JSON, including
 * real `\n` newlines, is preserved). Only if that fails do we extract the JSON
 * object and repair backslashes, distinguishing a LaTeX command (a control
 * letter followed by more letters, e.g. `\frac`) from a genuine control char
 * (a lone `\n`).
 */

/** Remove ```json fences / commentary fences. */
export function stripFences(s: string): string {
  return s.replace(/```json/gi, '').replace(/```/g, '').trim();
}

/** Narrow a string with preamble/suffix down to the outermost JSON object/array. */
function extractJsonBlock(s: string): string {
  const firstObj = s.indexOf('{');
  const firstArr = s.indexOf('[');
  let start = -1;
  if (firstObj === -1) start = firstArr;
  else if (firstArr === -1) start = firstObj;
  else start = Math.min(firstObj, firstArr);
  if (start === -1) return s;
  const open = s[start];
  const close = open === '{' ? '}' : ']';
  const end = s.lastIndexOf(close);
  if (end <= start) return s;
  return s.slice(start, end + 1);
}

/** Repair the common ways LLM-emitted math JSON is malformed. */
export function repairJson(s: string): string {
  let r = extractJsonBlock(s);

  // Drop trailing commas before } or ]
  r = r.replace(/,\s*([}\]])/g, '$1');

  // Pass 1: a lone backslash followed by something that is NOT a valid JSON
  // escape char at all (e.g. \sqrt, \int, \alpha, \,, \(, \{) → double it.
  r = r.replace(/(?<!\\)\\(?![\\"/bfnrtu])/g, '\\\\');

  // Pass 2: a lone backslash + a control-escape letter that is actually the
  // start of a LaTeX command (followed by more letters, e.g. \frac, \times,
  // \neq, \beta) → double it. A genuine lone \n / \t / \uXXXX is left intact.
  r = r.replace(/(?<!\\)\\([bfnrtu])(?=[a-zA-Z])/g, '\\\\$1');

  return r;
}

/**
 * Parse LLM JSON, returning the parsed value or `null` if it is unrecoverable.
 * Callers should treat `null` as "this chunk failed" rather than crashing the
 * whole batch.
 */
export function parseLLMJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  const stripped = stripFences(raw);

  try {
    return JSON.parse(stripped) as T;
  } catch {
    // fall through to repair
  }

  try {
    return JSON.parse(repairJson(stripped)) as T;
  } catch {
    return null;
  }
}
