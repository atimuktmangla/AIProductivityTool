import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');

describe('003-performance-resilience documentation', () => {
  // @req REQ-003-FR-018
  it('feature modules import independently without requiring server bootstrap', async () => {
    const { parseIssueLinkingMode } = await import('../../backend/config/env.js');
    const { getCachedIssueChangelog } = await import('../../databaselayer/cache/jiraChangelogCache.js');
    const { initAppStore, _resetForTesting } = await import('../../databaselayer/store/appStore.js');
    expect(parseIssueLinkingMode('hybrid')).toBe('hybrid');
    expect(typeof getCachedIssueChangelog).toBe('function');
    initAppStore(':memory:');
    _resetForTesting();
  });

  // @req REQ-003-FR-019
  it('baseline spec known limitations reference specs/003-performance-resilience', () => {
    const text = readFileSync(join(ROOT, 'specs/000-project-baseline/spec.md'), 'utf8');
    expect(text).toMatch(/003-performance-resilience/);
  });
});
