import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';
import * as pdfjsWorker from 'pdfjs-dist/legacy/build/pdf.worker.mjs';
import type { NormalizedQuad } from '../../shared/types/contracts';

// Register in-process worker handler so pdfjs-dist works in browser, WebView2, and Node/Vitest without external worker URLs
if (typeof globalThis !== 'undefined' && !(globalThis as Record<string, unknown>).pdfjsWorker) {
  (globalThis as Record<string, unknown>).pdfjsWorker = pdfjsWorker;
}

export interface PdfTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
  fontFamily?: 'serif' | 'sans-serif' | 'monospace';
  ascent?: number;
}

export interface PdfItemOffsetRange {
  itemIndex: number;
  startOffset: number;
  endOffset: number;
}

export interface PdfPageExtraction {
  pageNumber1Based: number;
  pageWidth: number;
  pageHeight: number;
  items: PdfTextItem[];
  canonicalText: string;
  isTwoColumn: boolean;
  itemOffsets: PdfItemOffsetRange[];
}

export interface PdfDocumentExtraction {
  title: string;
  pageCount: number;
  isScanOnly: boolean;
  pages: PdfPageExtraction[];
}

export interface SelectionExtractionResult {
  selectedText: string;
  sentenceText: string;
  paragraphText: string;
  startOffset: number;
  endOffset: number;
  occurrenceIndex: number;
  layoutUncertainty: boolean;
  normalizedQuads: NormalizedQuad[];
}

const LIGATURE_MAP: Record<string, string> = {
  '\uFB00': 'ff',
  '\uFB01': 'fi',
  '\uFB02': 'fl',
  '\uFB03': 'ffi',
  '\uFB04': 'ffl',
  '\uFB05': 'st',
  '\uFB06': 'st',
};

export function normalizePdfLigatures(input: string): string {
  return input
    .replace(/[\uFB00-\uFB06]/g, (match) => LIGATURE_MAP[match] ?? match)
    .normalize('NFC');
}

function stripControlChars(input: string): string {
  return Array.from(input)
    .map((c) => {
      const code = c.charCodeAt(0);
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f) ? ' ' : c;
    })
    .join('');
}

function unescapePdfLiteral(raw: string): string {
  if (!raw) return '';
  const bytes: number[] = [];
  let i = 0;
  while (i < raw.length) {
    const ch = raw[i];
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next >= '0' && next <= '7') {
        let oct = next;
        i += 2;
        if (i < raw.length && raw[i] >= '0' && raw[i] <= '7') {
          oct += raw[i++];
          if (i < raw.length && raw[i] >= '0' && raw[i] <= '7') {
            oct += raw[i++];
          }
        }
        bytes.push(parseInt(oct, 8) & 0xff);
        continue;
      }
      i += 2;
      if (next === 'n') bytes.push(10);
      else if (next === 'r') bytes.push(13);
      else if (next === 't') bytes.push(9);
      else bytes.push(next.charCodeAt(0) & 0xff);
      continue;
    }
    bytes.push(raw.charCodeAt(i) & 0xff);
    i++;
  }

  const u8 = Uint8Array.from(bytes);
  let decoded = '';
  if (u8.length >= 2 && u8[0] === 0xfe && u8[1] === 0xff) {
    decoded = new TextDecoder('utf-16be').decode(u8.subarray(2));
  } else if (u8.length >= 2 && u8[0] === 0xff && u8[1] === 0xfe) {
    decoded = new TextDecoder('utf-16le').decode(u8.subarray(2));
  } else if (u8.length >= 4 && u8[0] === 0x00 && u8[1] !== 0x00 && u8[2] === 0x00) {
    decoded = new TextDecoder('utf-16be').decode(u8);
  } else {
    try {
      decoded = new TextDecoder('utf-8', { fatal: true }).decode(u8);
    } catch {
      decoded = new TextDecoder('latin1').decode(u8);
    }
  }

  return stripControlChars(decoded)
    .replace(/\s*,,\s*/g, ' \u2014 ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Deterministic fallback parser for PDF 1.4 uncompressed streams (used when WebWorker/canvas
 * is unavailable in headless jsdom or as fast local stream fallback).
 */
