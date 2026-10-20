#!/usr/bin/env node
/**
 * SEC-01 Automated Secret & Credential Scanner for LexiBook AI.
 * Scans built frontend bundles (`dist/`), source code (`src/`, `src-tauri/`),
 * and any local SQLite databases for leaked Google/Gemini API keys or live credentials.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(__dirname, '..');

// Real Google API keys start with AIza (39 chars) or AQ. (Google AI Studio tokens)
const REAL_KEY_REGEX = /(?:AIza[0-9A-Za-z_-]{35}|AQ\.[0-9A-Za-z_-]{20,})/g;
const ALLOWLIST_MOCK_PATTERNS = [/Mock/i, /Test/i, /Secret/i, /Example/i, /Placeholder/i];

function isAllowedMockToken(token) {
  return ALLOWLIST_MOCK_PATTERNS.some((re) => re.test(token));
}

function scanDirectory(dirPath, isDistBundle = false) {
  if (!fs.existsSync(dirPath)) return [];
  const findings = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'target') {
        continue;
      }
      findings.push(...scanDirectory(fullPath, isDistBundle));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.js', '.mjs', '.ts', '.tsx', '.rs', '.json', '.html', '.css', '.sql', '.db'].includes(ext)) {
        continue;
      }
      const content = fs.readFileSync(fullPath, 'latin1');
      if (isDistBundle) {
        // In compiled dist/ frontend bundle, NO AIza or AQ. token of any kind (even mock) should be embedded
        const anyAiza = content.match(/(?:AIza[0-9A-Za-z_-]{12,}|AQ\.[0-9A-Za-z_-]{12,})/g);
        if (anyAiza) {
          findings.push({ file: path.relative(ROOT_DIR, fullPath), matches: anyAiza });
        }
      } else {
        const matches = content.match(REAL_KEY_REGEX) ?? [];
        const disallowed = matches.filter((m) => !isAllowedMockToken(m));
        if (disallowed.length > 0) {
          findings.push({ file: path.relative(ROOT_DIR, fullPath), matches: disallowed });
        }
      }
    }
  }
  return findings;
}

const distFindings = scanDirectory(path.join(ROOT_DIR, 'dist'), true);
const srcFindings = [
  ...scanDirectory(path.join(ROOT_DIR, 'src'), false),
  ...scanDirectory(path.join(ROOT_DIR, 'src-tauri'), false),
];

const allFindings = [...distFindings, ...srcFindings];
if (allFindings.length > 0) {
  console.error('SEC-01 FAIL: Detected potential API key leak in:', JSON.stringify(allFindings, null, 2));
  process.exit(1);
}

console.log('SEC-01 PASS: Zero API keys or secrets found in dist/, src/, or src-tauri/.');
