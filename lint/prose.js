// Prose lint — implements docs/security-model.md section 3.
//
// Applies to every prose field in a layer file: title, why, action,
// verify.expect, verify.manual, suppression reason, and layer name.
//
// The JSON Schema already rejects markup, URLs and invisible characters via a
// coarse pattern. This module is the readable, message-carrying enforcement and
// it also catches what the schema structurally cannot: plain-English
// imperatives addressed at the agent.

/** Agent-directed language. Section 3.1. */
const AGENT_DIRECTED = [
  [/ignore\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|preceding)\s+(?:instructions?|prompts?|rules?|messages?)/i,
    'reads as an instruction to the agent to ignore prior context'],
  [/disregard\s+(?:all\s+|any\s+)?(?:previous|prior|above|earlier|the\s+above)/i,
    'reads as an instruction to the agent to disregard prior context'],
  [/\byou\s+are\s+(?:now\s+)?an?\s+/i,
    'assigns the agent a role'],
  [/\byour\s+(?:new\s+)?(?:instructions?|task\s+is|role\s+is|system\s+prompt)\b/i,
    'addresses the agent\'s instructions directly'],
  [/^\s*(?:system|assistant|user|human)\s*:/im,
    'uses a conversation role marker'],
  [/<\s*\/?\s*(?:system|instructions?|prompt|im_start|im_end)\b/i,
    'uses a prompt-structure tag'],
  [/\[\/?INST\]|<\|[^|]*\|>/,
    'uses a chat template control token'],
  [/#{1,6}\s*(?:system|instruction)/i,
    'uses a heading that reads as a system section'],
  [/\b(?:new|updated|revised)\s+(?:instructions?|directives?)\s*:/i,
    'announces a new instruction block'],
];

/** Markup and encoding. Section 3.2. */
const MARKUP = [
  [/<[a-zA-Z/]/, 'contains an HTML tag'],
  [/<!--/, 'contains an HTML comment'],
  [/`/, 'contains a backtick; prose fields are plain text'],
  [/```|~~~/, 'contains a code fence'],
  [/\][ ]*\(/, 'contains markdown link syntax; put URLs in references'],
  [/\bdata:[a-z]/i, 'contains a data URI'],
  [/base64,/i, 'contains base64 payload markers'],
  [/https?:\/\//i, 'contains a URL; put URLs in references'],
  [/\S{200,}/, 'contains a 200+ character run with no whitespace'],
];

/** Invisible, bidi and formatting characters. Section 3.3. */
const INVISIBLE = new RegExp(
  '[' +
  '\\u00AD' +              // soft hyphen
  '\\u180E' +              // mongolian vowel separator
  '\\u200B-\\u200F' +     // zero width space .. RTL mark
  '\\u2028\\u2029' +      // line / paragraph separator
  '\\u202A-\\u202E' +     // bidi embedding and override
  '\\u2060-\\u2064' +     // word joiner, invisible operators
  '\\u2066-\\u2069' +     // bidi isolates
  '\\uFEFF' +              // zero width no-break space
  ']', 'u');

/**
 * Prose is ASCII-only: Latin letters, digits, space, and an explicit
 * punctuation allowlist. This is a single rule that subsumes homoglyph
 * substitution (Cyrillic and Greek lookalikes are simply not in the set)
 * without needing per-script detection.
 */
const ALLOWED_CHARS = /^[A-Za-z0-9 .,;:'"!?()[\]{}\/\\\-_+=@#%&*|~^$<>\n]*$/;

const SCRIPT_HINTS = [
  [/\p{Script=Cyrillic}/u, 'Cyrillic'],
  [/\p{Script=Greek}/u, 'Greek'],
  [/\p{Script=Arabic}/u, 'Arabic'],
  [/\p{Script=Han}/u, 'Han'],
];

/**
 * @param {string} value
 * @param {string} where  dotted path for the error message
 * @returns {string[]} messages, empty when clean
 */
export function lintProse(value, where) {
  const errors = [];
  if (typeof value !== 'string') return errors;

  for (const [re, why] of AGENT_DIRECTED) {
    const m = value.match(re);
    if (m) errors.push(`${where}: ${why} (matched ${JSON.stringify(m[0].slice(0, 60))})`);
  }
  for (const [re, why] of MARKUP) {
    const m = value.match(re);
    if (m) errors.push(`${where}: ${why} (matched ${JSON.stringify(m[0].slice(0, 60))})`);
  }

  const invisible = value.match(INVISIBLE);
  if (invisible) {
    const cp = invisible[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0');
    errors.push(`${where}: contains invisible or bidi character U+${cp}`);
  }

  if (!ALLOWED_CHARS.test(value)) {
    const scripts = SCRIPT_HINTS.filter(([re]) => re.test(value)).map(([, n]) => n);
    const offending = [...value].find((ch) => !ALLOWED_CHARS.test(ch));
    const cp = offending ? offending.codePointAt(0).toString(16).toUpperCase().padStart(4, '0') : '????';
    // Skip when a more specific rule above already reported this character,
    // so a backtick does not produce both a markup error and a charset error.
    const alreadyReported = offending && errors.some((e) => e.includes(offending));
    const hint = scripts.length
      ? ` (${scripts.join(', ')} script detected; homoglyph substitution is a known attack)`
      : '';
    if (!alreadyReported) {
      errors.push(
        `${where}: contains character outside the ASCII prose allowlist: ` +
        `${JSON.stringify(offending)} U+${cp}${hint}`);
    }
  }

  if (value.trim() !== value) errors.push(`${where}: has leading or trailing whitespace`);
  if (/\s{2,}/.test(value)) errors.push(`${where}: contains a run of repeated whitespace`);

  return errors;
}

export const _internals = { AGENT_DIRECTED, MARKUP, INVISIBLE, ALLOWED_CHARS };