export function parseSyntheticPdfStreams(bytes: Uint8Array): PdfDocumentExtraction {
  const text = new TextDecoder('latin1').decode(bytes);
  if (!text.startsWith('%PDF-') || !text.includes('%%EOF')) {
    throw new Error('INVALID_PDF_HEADER');
  }
  if (text.includes('/Encrypt')) {
    throw new Error('PDF_ENCRYPTED');
  }

  const titleMatch = text.match(/\/Title\s*\(([^)]*)\)/);
  const title = titleMatch ? unescapePdfLiteral(titleMatch[1]) : 'Untitled Document';

  const pageMatches = [...text.matchAll(/\/Type\s*\/Page\b(?!s)[\s\S]*?\/Contents\s+(\d+)\s+0\s+R/g)];
  if (pageMatches.length === 0 && !text.includes('/Type /Catalog')) {
    throw new Error('INVALID_PDF_HEADER');
  }

  const objStreams = new Map<number, string>();
  const objRegex = /(\d+)\s+0\s+obj\s*<<[^>]*>>\s*stream\r?\n([\s\S]*?)endstream/g;
  let match: RegExpExecArray | null;
  while ((match = objRegex.exec(text)) !== null) {
    objStreams.set(Number(match[1]), match[2]);
  }

  const pages: PdfPageExtraction[] = [];
  let totalTextItems = 0;

  pageMatches.forEach((pageMatch, idx) => {
    const contentObjId = Number(pageMatch[1]);
    const streamContent = objStreams.get(contentObjId) ?? '';
    const pageWidth = 612;
    const pageHeight = 792;

    const rawItems: PdfTextItem[] = [];
    const btBlocks = [...streamContent.matchAll(/BT([\s\S]*?)ET/g)];
    for (const block of btBlocks) {
      const body = block[1];
      const tfMatch = body.match(/\/F\d+\s+([\d.]+)\s+Tf/);
      const tmMatch = body.match(/1\s+0\s+0\s+1\s+([\d.-]+)\s+([\d.-]+)\s+Tm/);
      const tjMatch = body.match(/\(([\s\S]*?)\)\s*Tj/);
      if (tjMatch) {
        const fontSize = tfMatch ? Number(tfMatch[1]) : 12;
        const x = tmMatch ? Number(tmMatch[1]) : 72;
        const y = tmMatch ? Number(tmMatch[2]) : 700;
        const str = normalizePdfLigatures(unescapePdfLiteral(tjMatch[1]));
        if (str.trim().length > 0) {
          const estimatedWidth = Math.max(fontSize * 0.52 * str.length, 8);
          rawItems.push({
            str,
            x,
            y,
            width: Math.min(estimatedWidth, pageWidth - x - 16),
            height: fontSize * 1.2,
            pageWidth,
            pageHeight,
          });
        }
      }
    }

    totalTextItems += rawItems.length;
    pages.push(buildPageExtraction(idx + 1, pageWidth, pageHeight, rawItems));
  });

  return {
    title,
    pageCount: pages.length,
    isScanOnly: pages.length > 0 && totalTextItems === 0,
    pages,
  };
}

/**
 * Detects whether a page's text items form a two-column layout and orders items in logical
 * reading order (full-width top headers first, then left column top-to-bottom, then right column top-to-bottom).
 */
export function sortAndAnalyzePageItems(
  rawItems: PdfTextItem[],
  pageWidth: number
): { sortedItems: PdfTextItem[]; isTwoColumn: boolean } {
  if (rawItems.length === 0) {
    return { sortedItems: [], isTwoColumn: false };
  }

  const normalizedItems = rawItems
    .map((item) => ({
      ...item,
      str: normalizePdfLigatures(item.str),
    }))
    .filter((item) => item.str.trim().length > 0);

  const midX = pageWidth * 0.48;
  const leftCandidates = normalizedItems.filter(
    (item) => item.x < midX && item.x + item.width < pageWidth * 0.56
  );
  const rightCandidates = normalizedItems.filter((item) => item.x >= midX);

  let isTwoColumn = false;
  if (leftCandidates.length >= 2 && rightCandidates.length >= 2) {
    const rightYMin = Math.min(...rightCandidates.map((i) => i.y));
    const rightYMax = Math.max(...rightCandidates.map((i) => i.y));
    const overlappingLeft = leftCandidates.filter(
      (i) => i.y >= rightYMin - 24 && i.y <= rightYMax + 24
    );
    if (overlappingLeft.length >= 2) {
      isTwoColumn = true;
    }
  }

  if (!isTwoColumn) {
    const sorted = [...normalizedItems].sort((a, b) => {
      if (Math.abs(b.y - a.y) > 4) {
        return b.y - a.y;
      }
      return a.x - b.x;
    });
    return { sortedItems: sorted, isTwoColumn: false };
  }

  const rightMaxY = Math.max(...rightCandidates.map((i) => i.y));
  const topHeaders: PdfTextItem[] = [];
  const leftCol: PdfTextItem[] = [];
  const rightCol: PdfTextItem[] = [];
  const bottomFooters: PdfTextItem[] = [];
  const rightMinY = Math.min(...rightCandidates.map((i) => i.y));

  for (const item of normalizedItems) {
    if (item.x < midX && item.y > rightMaxY + 14) {
      topHeaders.push(item);
    } else if (item.x < midX && item.y < rightMinY - 30 && item.width > pageWidth * 0.55) {
      bottomFooters.push(item);
    } else if (item.x < midX) {
      leftCol.push(item);
    } else {
      rightCol.push(item);
    }
  }

  const sortByYDescXAsc = (a: PdfTextItem, b: PdfTextItem) => {
    if (Math.abs(b.y - a.y) > 4) return b.y - a.y;
    return a.x - b.x;
  };

  topHeaders.sort(sortByYDescXAsc);
  leftCol.sort(sortByYDescXAsc);
  rightCol.sort(sortByYDescXAsc);
  bottomFooters.sort(sortByYDescXAsc);

  return {
    sortedItems: [...topHeaders, ...leftCol, ...rightCol, ...bottomFooters],
    isTwoColumn: true,
  };
}

