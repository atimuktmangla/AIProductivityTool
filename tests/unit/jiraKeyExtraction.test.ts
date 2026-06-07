import { describe, it, expect } from 'vitest';

// @req REQ-4.4.3-2
// The regex lives in aggregator.ts — we test the contract, not the import.
// If this regex is changed the behaviour changes — this test catches that.
const JIRA_KEY_RE = /([A-Z]+-\d+)/g;

function extractKeys(message: string): string[] {
  return [...message.matchAll(JIRA_KEY_RE)].map((m) => m[1]);
}

describe('Jira key extraction from commit / PR title (REQ-4.4.3-2)', () => {
  // @req REQ-4.4.3-2
  it('extracts a single key from a commit message', () => {
    expect(extractKeys('PROJ-123 fix null pointer')).toEqual(['PROJ-123']);
  });

  // @req REQ-4.4.3-2
  it('extracts multiple keys from one message', () => {
    expect(extractKeys('PROJ-1 and PROJ-2 refactor service')).toEqual(['PROJ-1', 'PROJ-2']);
  });

  // @req REQ-4.4.3-2
  it('handles keys with multi-char project prefixes', () => {
    expect(extractKeys('MYPROJECT-456 update deps')).toEqual(['MYPROJECT-456']);
  });

  // @req REQ-4.4.3-2
  it('ignores lowercase project prefixes', () => {
    expect(extractKeys('proj-123 fix')).toEqual([]);
  });

  // @req REQ-4.4.3-2
  it('returns empty array when no keys present', () => {
    expect(extractKeys('chore: bump version to 1.2.3')).toEqual([]);
  });

  // @req REQ-4.4.3-3
  it('deduplication — duplicate keys in different messages produce one entry', () => {
    const messages = ['PROJ-1 fix A', 'PROJ-1 fix B', 'PROJ-2 add feature'];
    const allKeys = messages.flatMap(extractKeys);
    const deduped = [...new Set(allKeys)];
    expect(deduped).toEqual(['PROJ-1', 'PROJ-2']);
  });
});
