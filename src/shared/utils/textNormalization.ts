/**
 * Shared lexical and text normalization utilities per docs/CONTRACTS.md.
 * - Lexeme normalizedKey uses Unicode NFC, collapsed internal whitespace, trim, and lower-case fold.
 * - Original spelling is preserved in canonicalForm unless explicitly edited.
 */

export function normalizeLexemeKey(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.,!?;:()"'[\]{}]+|[.,!?;:()"'[\]{}]+$/g, '')
    .trim()
    .toLowerCase();
}

export function cleanCanonicalForm(raw: string): string {
  return raw
    .normalize('NFC')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.,!?;:()"'[\]{}]+|[.,!?;:()"'[\]{}]+$/g, '')
    .trim();
}

export function computeAnchorSignature(
  pageNumber1Based: number,
  startOffset: number,
  endOffset: number,
  selectedText: string
): string {
  const norm = normalizeLexemeKey(selectedText);
  return `p${pageNumber1Based}:${startOffset}-${endOffset}:${norm}`;
}