export function buildPageExtraction(
  pageNumber1Based: number,
  pageWidth: number,
  pageHeight: number,
  rawItems: PdfTextItem[]
): PdfPageExtraction {
  const { sortedItems, isTwoColumn } = sortAndAnalyzePageItems(rawItems, pageWidth);
  const itemOffsets: PdfItemOffsetRange[] = [];
  const parts: string[] = [];
  let cursor = 0;

  sortedItems.forEach((item, index) => {
    const clean = item.str.replace(/\s+/g, ' ').trim();
    if (!clean) return;
    if (parts.length > 0) {
      const prev = parts[parts.length - 1];
      const noSpaceBefore = /^[,.;:!?)”’\]}]/.test(clean);
      const noSpaceAfter = /[“‘([{]$/.test(prev);
      if (!noSpaceBefore && !noSpaceAfter) {
        parts.push(' ');
        cursor += 1;
      }
    }
    const startOffset = cursor;
    parts.push(clean);
    cursor += clean.length;
    itemOffsets.push({
      itemIndex: index,
      startOffset,
      endOffset: cursor,
    });
  });

  return {
    pageNumber1Based,
    pageWidth,
    pageHeight,
    items: sortedItems,
    canonicalText: parts.join(''),
    isTwoColumn,
    itemOffsets,
  };
}

/**
 * Extracts PDF document pages and text layer using `pdfjs-dist` when available, with deterministic
 * fallback for synthetic PDF 1.4 buffers in jsdom environments.
 */
function base64ToUint8Array(b64: string): Uint8Array {
  const bin = atob(b64);
  const len = bin.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function mergeInlineRunsOnSameLine(
  rawRuns: PdfTextItem[],
  pageWidth: number,
  pageHeight: number
): PdfTextItem[] {
  const nonEmpty = rawRuns.filter((r) => r.str.trim().length > 0);
  if (nonEmpty.length === 0) return [];

  const sorted = [...nonEmpty].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 3.5) return b.y - a.y;
    return a.x - b.x;
  });

  const merged: PdfTextItem[] = [];
  for (const run of sorted) {
    const last = merged[merged.length - 1];
    const gap = last ? run.x - (last.x + last.width) : Infinity;
    const sameBaseline = Boolean(last && Math.abs(last.y - run.y) <= 2.5);
    const sameHeight = Boolean(last && Math.abs(last.height - run.height) <= 0.8);
    const sameFontFamily = Boolean(
      last && (last.fontFamily ?? 'serif') === (run.fontFamily ?? 'serif')
    );

    if (
      last &&
      sameBaseline &&
      sameHeight &&
      sameFontFamily &&
      run.x >= last.x - 2 &&
      gap <= Math.max(2.2, last.height * 0.25)
    ) {
      const needsSpace =
        gap > 1.2 &&
        !/[\s\-–—(“"‘']$/.test(last.str) &&
        !/^[\s.,!?;:)"\]”’]/.test(run.str);
      last.str = last.str + (needsSpace ? ' ' : '') + run.str;
      last.width = Math.max(last.width, run.x + run.width - last.x);
      last.height = Math.max(last.height, run.height);
    } else {
      merged.push({ ...run, pageWidth, pageHeight });
    }
  }

  return merged
    .map((m) => ({
      ...m,
      str: normalizePdfLigatures(m.str).replace(/\s+/g, ' ').trim(),
    }))
    .filter((m) => m.str.length > 0);
}

let sharedMeasureCanvasCtx: CanvasRenderingContext2D | null = null;

/**
 * Computes the horizontal CSS `scaleX` factor needed so that a DOM text span
 * rendered with `fontFamily` at `fontSizePx` matches the exact PDF canvas width `targetWidthPx`.
 */
export function measureDomTextScaleX(
  text: string,
  fontSizePx: number,
  fontFamily: 'serif' | 'sans-serif' | 'monospace' | undefined,
  targetWidthPx: number
): number {
  if (!text || text.length <= 1 || targetWidthPx <= 0 || fontSizePx <= 0) {
    return 1;
  }
  try {
    if (
      typeof document === 'undefined' ||
      (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || ''))
    ) {
      return 1;
    }
    if (!sharedMeasureCanvasCtx) {
      const canvas = document.createElement('canvas');
      sharedMeasureCanvasCtx = canvas.getContext('2d');
    }
    if (!sharedMeasureCanvasCtx) return 1;

    const cssFontStack =
      fontFamily === 'sans-serif'
        ? '"Segoe UI", Arial, sans-serif'
        : fontFamily === 'monospace'
          ? 'Consolas, "Courier New", monospace'
          : '"Times New Roman", Georgia, serif';

    sharedMeasureCanvasCtx.font = `${fontSizePx.toFixed(2)}px ${cssFontStack}`;
    const measuredWidth = sharedMeasureCanvasCtx.measureText(text).width;
    if (measuredWidth <= 0) return 1;

    const ratio = targetWidthPx / measuredWidth;
    return Number(Math.min(1.65, Math.max(0.65, ratio)).toFixed(5));
  } catch {
    return 1;
  }
}

