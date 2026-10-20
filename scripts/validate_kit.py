#!/usr/bin/env python3
"""Validate static Antigravity kit structure. Stdlib only; does not build LexiBook."""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parent.parent
REQUIRED = [
    'AGENTS.md', 'START_PROMPT.md', 'README_START_HERE.md',
    'tasks/TASK_INDEX.md', 'docs/CONTRACTS.md', 'docs/TEST_MATRIX.md',
    '.agents/skills/lexibook-orchestrate/SKILL.md',
    '.agents/agents/orchestrator.md',
]
errors = []
for item in REQUIRED:
    if not (ROOT / item).is_file():
        errors.append(f'Missing required file: {item}')
for i in range(17):
    matches = list((ROOT / 'tasks').glob(f'{i:02d}-*.md'))
    if len(matches) != 1:
        errors.append(f'Task {i:02d}: expected 1 file, got {len(matches)}')
for p in (ROOT / '.agents/rules').glob('*.md'):
    data = p.read_text(encoding='utf-8')
    if not re.search(r'\A---\ntrigger: (always_on|model_decision|glob|manual)\n', data):
        errors.append(f'Invalid rule trigger/frontmatter: {p}')
    if len(data.encode('utf-8')) > 24000:
        errors.append(f'Rule exceeds 24 KB: {p}')
for p in (ROOT / '.agents/agents').glob('*.md'):
    if not re.match(r'^---\nname: [a-z0-9-]+\ndescription:', p.read_text(encoding='utf-8')):
        errors.append(f'Invalid agent frontmatter: {p}')
for p in (ROOT / '.agents/skills').glob('*/SKILL.md'):
    if not re.match(r'^---\nname: [a-z0-9-]+\ndescription:', p.read_text(encoding='utf-8')):
        errors.append(f'Invalid skill frontmatter: {p}')
if not (ROOT / 'LexiBook_AI_MVP_PRD.md').is_file():
    print('NOTE: PRD not in kit. This is expected BEFORE extraction into your repository.')
if errors:
    print('INVALID KIT:')
    print('\n'.join('- '+x for x in errors))
    sys.exit(1)
print('PASS: Static kit paths, 17 task files and rule/agent/skill manifests are consistent.')
print('NOTE: This does NOT test the application, build the installer, or run its E2E suite.')
