import type { NormalizedQuad, TextAnchor } from '../../shared/types/contracts';
import { findAllOccurrencesInText, normalizePdfLigatures } from './pdfTextEngine';

export interface ViewportRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface AnchorResolutionResult {
  resolved: boolean;
  startOffset?: number;
  endOffset?: number;
  matchedText?: string;
  anchorUncertain: boolean;
}

function normalizeRotation(rotation: number): 0 | 90 | 180 | 270 {
  const mod = ((rotation % 360) + 360) % 360;
  if (mod === 90 || mod === 180 || mod === 270) return mod;
  return 0;
}

function clamp01(val: number): number {
  return Math.min(1, Math.max(0, val));
}

export function rectToNormalizedQuad(
  rect: ViewportRect,
  viewportWidth: number,
  viewportHeight: number,
  rotation = 0
): NormalizedQuad {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    throw new Error('Viewport dimensions must be positive');
  }

  const rx = rect.left / viewportWidth;
  const ry = rect.top / viewportHeight;
  const rw = rect.width / viewportWidth;
  const rh = rect.height / viewportHeight;
  const rot = normalizeRotation(rotation);

  let x = rx;
  let y = ry;
  let width = rw;
  let height = rh;

  if (rot === 90) {
    x = ry;
    y = 1 - rx - rw;
    width = rh;
    height = rw;
  } else if (rot === 180) {
    x = 1 - rx - rw;
    y = 1 - ry - rh;
    width = rw;
    height = rh;
  } else if (rot === 270) {
    x = 1 - ry - rh;
    y = rx;
    width = rh;
    height = rw;
  }

  return {
    x: clamp01(x),
    y: clamp01(y),
    width: clamp01(width),
    height: clamp01(height),
  };
}

export function normalizedQuadToViewportRect(
  quad: NormalizedQuad,
  viewportWidth: number,
  viewportHeight: number,
  rotation = 0
): ViewportRect {
  if (viewportWidth <= 0 || viewportHeight <= 0) {
    throw new Error('Viewport dimensions must be positive');
  }

  const rot = normalizeRotation(rotation);
  let rx = quad.x;
  let ry = quad.y;
  let rw = quad.width;
  let rh = quad.height;

  if (rot === 90) {
    rx = 1 - quad.y - quad.height;
    ry = quad.x;
    rw = quad.height;
    rh = quad.width;
  } else if (rot === 180) {
    rx = 1 - quad.x - quad.width;
    ry = 1 - quad.y - quad.height;
    rw = quad.width;
    rh = quad.height;
  } else if (rot === 270) {
    rx = quad.y;
    ry = 1 - quad.x - quad.width;
    rw = quad.height;
    rh = quad.width;
  }

  return {
    left: rx * viewportWidth,
    top: ry * viewportHeight,
    width: rw * viewportWidth,
    height: rh * viewportHeight,
  };
}

export function createTextAnchor(
  canonicalPageText: string,
  selectedText: string,
  occurrenceIndexOrStartOffset: number | { occurrenceIndex?: number; startOffset?: number },
  pdfFingerprint: string,
  pageRotation = 0
): TextAnchor {
  const canonical = normalizePdfLigatures(canonicalPageText);
  const cleanSelected = normalizePdfLigatures(selectedText).replace(/\s+/g, ' ').trim();
  const allOffsets = findAllOccurrencesInText(canonical, cleanSelected);

  let startOffset = -1;

  if (typeof occurrenceIndexOrStartOffset === 'object' && occurrenceIndexOrStartOffset !== null) {
    if (
      occurrenceIndexOrStartOffset.startOffset !== undefined &&
      occurrenceIndexOrStartOffset.startOffset >= 0
    ) {
      startOffset = occurrenceIndexOrStartOffset.startOffset;
    } else if (occurrenceIndexOrStartOffset.occurrenceIndex !== undefined) {
      const idx = Math.max(0, occurrenceIndexOrStartOffset.occurrenceIndex);
      if (idx < allOffsets.length) {
        startOffset = allOffsets[idx];
      }
    }
  } else if (typeof occurrenceIndexOrStartOffset === 'number') {
    const n = occurrenceIndexOrStartOffset;
    const matchesAtOffset =
      n >= 0 &&
      canonical.slice(n, n + cleanSelected.length).toLowerCase() === cleanSelected.toLowerCase();

    if (matchesAtOffset && (n >= allOffsets.length || allOffsets[n] === n)) {
      startOffset = n;
    } else if (n >= 0 && n < allOffsets.length) {
      startOffset = allOffsets[n];
    } else if (matchesAtOffset) {
      startOffset = n;
    }
  }

  if (startOffset === -1) {
    startOffset = allOffsets.length > 0 ? allOffsets[0] : 0;
  }

  const endOffset = Math.min(canonical.length, startOffset + cleanSelected.length);
  const exact = canonical.slice(startOffset, endOffset) || cleanSelected;
  const prefix = canonical.slice(Math.max(0, startOffset - 32), startOffset);
  const suffix = canonical.slice(endOffset, Math.min(canonical.length, endOffset + 32));

  return {
    algorithmVersion: 1,
    exact,
    prefix,
    suffix,
    startOffset,
    endOffset,
    pdfFingerprint,
    pageRotation: normalizeRotation(pageRotation),
    anchorUncertain: false,
  };
}