const extractionCache = new Map<string, PdfDocumentExtraction>();
const singlePageCache = new Map<string, PdfPageExtraction>();
const pdfProxyCache = new Map<string, pdfjsLib.PDFDocumentProxy>();
const activeCanvasRenderTasks = new WeakMap<HTMLCanvasElement, { cancel: () => void }>();

function computeBufferCacheKey(bytes: Uint8Array): string {
  const head = Array.from(bytes.subarray(0, 32)).join(',');
  const tail = Array.from(bytes.subarray(Math.max(0, bytes.byteLength - 32))).join(',');
  return `${bytes.byteLength}:${head}:${tail}`;
}

async function getOrOpenPdfProxy(bytes: Uint8Array): Promise<pdfjsLib.PDFDocumentProxy> {
  const key = computeBufferCacheKey(bytes);
  const existing = pdfProxyCache.get(key);
  if (existing) return existing;

  const loadingTask = pdfjsLib.getDocument({
    data: bytes.slice(),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  pdfProxyCache.set(key, doc);
  return doc;
}

async function extractOnePageFromProxy(
  doc: pdfjsLib.PDFDocumentProxy,
  cacheKey: string,
  pageNum: number
): Promise<PdfPageExtraction> {
  const pageKey = `${cacheKey}:p${pageNum}`;
  const cachedPage = singlePageCache.get(pageKey);
  if (cachedPage) return cachedPage;

  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale: 1.0 });
  const pageWidth = viewport.width || 612;
  const pageHeight = viewport.height || 792;
  const textContent = await page.getTextContent();
  const styles = (textContent.styles ?? {}) as Record<
    string,
    { fontFamily?: string; ascent?: number | null }
  >;

  const rawRuns: PdfTextItem[] = [];
  for (const rawItem of textContent.items) {
    if ('str' in rawItem && typeof rawItem.str === 'string') {
      const transform = Array.isArray(rawItem.transform)
        ? rawItem.transform
        : [12, 0, 0, 12, 72, 700];
      const x = Number(transform[4] ?? 72);
      const y = Number(transform[5] ?? 700);
      const fontSize = Math.abs(Number(transform[3] ?? 12)) || 12;
      const width =
        Number(rawItem.width) > 0
          ? Number(rawItem.width)
          : Math.max(fontSize * 0.5 * rawItem.str.length, 4);
      const height = Number(rawItem.height) > 0 ? Number(rawItem.height) : fontSize;
      const rawStyle =
        typeof rawItem.fontName === 'string' ? styles[rawItem.fontName] : undefined;
      const fontFamily: 'serif' | 'sans-serif' | 'monospace' =
        rawStyle?.fontFamily === 'sans-serif' || rawStyle?.fontFamily === 'monospace'
          ? rawStyle.fontFamily
          : 'serif';
      const ascent =
        typeof rawStyle?.ascent === 'number' && rawStyle.ascent > 0.5 && rawStyle.ascent <= 1.05
          ? rawStyle.ascent
          : 0.89;

      rawRuns.push({
        str: rawItem.str,
        x,
        y,
        width,
        height,
        pageWidth,
        pageHeight,
        fontFamily,
        ascent,
      });
    }
  }

  const mergedLineItems = mergeInlineRunsOnSameLine(rawRuns, pageWidth, pageHeight);
  const built = buildPageExtraction(pageNum, pageWidth, pageHeight, mergedLineItems);
  singlePageCache.set(pageKey, built);
  return built;
}

/**
 * Extracts ONLY a single requested page on-demand (in ~10-20ms) without scanning the entire PDF file.
 */
