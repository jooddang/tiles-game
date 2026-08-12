export const MESSAGE_CANONICALIZER_VERSION = 1 as const;

export type CanonicalMessageResult =
  | { readonly ok: true; readonly value: string; readonly scalars: number;
      readonly graphemes: number; readonly bytes: number }
  | { readonly ok: false; readonly code: "CONTROL" | "SCALARS" | "GRAPHEMES" | "BYTES" };

export function canonicalizePublicMessage(raw: string): CanonicalMessageResult {
  const value = raw.normalize("NFC")
    .replace(/\r\n|[\r\n\u0085\u2028\u2029]/gu, " ")
  const collapsed = collapseAsciiWhitespace(value);
  if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(collapsed)) return { ok: false, code: "CONTROL" };
  const scalars = [...collapsed].length;
  if (scalars > 100) return { ok: false, code: "SCALARS" };
  const graphemes = typeof Intl.Segmenter === "function"
    ? [...new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(collapsed)].length
    : scalars;
  if (graphemes > 100) return { ok: false, code: "GRAPHEMES" };
  const bytes = new TextEncoder().encode(collapsed).byteLength;
  if (bytes > 400) return { ok: false, code: "BYTES" };
  return { ok: true, value: collapsed, scalars, graphemes, bytes };
}

function collapseAsciiWhitespace(value: string) {
  let result = "";
  let pendingSpace = false;
  for (const character of value) {
    const code = character.codePointAt(0) ?? -1;
    if (code === 32 || (code >= 9 && code <= 13)) {
      pendingSpace = result.length > 0;
    } else {
      if (pendingSpace) result += " ";
      result += character;
      pendingSpace = false;
    }
  }
  return result;
}
