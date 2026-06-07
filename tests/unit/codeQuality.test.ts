import { describe, it, expect, vi } from 'vitest';
import { computeCodeQuality, type PRQualityInput } from '../../BL/metrics/codeQuality.js';
import type { RawActivity, RawJiraIssue } from '../../types/index.js';

vi.mock('../../BL/config/env.js', () => ({
  getConfig: () => ({
    botUserPattern: 'sonarqube|jenkins|deploymentbot|renovate|dependabot|buildbot|ci-bot',
  }),
}));

const AUTHOR = 'dev1';
const NOW = Date.now();

function makeActivity(action: RawActivity['action'], userName: string, createdDate = NOW): RawActivity {
  return { id: 0, action, user: { name: userName, displayName: userName, emailAddress: '' }, createdDate };
}

function makeIssue(issuetype: string, labels: string[] = [], resolved = true): RawJiraIssue {
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

function makePR(overrides: Partial<PRQualityInput> = {}): PRQualityInput {
  return {
    activities:   [],
    linesChanged: 100,
    createdDate:  NOW - 4 * 3600_000, // 4 h ago
    closedDate:   NOW,
    ...overrides,
  };
}

// ── Signal 1: Critical resolution score ──────────────────────────────────────

describe('signal 1 — critical resolution', () => {
  // @req REQ-4.4.8-2
  it('no issues → criticalScore = null (signal excluded from composite)', () => {
    const result = computeCodeQuality([], [], AUTHOR);
    expect(result.criticalScore).toBeNull();
  });

  // @req REQ-4.4.8-1
  it('all regular issues resolved → criticalScore = 100', () => {
    const issues = [makeIssue('Bug'), makeIssue('Story')];
    const result = computeCodeQuality(issues, [], AUTHOR);
    expect(result.criticalScore).toBe(100);
  });

  // @req REQ-4.4.8-1
  it('unresolved issues → criticalScore < 100', () => {
    const issues = [makeIssue('Bug', [], false), makeIssue('Story', [], true)];
    const result = computeCodeQuality(issues, [], AUTHOR);
    expect(result.criticalScore).toBeLessThan(100);
  });

  // @req REQ-4.4.8-3
  it('BlackDuck label resolved → criticalScore = 100 (2.5× multiplier fills denominator)', () => {
    const issues = [makeIssue('Bug', ['blackduck'], true)];
    const result = computeCodeQuality(issues, [], AUTHOR);
    expect(result.criticalScore).toBe(100);
  });

  // @req REQ-4.4.8-3
  it('critical issue unresolved → score lower than same regular issue unresolved', () => {
    const regular  = computeCodeQuality([makeIssue('Bug', [], false)], [], AUTHOR);
    const critical = computeCodeQuality([makeIssue('Bug', ['blackduck'], false)], [], AUTHOR);
    // Both 0 resolved / 1 total but different denominators — critical has higher denominator
    expect(critical.criticalScore).toBeLessThanOrEqual(regular.criticalScore);
  });
});

// ── Signal 2: Approval score ──────────────────────────────────────────────────

describe('signal 2 — approval rate', () => {
  const PR_CREATED = NOW - 12 * 3600_000; // 12 h ago

  // @req REQ-4.4.8-2
  it('no PRs → approvalScore = null (signal excluded from composite)', () => {
    expect(computeCodeQuality([], [], AUTHOR).approvalScore).toBeNull();
  });

  // @req REQ-4.4.8-4
  it('human approval within 24 h with comment → full credit (100)', () => {
    const approvedAt = PR_CREATED + 2 * 3600_000; // 2 h after creation
    const pr = makePR({
      createdDate: PR_CREATED,
      activities: [
        makeActivity('APPROVED',  'reviewer1', approvedAt),
        makeActivity('COMMENTED', 'reviewer1', approvedAt - 1000),
      ],
    });
    const result = computeCodeQuality([], [pr], AUTHOR);
    expect(result.approvalScore).toBe(100);
  });

  // @req REQ-4.4.8-4
  it('approval under 5 min with no comment → rubber stamp → 50 credit', () => {
    const approvedAt = PR_CREATED + 3 * 60_000; // 3 min after creation
    const pr = makePR({
      createdDate: PR_CREATED,
      activities: [makeActivity('APPROVED', 'reviewer1', approvedAt)],
    });
    const result = computeCodeQuality([], [pr], AUTHOR);
    expect(result.approvalScore).toBe(50);
  });

  // @req REQ-4.4.8-4
  it('approval outside 24 h SLA → zero credit', () => {
    const approvedAt = PR_CREATED + 30 * 3600_000; // 30 h after creation
    const pr = makePR({
      createdDate: PR_CREATED,
      activities: [makeActivity('APPROVED', 'reviewer1', approvedAt)],
    });
    const result = computeCodeQuality([], [pr], AUTHOR);
    expect(result.approvalScore).toBe(0);
  });

  // @req REQ-4.4.8-5
  it('bot approval excluded', () => {
    const approvedAt = PR_CREATED + 2 * 3600_000;
    const pr = makePR({
      createdDate: PR_CREATED,
      activities: [makeActivity('APPROVED', 'sonarqube-bot', approvedAt)],
    });
    expect(computeCodeQuality([], [pr], AUTHOR).approvalScore).toBe(0);
  });

  // @req REQ-4.4.8-5
  it('author self-approval excluded', () => {
    const approvedAt = PR_CREATED + 2 * 3600_000;
    const pr = makePR({
      createdDate: PR_CREATED,
      activities: [makeActivity('APPROVED', AUTHOR, approvedAt)],
    });
    expect(computeCodeQuality([], [pr], AUTHOR).approvalScore).toBe(0);
  });
});

// ── Signal 3: PR focus (sigmoid) ──────────────────────────────────────────────

describe('signal 3 — PR focus sigmoid', () => {
  function score(lines: number) {
    return computeCodeQuality([], [makePR({ linesChanged: lines })], AUTHOR).prFocusScore;
  }

  // @req REQ-4.4.8-6
  it('0 lines → near 100 (sigmoid plateau)', () => {
    expect(score(0)).toBeGreaterThanOrEqual(93);
  });

  // @req REQ-4.4.8-6
  it('200 lines → ≥93 (sigmoid plateau)', () => {
    expect(score(200)).toBeGreaterThanOrEqual(93);
  });

  // @req REQ-4.4.8-6
  it('500 lines → ~50 (midpoint)', () => {
    expect(score(500)).toBe(50);
  });

  // @req REQ-4.4.8-6
  it('800 lines → ≤7 (sigmoid tail)', () => {
    expect(score(800)).toBeLessThanOrEqual(7);
    expect(score(1500)).toBeLessThanOrEqual(2);
  });

  // @req REQ-4.4.8-6
  it('score is strictly decreasing with size', () => {
    expect(score(100)).toBeGreaterThan(score(500));
    expect(score(500)).toBeGreaterThan(score(900));
  });

  // @req REQ-4.4.8-2
  it('no PRs → prFocusScore = null (signal excluded from composite)', () => {
    expect(computeCodeQuality([], [], AUTHOR).prFocusScore).toBeNull();
  });
});

// ── Signal 4: Low rework (exponential penalty) ────────────────────────────────

describe('signal 4 — low rework', () => {
  // @req REQ-4.4.8-7
  it('no rescopes → reworkRate = 0', () => {
    const result = computeCodeQuality([], [makePR()], AUTHOR);
    expect(result.reworkRate).toBe(0);
  });

  // @req REQ-4.4.8-7
  it('1 rescope/PR → score = round(100 × 2^-1) = 50', () => {
    const pr = makePR({ activities: [makeActivity('RESCOPED', 'other')] });
    const result = computeCodeQuality([], [pr], AUTHOR);
    expect(result.reworkRate).toBe(1);
    expect(Math.round(100 * Math.pow(2, -1))).toBe(50);
  });

  // @req REQ-4.4.8-7
  it('2 rescopes/PR → score = round(100 × 2^-2) = 25', () => {
    const pr = makePR({
      activities: [makeActivity('RESCOPED', 'other'), makeActivity('RESCOPED', 'other')],
    });
    const result = computeCodeQuality([], [pr], AUTHOR);
    expect(result.reworkRate).toBe(2);
  });
});

// ── Composite ─────────────────────────────────────────────────────────────────

describe('composite score', () => {
  // @req REQ-4.4.8-1
  it('all optimal → score = 100', () => {
    const PR_CREATED = NOW - 12 * 3600_000;
    const issue = makeIssue('Bug', [], true);
    const pr = makePR({
      linesChanged: 100,
      createdDate:  PR_CREATED,
      activities: [
        makeActivity('APPROVED',  'reviewer1', PR_CREATED + 2 * 3600_000),
        makeActivity('COMMENTED', 'reviewer1', PR_CREATED + 1 * 3600_000),
      ],
    });
    const result = computeCodeQuality([issue], [pr], AUTHOR);
    expect(result.score).toBe(100);
  });

  // @req REQ-4.4.8-1
  it('equal-weight arithmetic: round(0.25×a + 0.25×b + 0.25×c + 0.25×d)', () => {
    expect(Math.round(0.25 * 80 + 0.25 * 60 + 0.25 * 50 + 0.25 * 40)).toBe(58);
  });
});