export async function extractSinglePdfPage(
  input: Uint8Array | ArrayBuffer | string,
  pageNumber1Based: number
): Promise<{
  title: string;
  pageCount: number;
  isScanOnly: boolean;
  page: PdfPageExtraction;
}> {
  const bytes =
    typeof input === 'string'
      ? base64ToUint8Array(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  const cacheKey = computeBufferCacheKey(bytes);
  const rawLatin1 = new TextDecoder('latin1').decode(bytes);
  if (!rawLatin1.startsWith('%PDF-') || !rawLatin1.includes('%%EOF')) {
    throw new Error('INVALID_PDF_HEADER');
  }
  if (/\/Encrypt\b/.test(rawLatin1)) {
    throw new Error('PDF_ENCRYPTED');
  }

  const hasFlateStream = /\/FlateDecode\b/.test(rawLatin1);
  if (!hasFlateStream) {
    const synthetic = parseSyntheticPdfStreams(bytes);
    if (!synthetic.isScanOnly || !/\/Font\b/.test(rawLatin1) || synthetic.pageCount <= 3) {
      const clamped = Math.max(1, Math.min(synthetic.pageCount || 1, pageNumber1Based));
      const page =
        synthetic.pages.find((p) => p.pageNumber1Based === clamped) ??
        synthetic.pages[0] ??
        buildPageExtraction(clamped, 612, 792, []);
      return {
        title: synthetic.title,
        pageCount: synthetic.pageCount,
        isScanOnly: synthetic.isScanOnly,
        page,
      };
    }
  }

  const doc = await getOrOpenPdfProxy(bytes);
  const clampedPage = Math.max(1, Math.min(doc.numPages, pageNumber1Based));
  const page = await extractOnePageFromProxy(doc, cacheKey, clampedPage);

  // Determine isScanOnly by checking at most pages 1..3 if current page is an image/cover page
  let isScanOnly = false;
  if (page.items.length === 0) {
    let foundText = false;
    const probeLimit = Math.min(doc.numPages, 3);
    for (let p = 1; p <= probeLimit; p++) {
      const probed = await extractOnePageFromProxy(doc, cacheKey, p);
      if (probed.items.length > 0) {
        foundText = true;
        break;
      }
    }
    isScanOnly = !foundText && doc.numPages <= 3;
  }

  const titleMatch = rawLatin1.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/);
  const fallbackTitle = titleMatch ? unescapePdfLiteral(titleMatch[1]) : 'Untitled Document';

  return {
    title: fallbackTitle,
    pageCount: doc.numPages,
    isScanOnly,
    page,
  };
}

/**
 * Renders a PDF page onto an HTMLCanvasElement using `pdfjs-dist` at high DPI,
 * preserving 100% of the original PDF visual layout, fonts, images, and formatting.
 */
export async function renderPdfPageToCanvas(
  input: Uint8Array | ArrayBuffer | string,
  pageNumber1Based: number,
  canvas: HTMLCanvasElement,
  scale = 1.0,
  rotation = 0
): Promise<boolean> {
  try {
    if (typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent || '')) {
      return false;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;

    const prevTask = activeCanvasRenderTasks.get(canvas);
    if (prevTask) {
      try {
        prevTask.cancel();
      } catch {
        // ignore cancel error
      }
      activeCanvasRenderTasks.delete(canvas);
    }

    const bytes =
      typeof input === 'string'
        ? base64ToUint8Array(input)
        : input instanceof Uint8Array
          ? input
          : new Uint8Array(input);

    const doc = await getOrOpenPdfProxy(bytes);
    const clampedPage = Math.max(1, Math.min(doc.numPages, pageNumber1Based));
    const page = await doc.getPage(clampedPage);

    const dpr =
      typeof window !== 'undefined' && window.devicePixelRatio
        ? Math.min(Math.max(window.devicePixelRatio, 1), 2.5)
        : 1;
    const cssViewport = page.getViewport({ scale, rotation });
    const renderViewport = page.getViewport({ scale: scale * dpr, rotation });

    canvas.width = Math.ceil(renderViewport.width);
    canvas.height = Math.ceil(renderViewport.height);
    canvas.style.width = `${Math.ceil(cssViewport.width)}px`;
    canvas.style.height = `${Math.ceil(cssViewport.height)}px`;

    const renderTask = page.render({
      canvasContext: ctx,
      viewport: renderViewport,
    });
    activeCanvasRenderTasks.set(canvas, renderTask);
    await renderTask.promise;
    activeCanvasRenderTasks.delete(canvas);
    return true;
  } catch {
    return false;
  }
}

/**
 * Extracts PDF document pages and text layer using `pdfjs-dist` for real compressed PDFs
 * and fast deterministic stream parsing for uncompressed synthetic PDF 1.4 buffers.
 */
