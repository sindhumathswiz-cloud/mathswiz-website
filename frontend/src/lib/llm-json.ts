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
 * Escape LaTeX-command backslashes that JSON.parse would otherwise consume
 * SILENTLY (without throwing), corrupting the value:
 *   \right -> \r (carriage return) + "ight"   ← the "ight" bug
 *   \theta -> \t (tab) + "heta",  \beta -> \b, \frac -> \f
 * These start with a valid JSON escape char, so the parse succeeds and the
 * repair-on-failure path never runs. We must fix them BEFORE parsing.
 *
 * \r, \b, \f before a letter are never intended control chars in math content,
 * so always double them. \t and \n are ambiguous (real tab/newline vs
 * \times/\neq), so only double them before known LaTeX command names — that way
 * genuine "\n" newlines and "\t" tabs in explanations are preserved.
 */
export function fixLatexCommandEscapes(s: string): string {
  let r = s;
  r = r.replace(/(?<!\\)\\([rbf])(?=[a-zA-Z])/g, '\\\\$1');
  r = r.replace(/(?<!\\)\\t(?=imes|heta|an|au|ext|riangle|op|ilde|herefore|frac|o[^a-zA-Z]|o$)/g, '\\\\t');
  r = r.replace(/(?<!\\)\\n(?=abla|eq|ot|leq|geq|mid|earrow|warrow|u[^a-zA-Z]|u$|i[^a-zA-Z]|i$|e[^a-zA-Z]|e$)/g, '\\\\n');
  return r;
}

/**
 * Parse LLM JSON, returning the parsed value or `null` if it is unrecoverable.
 * Callers should treat `null` as "this chunk failed" rather than crashing the
 * whole batch.
 */
export function parseLLMJson<T = unknown>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  // Always fix silently-corrupting LaTeX escapes first, then parse.
  const stripped = fixLatexCommandEscapes(stripFences(raw));

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
