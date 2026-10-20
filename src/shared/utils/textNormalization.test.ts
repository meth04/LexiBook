import { describe, expect, it } from 'vitest';
import {
  cleanCanonicalForm,
  computeAnchorSignature,
  normalizeLexemeKey,
} from './textNormalization';

describe('Task 01 — Shared contracts & lexical normalization', () => {
  it('normalizes Unicode NFC, trims punctuation, collapses whitespace, and lowercases key', () => {
    expect(normalizeLexemeKey('  "Gain   Traction!" ')).toBe('gain traction');
    expect(normalizeLexemeKey('‘Compound’')).toBe('compound');
    expect(normalizeLexemeKey('Cafe\u0301')).toBe('caf\u00e9');
  });

  it('preserves original capitalization in cleanCanonicalForm while stripping outer punctuation', () => {
    expect(cleanCanonicalForm('  "Gain   Traction," ')).toBe('Gain Traction');
  });

  it('computes deterministic anchor signatures per page and offset span', () => {
    expect(computeAnchorSignature(63, 120, 128, 'Compound')).toBe('p63:120-128:compound');
  });
});