export async function extractPdfDocument(
  input: Uint8Array | ArrayBuffer | string
): Promise<PdfDocumentExtraction> {
  const bytes =
    typeof input === 'string'
      ? base64ToUint8Array(input)
      : input instanceof Uint8Array
        ? input
        : new Uint8Array(input);

  const cacheKey = computeBufferCacheKey(bytes);
  const cached = extractionCache.get(cacheKey);
  if (cached) return cached;

  const rawLatin1 = new TextDecoder('latin1').decode(bytes);
  if (!rawLatin1.startsWith('%PDF-') || !rawLatin1.includes('%%EOF')) {
    throw new Error('INVALID_PDF_HEADER');
  }
  if (/\/Encrypt\b/.test(rawLatin1)) {
    throw new Error('PDF_ENCRYPTED');
  }

  const hasFlateStream = /\/FlateDecode\b/.test(rawLatin1);
  if (!hasFlateStream) {
    const synthetic = parseSyntheticPdfStreams(bytes);
    if (!synthetic.isScanOnly || !/\/Font\b/.test(rawLatin1) || synthetic.pageCount <= 3) {
      extractionCache.set(cacheKey, synthetic);
      return synthetic;
    }
  }

  // Real-world PDF (e.g. Limitless.pdf with FlateDecode streams, UTF-16 metadata, multi-run lines)
  try {
    const doc = await getOrOpenPdfProxy(bytes);
    const meta = await doc.getMetadata().catch(() => null);
    const rawInfoTitle =
      meta?.info && typeof (meta.info as Record<string, unknown>).Title === 'string'
        ? String((meta.info as Record<string, unknown>).Title)
        : '';

    const titleMatch = rawLatin1.match(/\/Title\s*\(((?:\\.|[^\\)])*)\)/);
    const fallbackTitle = titleMatch ? unescapePdfLiteral(titleMatch[1]) : 'Untitled Document';
    const cleanTitle =
      stripControlChars(rawInfoTitle)
        .replace(/\s*,,\s*/g, ' \u2014 ')
        .replace(/\s+/g, ' ')
        .trim() || fallbackTitle;

    const pages: PdfPageExtraction[] = [];
    let totalTextItems = 0;

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale: 1.0 });
      const pageWidth = viewport.width || 612;
      const pageHeight = viewport.height || 792;
      const textContent = await page.getTextContent();

      const rawRuns: PdfTextItem[] = [];
      for (const rawItem of textContent.items) {
        if ('str' in rawItem && typeof rawItem.str === 'string') {
          const transform = Array.isArray(rawItem.transform) ? rawItem.transform : [12, 0, 0, 12, 72, 700];
          const x = Number(transform[4] ?? 72);
          const y = Number(transform[5] ?? 700);
          const fontSize = Math.abs(Number(transform[3] ?? 12)) || 12;
          const width = Number(rawItem.width) > 0 ? Number(rawItem.width) : Math.max(fontSize * 0.5 * rawItem.str.length, 4);
          const height = Number(rawItem.height) > 0 ? Number(rawItem.height) : fontSize * 1.15;

          rawRuns.push({
            str: rawItem.str,
            x,
            y,
            width,
            height,
            pageWidth,
            pageHeight,
          });
        }
      }

      const mergedLineItems = mergeInlineRunsOnSameLine(rawRuns, pageWidth, pageHeight);
      totalTextItems += mergedLineItems.length;
      pages.push(buildPageExtraction(pageNum, pageWidth, pageHeight, mergedLineItems));
    }

    const result: PdfDocumentExtraction = {
      title: cleanTitle,
      pageCount: doc.numPages,
      isScanOnly: doc.numPages > 0 && totalTextItems === 0,
      pages,
    };
    extractionCache.set(cacheKey, result);
    return result;
  } catch {
    const fallback = parseSyntheticPdfStreams(bytes);
    extractionCache.set(cacheKey, fallback);
    return fallback;
  }
}

export function findAllOccurrencesInText(haystack: string, needle: string): number[] {
  const cleanNeedle = normalizePdfLigatures(needle).replace(/\s+/g, ' ').trim();
  if (!cleanNeedle) return [];
  const lowerHaystack = haystack.toLowerCase();
  const lowerNeedle = cleanNeedle.toLowerCase();
  const offsets: number[] = [];
  let idx = 0;
  while (idx <= lowerHaystack.length - lowerNeedle.length) {
    const found = lowerHaystack.indexOf(lowerNeedle, idx);
    if (found === -1) break;
    offsets.push(found);
    idx = found + 1;
  }
  return offsets;
}

