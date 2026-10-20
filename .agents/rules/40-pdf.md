---
trigger: model_decision
description: "Activate for PDF.js rendering, text selection, word highlighting, anchor persistence and PDF file parsing"
---

# PDF correctness
- Use native PDF text-layer for selection; no OCR promise in MVP.
- Store normalized PDF quads + robust text anchoring; no viewport pixel-only positions.
- Test 50–200% zoom, scroll, resize, rotation, multi-line, duplicate words, 2-column, ligature and malformed or scanned documents.
- If context extraction uncertain, show editable preview and warning, never silently invent a paragraph.
- Persist highlight immediately before async AI; clicking sidebar occurrence must navigate correctly after app restart.
