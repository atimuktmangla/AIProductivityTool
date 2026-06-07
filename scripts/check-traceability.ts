/**
 * Spec-to-test traceability checker.
 *
 * PASS conditions (all must hold):
 *   1. Every REQ-* in FUNCTIONAL_SPEC.md has at least one @req tag in the tests.
 *   2. No @req tag in a test references a REQ-* that doesn't exist in the spec.
 *   3. No it(...) block in any test file is missing a preceding @req tag.
 *
 * Usage:  npx tsx scripts/check-traceability.ts
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT       = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const SPEC_FILE  = join(ROOT, 'docs', 'FUNCTIONAL_SPEC.md');

// Both backend and UI test directories
const TEST_DIRS = [
  join(ROOT, 'tests'),
  join(ROOT, 'UI', 'src', 'test'),
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseSpecIds(specPath: string): Set<string> {
  const text = readFileSync(specPath, 'utf8');
  const ids = new Set<string>();
  for (const match of text.matchAll(/<!--\s*(REQ-[\w.-]+)\s*-->/g)) {
    ids.add(match[1]);
  }
  return ids;
}

function walkFiles(dir: string, ext: string[]): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) {
        results.push(...walkFiles(full, ext));
      } else if (ext.includes(extname(entry))) {
        results.push(full);
      }
    }
  } catch {
    // Directory may not exist yet (e.g. UI tests before npm install)
  }
  return results;
}

function relPath(p: string): string {
  return p.replace(ROOT, '').replace(/^[\\/]/, '');
}

// ── Parse @req tags from test files ──────────────────────────────────────────

function parseTestRefs(dirs: string[]): Map<string, string[]> {
  const refs = new Map<string, string[]>();
  for (const dir of dirs) {
    for (const file of walkFiles(dir, ['.ts', '.tsx', '.js'])) {
      const text = readFileSync(file, 'utf8');
      for (const match of text.matchAll(/@req\s+(REQ-[\w.\s-]+?)(?:\n|$)/g)) {
        for (const id of match[1].trim().split(/\s+/)) {
          if (!refs.has(id)) refs.set(id, []);
          refs.get(id)!.push(relPath(file));
        }
      }
    }
  }
  return refs;
}

// ── Find it() blocks without a preceding @req on the immediately prior line ──

interface UntaggedTest { file: string; line: number; name: string }

function findUntaggedTests(dirs: string[]): UntaggedTest[] {
  const untagged: UntaggedTest[] = [];
  for (const dir of dirs) {
    for (const file of walkFiles(dir, ['.ts', '.tsx', '.js'])) {
      const lines = readFileSync(file, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Match: it('...') or it("...") — but not it.each (handled by parent describe @req)
        const m = line.match(/^\s+(?:it|test)\s*\(\s*['"`](.+?)['"`]/);
        if (!m) continue;

        // Look backward through blank/comment lines for @req
        let found = false;
        for (let j = i - 1; j >= Math.max(0, i - 4); j--) {
          const prev = lines[j].trim();
          if (prev === '') continue;
          if (/@req\s+REQ-/.test(prev)) { found = true; break; }
          // Stop looking back if we hit non-comment code
          if (prev && !prev.startsWith('//') && !prev.startsWith('*')) break;
        }
        if (!found) {
          untagged.push({ file: relPath(file), line: i + 1, name: m[1] });
        }
      }
    }
  }
  return untagged;
}

// ── Run checks ────────────────────────────────────────────────────────────────

const specIds     = parseSpecIds(SPEC_FILE);
const testRefs    = parseTestRefs(TEST_DIRS);
const untagged    = findUntaggedTests(TEST_DIRS);

const untested: string[] = [];
const orphaned: string[] = [];

for (const id of [...specIds].sort()) {
  if (!testRefs.has(id)) untested.push(id);
}
for (const id of [...testRefs.keys()].sort()) {
  if (!specIds.has(id)) orphaned.push(id);
}

let failed = false;

if (untested.length > 0) {
  failed = true;
  console.error('\n[traceability] UNTESTED requirements (add @req tags to tests):');
  for (const id of untested) console.error(`  - ${id}`);
}

if (orphaned.length > 0) {
  failed = true;
  console.error('\n[traceability] ORPHANED test tags (not found in spec):');
  for (const id of orphaned) {
    console.error(`  - ${id}  (${testRefs.get(id)!.join(', ')})`);
  }
}

if (untagged.length > 0) {
  failed = true;
  console.error('\n[traceability] UNTAGGED it() blocks (add // @req REQ-* before each):');
  for (const t of untagged) console.error(`  - ${t.file}:${t.line}  "${t.name}"`);
}

if (!failed) {
  const testFiles = TEST_DIRS.flatMap((d) => walkFiles(d, ['.ts', '.tsx', '.js'])).length;
  console.log(`\n[traceability] OK — ${specIds.size} requirements, ${testFiles} test files, all covered and tagged.\n`);
} else {
  console.error(`\n[traceability] FAILED — ${untested.length} untested, ${orphaned.length} orphaned, ${untagged.length} untagged it() blocks.\n`);
  process.exit(1);
}