export function snapSelectionOffsetsToWords(
  canonical: string,
  rawStart: number,
  rawEnd: number
): { startOffset: number; endOffset: number; text: string } {
  let start = Math.max(0, Math.min(canonical.length, Math.min(rawStart, rawEnd)));
  let end = Math.max(0, Math.min(canonical.length, Math.max(rawStart, rawEnd)));

  const isWordChar = (ch: string | undefined) => Boolean(ch && /[A-Za-z0-9]/.test(ch));

  while (start < end && !isWordChar(canonical[start])) start++;
  while (end > start && !isWordChar(canonical[end - 1])) end--;

  if (start >= end) {
    const fallbackStart = Math.max(0, Math.min(canonical.length, Math.min(rawStart, rawEnd)));
    const fallbackEnd = Math.max(0, Math.min(canonical.length, Math.max(rawStart, rawEnd)));
    return {
      startOffset: fallbackStart,
      endOffset: fallbackEnd,
      text: canonical.slice(fallbackStart, fallbackEnd).trim(),
    };
  }

  // Left boundary check: if start lands inside a word
  let leadShift = 0;
  if (start > 0 && isWordChar(canonical[start - 1]) && isWordChar(canonical[start])) {
    let firstWordStart = start;
    while (firstWordStart > 0 && isWordChar(canonical[firstWordStart - 1])) {
      firstWordStart--;
    }
    let firstWordEnd = start;
    while (firstWordEnd < canonical.length && isWordChar(canonical[firstWordEnd])) {
      firstWordEnd++;
    }
    const firstWordLen = firstWordEnd - firstWordStart;
    const selectedInFirst = Math.min(end, firstWordEnd) - start;

    if (end <= firstWordEnd || selectedInFirst >= Math.ceil(firstWordLen * 0.35)) {
      leadShift = start - firstWordStart;
      start = firstWordStart;
    } else {
      start = firstWordEnd;
      while (start < end && !isWordChar(canonical[start])) start++;
    }
  }

  // Right boundary check: if end lands inside a word
  if (end < canonical.length && isWordChar(canonical[end - 1]) && isWordChar(canonical[end])) {
    let lastWordStart = end;
    while (lastWordStart > 0 && isWordChar(canonical[lastWordStart - 1])) {
      lastWordStart--;
    }
    let lastWordEnd = end;
    while (lastWordEnd < canonical.length && isWordChar(canonical[lastWordEnd])) {
      lastWordEnd++;
    }
    const lastWordLen = lastWordEnd - lastWordStart;
    const selectedInLast = end - Math.max(start, lastWordStart);

    if (start >= lastWordStart || selectedInLast >= Math.ceil(lastWordLen * 0.45)) {
      end = lastWordEnd;
    } else {
      end = lastWordStart;
      while (end > start && !isWordChar(canonical[end - 1])) end--;
    }
  }

  // If the left edge was shifted right by `leadShift` chars (e.g. "azing" instead of "amazing")
  // and the right edge correspondingly spilled across punctuation into a short trailing word (e.g. ", no"),
  // trim the spilled trailing word back to the punctuation boundary.
  if (leadShift > 0 && end > start) {
    const currentSlice = canonical.slice(start, end);
    const trailingSpillMatch = currentSlice.match(/([,.;:!?—–-]+\s+[A-Za-z]{1,3})$/);
    if (trailingSpillMatch) {
      const spilledSuffix = trailingSpillMatch[1];
      const spilledWordMatch = spilledSuffix.match(/[A-Za-z]+$/);
      if (spilledWordMatch && spilledWordMatch[0].length <= leadShift + 1) {
        end -= spilledSuffix.length;
        while (end > start && !isWordChar(canonical[end - 1])) end--;
      }
    }
  }

  return {
    startOffset: start,
    endOffset: end,
    text: canonical.slice(start, end).trim(),
  };
}

/**
 * Given a selection on a page, extracts the exact selected text, authentic sentence,
 * bounded paragraph (<= 500 chars), normalized quads in top-left [0..1] page space,
 * and layoutUncertainty flag.
 */
