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

// Any Google API key pattern (AIza...) or Google AI Studio token (AQ....) is strictly forbidden anywhere in dist/, src/, src-tauri/, or tests/
const KEY_REGEX = /(?:AIza[0-9A-Za-z_-]{8,}|AQ\.[0-9A-Za-z_-]{8,})/g;

function scanDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const findings = [];
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'target') {
        continue;
      }
      findings.push(...scanDirectory(fullPath));
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (!['.js', '.mjs', '.ts', '.tsx', '.rs', '.json', '.html', '.css', '.sql', '.db'].includes(ext)) {
        continue;
      }
      const content = fs.readFileSync(fullPath, 'latin1');
      const matches = content.match(KEY_REGEX);
      if (matches && matches.length > 0) {
        findings.push({ file: path.relative(ROOT_DIR, fullPath), matches });
      }
    }
  }
  return findings;
}

const allFindings = [
  ...scanDirectory(path.join(ROOT_DIR, 'dist')),
  ...scanDirectory(path.join(ROOT_DIR, 'src')),
  ...scanDirectory(path.join(ROOT_DIR, 'src-tauri')),
  ...scanDirectory(path.join(ROOT_DIR, 'tests')),
];
if (allFindings.length > 0) {
  console.error('SEC-01 FAIL: Detected potential API key leak in:', JSON.stringify(allFindings, null, 2));
  process.exit(1);
}

console.log('SEC-01 PASS: Zero API keys or secrets found in dist/, src/, or src-tauri/.');