export function resolveTextAnchor(
  canonicalPageText: string,
  anchor: TextAnchor,
  currentPdfFingerprint: string
): AnchorResolutionResult {
  if (!anchor.pdfFingerprint || anchor.pdfFingerprint !== currentPdfFingerprint) {
    return {
      resolved: false,
      anchorUncertain: true,
    };
  }

  const canonical = normalizePdfLigatures(canonicalPageText);
  const targetExact = normalizePdfLigatures(anchor.exact);

  if (anchor.startOffset >= 0 && anchor.endOffset <= canonical.length) {
    const directSlice = canonical.slice(anchor.startOffset, anchor.endOffset);
    if (directSlice.toLowerCase() === targetExact.toLowerCase()) {
      const actualPrefix = canonical.slice(
        Math.max(0, anchor.startOffset - anchor.prefix.length),
        anchor.startOffset
      );
      const actualSuffix = canonical.slice(
        anchor.endOffset,
        Math.min(canonical.length, anchor.endOffset + anchor.suffix.length)
      );
      const prefixMatches = !anchor.prefix || actualPrefix === anchor.prefix;
      const suffixMatches = !anchor.suffix || actualSuffix === anchor.suffix;

      return {
        resolved: true,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
        matchedText: directSlice,
        anchorUncertain: !(prefixMatches && suffixMatches),
      };
    }
  }

  if (anchor.prefix || anchor.suffix) {
    const composite = `${anchor.prefix}${targetExact}${anchor.suffix}`;
    const compositeIdx = canonical.indexOf(composite);
    if (compositeIdx !== -1) {
      const startOffset = compositeIdx + anchor.prefix.length;
      const endOffset = startOffset + targetExact.length;
      return {
        resolved: true,
        startOffset,
        endOffset,
        matchedText: canonical.slice(startOffset, endOffset),
        anchorUncertain: true,
      };
    }
  }

  const windowStart = Math.max(0, anchor.startOffset - 120);
  const windowEnd = Math.min(canonical.length, anchor.endOffset + 120);
  const windowSlice = canonical.slice(windowStart, windowEnd);
  const localMatches = findAllOccurrencesInText(windowSlice, targetExact);

  if (localMatches.length > 0) {
    let bestOffset = windowStart + localMatches[0];
    let bestScore = -1;

    for (const localOff of localMatches) {
      const candidateStart = windowStart + localOff;
      const candidateEnd = candidateStart + targetExact.length;
      const candPrefix = canonical.slice(
        Math.max(0, candidateStart - anchor.prefix.length),
        candidateStart
      );
      const candSuffix = canonical.slice(
        candidateEnd,
        Math.min(canonical.length, candidateEnd + anchor.suffix.length)
      );
      let score = 0;
      if (anchor.prefix && candPrefix === anchor.prefix) score += 2;
      if (anchor.suffix && candSuffix === anchor.suffix) score += 2;
      score -= Math.abs(candidateStart - anchor.startOffset) / 120;
      if (score > bestScore) {
        bestScore = score;
        bestOffset = candidateStart;
      }
    }

    return {
      resolved: true,
      startOffset: bestOffset,
      endOffset: bestOffset + targetExact.length,
      matchedText: canonical.slice(bestOffset, bestOffset + targetExact.length),
      anchorUncertain: true,
    };
  }

  return {
    resolved: false,
    anchorUncertain: true,
  };
}