export function extractSelectionContext(
  page: PdfPageExtraction,
  rawSelectedText: string,
  options?: {
    occurrenceIndex?: number;
    startOffset?: number;
    endOffset?: number;
    snapToWords?: boolean;
    targetQuad?: NormalizedQuad;
  }
): SelectionExtractionResult {
  const canonical = page.canonicalText;

  if (
    options?.snapToWords &&
    options.startOffset !== undefined &&
    options.endOffset !== undefined &&
    options.endOffset > options.startOffset
  ) {
    const snapped = snapSelectionOffsetsToWords(canonical, options.startOffset, options.endOffset);
    if (snapped.text.length > 0) {
      rawSelectedText = snapped.text;
      options = {
        ...options,
        startOffset: snapped.startOffset,
        endOffset: snapped.endOffset,
      };
    }
  }

  const selectedText = normalizePdfLigatures(rawSelectedText).replace(/\s+/g, ' ').trim();
  if (!selectedText) {
    throw new Error('Selection text cannot be empty');
  }

  const allOffsets = findAllOccurrencesInText(canonical, selectedText);

  let startOffset = -1;
  let occurrenceIndex = 0;

  if (options?.startOffset !== undefined && options.startOffset >= 0) {
    const slice = canonical.slice(options.startOffset, options.startOffset + selectedText.length);
    if (slice.toLowerCase() === selectedText.toLowerCase()) {
      startOffset = options.startOffset;
      const matchedIdx = allOffsets.indexOf(startOffset);
      occurrenceIndex = matchedIdx >= 0 ? matchedIdx : 0;
    } else if (allOffsets.length > 0) {
      // Pick the occurrence closest to options.startOffset
      let bestIdx = 0;
      let bestDist = Infinity;
      allOffsets.forEach((off, idx) => {
        const dist = Math.abs(off - options!.startOffset!);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      occurrenceIndex = bestIdx;
      startOffset = allOffsets[bestIdx];
    }
  }

  if (startOffset === -1) {
    if (options?.occurrenceIndex !== undefined) {
      const desiredIdx = options.occurrenceIndex;
      if (allOffsets.length > 0) {
        occurrenceIndex = Math.min(Math.max(0, desiredIdx), allOffsets.length - 1);
        startOffset = allOffsets[occurrenceIndex];
      } else {
        startOffset = 0;
      }
    } else if (options?.targetQuad && allOffsets.length > 1) {
      let bestIdx = 0;
      let bestDist = Infinity;
      allOffsets.forEach((off, idx) => {
        const range = page.itemOffsets.find((r) => r.endOffset > off && r.startOffset <= off);
        if (!range) return;
        const item = page.items[range.itemIndex];
        const itemLen = Math.max(1, range.endOffset - range.startOffset);
        const ratioStart = Math.max(0, off - range.startOffset) / itemLen;
        const xNorm = (item.x + item.width * ratioStart) / page.pageWidth;
        const topY = Math.max(0, page.pageHeight - item.y - item.height * (item.ascent ?? 0.89));
        const yNorm = topY / page.pageHeight;
        const dist = Math.hypot(xNorm - options!.targetQuad!.x, (yNorm - options!.targetQuad!.y) * 2.5);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = idx;
        }
      });
      occurrenceIndex = bestIdx;
      startOffset = allOffsets[bestIdx];
    } else if (allOffsets.length > 0) {
      occurrenceIndex = 0;
      startOffset = allOffsets[0];
    } else {
      startOffset = 0;
    }
  }

  let endOffset = Math.min(startOffset + selectedText.length, canonical.length);
  if (options?.snapToWords && startOffset >= 0 && endOffset > startOffset) {
    const snapped = snapSelectionOffsetsToWords(canonical, startOffset, endOffset);
    if (snapped.text.length > 0) {
      startOffset = snapped.startOffset;
      endOffset = snapped.endOffset;
      const updatedOffsets = findAllOccurrencesInText(canonical, snapped.text);
      const matchedIdx = updatedOffsets.indexOf(startOffset);
      occurrenceIndex = matchedIdx >= 0 ? matchedIdx : 0;
    }
  }

  const sliced = canonical.slice(startOffset, endOffset);
  const exactText = sliced.trim().length > 0 ? sliced : selectedText;

  let sentenceStart = startOffset;
  while (sentenceStart > 0) {
    const ch = canonical[sentenceStart - 1];
    if (ch === '.' || ch === '!' || ch === '?') {
      break;
    }
    if (
      canonical[sentenceStart] === '“' &&
      !canonical.slice(sentenceStart, startOffset).includes('”')
    ) {
      break;
    }
    sentenceStart--;
  }
  while (sentenceStart < startOffset && /^[\s”"’')\]}]/.test(canonical[sentenceStart])) {
    sentenceStart++;
  }

  let sentenceEnd = endOffset;
  while (sentenceEnd < canonical.length) {
    const ch = canonical[sentenceEnd];
    sentenceEnd++;
    if (ch === '.' || ch === '!' || ch === '?') {
      if (sentenceEnd < canonical.length && /^[”"’')]/.test(canonical[sentenceEnd])) {
        sentenceEnd++;
      }
      break;
    }
  }

  const sentenceText = canonical.slice(sentenceStart, sentenceEnd).trim() || exactText;

  let paragraphText = canonical.trim();
  if (paragraphText.length > 500) {
    const halfWindow = Math.floor((500 - sentenceText.length) / 2);
    const paraStart = Math.max(0, sentenceStart - Math.max(80, halfWindow));
    const paraEnd = Math.min(canonical.length, paraStart + 500);
    paragraphText = canonical.slice(paraStart, paraEnd).trim();
  }

  const overlappingRanges = page.itemOffsets.filter(
    (range) => range.endOffset > startOffset && range.startOffset < endOffset
  );

  const normalizedQuads: NormalizedQuad[] = overlappingRanges.map((range) => {
    const item = page.items[range.itemIndex];
    const itemLen = Math.max(1, range.endOffset - range.startOffset);
    const localStart = Math.max(0, startOffset - range.startOffset);
    const localEnd = Math.min(itemLen, endOffset - range.startOffset);
    const ratioStart = localStart / itemLen;
    const ratioWidth = Math.max(0.05, (localEnd - localStart) / itemLen);

    const itemXNorm = item.x / page.pageWidth;
    const itemWidthNorm = item.width / page.pageWidth;
    const topY = Math.max(0, page.pageHeight - item.y - item.height * 0.85);
    const yNorm = topY / page.pageHeight;
    const heightNorm = Math.min(1 - yNorm, (item.height * 1.15) / page.pageHeight);

    return {
      x: Number(Math.min(1, Math.max(0, itemXNorm + itemWidthNorm * ratioStart)).toFixed(6)),
      y: Number(Math.min(1, Math.max(0, yNorm)).toFixed(6)),
      width: Number(Math.min(1, Math.max(0.01, itemWidthNorm * ratioWidth)).toFixed(6)),
      height: Number(Math.min(1, Math.max(0.01, heightNorm)).toFixed(6)),
    };
  });

  if (normalizedQuads.length === 0) {
    normalizedQuads.push({ x: 0.1, y: 0.1, width: 0.2, height: 0.025 });
  }

  return {
    selectedText: exactText,
    sentenceText,
    paragraphText,
    startOffset,
    endOffset,
    occurrenceIndex,
    layoutUncertainty: page.isTwoColumn,
    normalizedQuads,
  };
}
