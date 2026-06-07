import { describe, it, expect, vi } from 'vitest';
import { computeReviewDepth } from '../../BL/metrics/reviewDepth.js';
import {
  computePickupDelayHrs,
  computeReviewLifecycleHrs,
} from '../../BL/metrics/cycleTime.js';
import type { RawActivity } from '../../types/index.js';

vi.mock('../../BL/config/env.js', () => ({
  getConfig: () => ({
    botUserPattern: 'sonarqube|jenkins|deploymentbot|renovate|dependabot|buildbot|ci-bot',
  }),
}));

const AUTHOR = 'dev1';
const BASE = new Date('2024-01-08T09:00:00').getTime(); // Monday 09:00

function act(action: RawActivity['action'], user: string, offsetMs = 0): RawActivity {
  return {
    id: 0,
    action,
    user: { name: user, displayName: user, emailAddress: '' },
    createdDate: BASE + offsetMs,
  };
}

// ── REQ-4.4.7: Review depth ───────────────────────────────────────────────────

describe('computeReviewDepth', () => {
  // @req REQ-4.4.7-1 REQ-4.4.8-1
  it('counts COMMENTED, REVIEWED, APPROVED from non-author non-bot users', () => {
    const activities = [
      act('COMMENTED', 'alice', 1000),
      act('REVIEWED',  'bob',   2000),
      act('APPROVED',  'carol', 3000),
    ];
    expect(computeReviewDepth(activities, AUTHOR)).toBe(3);
  });

  // @req REQ-4.4.7-1
  it('excludes author actions', () => {
    const activities = [act('COMMENTED', AUTHOR, 1000)];
    expect(computeReviewDepth(activities, AUTHOR)).toBe(0);
  });

  // @req REQ-4.4.7-1
  it('excludes bot actions', () => {
    const activities = [act('COMMENTED', 'sonarqube-scanner', 1000)];
    expect(computeReviewDepth(activities, AUTHOR)).toBe(0);
  });

  // @req REQ-4.4.7-1
  it('excludes RESCOPED and OPENED actions', () => {
    const activities = [
      act('RESCOPED', 'alice', 1000),
      act('OPENED',   'alice', 2000),
    ];
    expect(computeReviewDepth(activities, AUTHOR)).toBe(0);
  });

  // @req REQ-4.4.7-1
  it('returns 0 for empty activity list', () => {
    expect(computeReviewDepth([], AUTHOR)).toBe(0);
  });
});

// ── REQ-4.4.5: Pickup delay ───────────────────────────────────────────────────

describe('computePickupDelayHrs', () => {
  // @req REQ-4.4.5-1
  it('returns working hours from PR creation to first reviewer action', () => {
    // BASE = Mon 09:00; first reviewer action at Mon 11:00 = +2h raw
    const firstReviewerMs = BASE + 2 * 3600_000;
    const result = computePickupDelayHrs(BASE, firstReviewerMs);
    // 2 raw working hours discounted by leave factor
    expect(result).toBeGreaterThan(0);
    expect(result).toBeCloseTo(2 * (1 - 33 / 261), 1);
  });

  // @req REQ-4.4.5-1
  it('returns 0 when no reviewer action (null)', () => {
    expect(computePickupDelayHrs(BASE, null)).toBe(0);
  });

  // @req REQ-4.4.5-1
  it('returns 0 when reviewer action is before PR creation', () => {
    expect(computePickupDelayHrs(BASE, BASE - 1000)).toBe(0);
  });
});

// ── REQ-4.4.6: Review lifecycle ───────────────────────────────────────────────

describe('computeReviewLifecycleHrs', () => {
  // @req REQ-4.4.6-1
  it('returns working hours from first comment to PR close', () => {
    // BASE = Mon 09:00; first comment Mon 10:00 = +1h; closed Mon 13:00 = +4h → 3h raw window
    const firstCommentMs = BASE + 1 * 3600_000;
    const mergedMs       = BASE + 4 * 3600_000;
    const result = computeReviewLifecycleHrs(firstCommentMs, mergedMs);
    expect(result).toBeCloseTo(3 * (1 - 33 / 261), 1);
  });

  // @req REQ-4.4.6-1
  it('returns 0 when firstCommentMs is null', () => {
    expect(computeReviewLifecycleHrs(null, BASE + 3600_000)).toBe(0);
  });

  // @req REQ-4.4.6-1
  it('returns 0 when mergedMs is null', () => {
    expect(computeReviewLifecycleHrs(BASE, null)).toBe(0);
  });

  // @req REQ-4.4.6-1
  it('returns 0 when comment is after merge', () => {
    expect(computeReviewLifecycleHrs(BASE + 2 * 3600_000, BASE + 1 * 3600_000)).toBe(0);
  });
});
