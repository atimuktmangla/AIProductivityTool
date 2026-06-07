import { describe, it, expect, vi } from 'vitest';
import { computeCodeQuality, type PRQualityInput } from '../../BL/metrics/codeQuality.js';
import type { RawJiraIssue } from '../../types/index.js';

vi.mock('../../BL/config/env.js', () => ({
  getConfig: () => ({
    botUserPattern: 'sonarqube|jenkins|deploymentbot|renovate|dependabot|buildbot|ci-bot',
  }),
}));

const AUTHOR = 'dev1';

function makeIssue(
  issuetype: string,
  labels: string[] = [],
  resolved = true,
): RawJiraIssue {
  return {
    id: '1', key: 'PROJ-1',
    fields: {
      summary: 'test',
      issuetype: { name: issuetype },
      status: { name: resolved ? 'Done' : 'In Progress' },
      assignee: null,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      resolutiondate: resolved ? new Date().toISOString() : null,
      labels,
    },
  };
}

function makePR(linesChanged = 100): PRQualityInput {
  const now = Date.now();
  return { activities: [], linesChanged, createdDate: now - 4 * 3600_000, closedDate: now };
}

// ── Bug ratio (informational only) ───────────────────────────────────────────

describe('bug ratio (REQ-4.4.9-8)', () => {
  // @req REQ-4.4.9-8
  it('bugRatio is bugs / total issues', () => {
    const issues = [makeIssue('Bug'), makeIssue('Bug'), makeIssue('Story')];
    const result = computeCodeQuality(issues, [], AUTHOR);
    expect(result.bugRatio).toBeCloseTo(2 / 3, 2);
  });

  // @req REQ-4.4.9-8
  it('bugRatio = 0 when no bug-type issues', () => {
    const result = computeCodeQuality([makeIssue('Story')], [], AUTHOR);
    expect(result.bugRatio).toBe(0);
  });

  // @req REQ-4.4.9-8
  it('bugRatio = 1 when all issues are bugs', () => {
    const issues = [makeIssue('Bug'), makeIssue('Defect')];
    const result = computeCodeQuality(issues, [], AUTHOR);
    expect(result.bugRatio).toBe(1);
  });

  // @req REQ-4.4.9-8
  it('bugRatio is returned but does not affect composite score', () => {
    // A developer with all bugs-resolved should still reach score 100
    const issues = [makeIssue('Bug', [], true), makeIssue('Defect', [], true)];
    const pr = makePR(100);
    const PR_CREATED = Date.now() - 12 * 3600_000;
    const withApproval: PRQualityInput = {
      ...pr,
      createdDate: PR_CREATED,
      closedDate:  PR_CREATED + 4 * 3600_000,
      activities: [
        {
          id: 0, action: 'APPROVED',
          user: { name: 'reviewer1', displayName: 'Reviewer 1', emailAddress: '' },
          createdDate: PR_CREATED + 2 * 3600_000,
        },
        {
          id: 1, action: 'COMMENTED',
          user: { name: 'reviewer1', displayName: 'Reviewer 1', emailAddress: '' },
          createdDate: PR_CREATED + 1 * 3600_000,
        },
      ],
    };
    const result = computeCodeQuality(issues, [withApproval], AUTHOR);
    expect(result.score).toBe(100);
    expect(result.bugRatio).toBeGreaterThan(0); // has bugs, but score not penalised
  });
});

// ── Rating bands ─────────────────────────────────────────────────────────────

describe('rating bands (REQ-4.4.9-9)', () => {
  // @req REQ-4.4.9-9
  it('Good ≥ 75', () => {
    // All resolved issues + small PR + approval → score = 100
    const issues = [makeIssue('Bug', [], true)];
    const PR_CREATED = Date.now() - 12 * 3600_000;
    const pr: PRQualityInput = {
      activities: [
        {
          id: 0, action: 'APPROVED',
          user: { name: 'r1', displayName: 'r1', emailAddress: '' },
          createdDate: PR_CREATED + 2 * 3600_000,
        },
        {
          id: 1, action: 'COMMENTED',
          user: { name: 'r1', displayName: 'r1', emailAddress: '' },
          createdDate: PR_CREATED + 1 * 3600_000,
        },
      ],
      linesChanged: 100,
      createdDate: PR_CREATED,
      closedDate:  PR_CREATED + 4 * 3600_000,
    };
    const { score } = computeCodeQuality(issues, [pr], AUTHOR);
    expect(score).toBeGreaterThanOrEqual(75);
  });

  // @req REQ-4.4.9-9
  it('Needs work < 50 — unresolved issues, large PRs, no approval', () => {
    const issues = [makeIssue('Bug', [], false), makeIssue('Story', [], false)];
    const pr = makePR(2000); // huge PR, no activities
    const { score } = computeCodeQuality(issues, [pr], AUTHOR);
    expect(score).toBeLessThan(50);
  });
});
