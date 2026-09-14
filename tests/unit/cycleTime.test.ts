import { describe, it, expect } from 'vitest';
import { computeCycleTimeHrs } from '../../backend/metrics/cycleTime.js';

const LEAVE_DISCOUNT = 33 / 261;

// Helper: build an epoch-ms from a local date/time string
function ms(dateStr: string): number {
  return new Date(dateStr).getTime();
}

describe('computeCycleTimeHrs', () => {
  // @req REQ-4.4.5-4
  it('returns 0 when mergedMs is null', () => {
    expect(computeCycleTimeHrs(ms('2024-01-02T10:00:00'), null)).toBe(0);
  });

  // @req REQ-4.4.5-4
  it('returns 0 when createdMs >= mergedMs', () => {
    const t = ms('2024-01-02T10:00:00');
    expect(computeCycleTimeHrs(t, t)).toBe(0);
    expect(computeCycleTimeHrs(t + 1000, t)).toBe(0);
  });

  // @req REQ-4.4.5-1
  it('counts only Mon–Fri 09:00–17:00 and excludes weekends', () => {
    // Friday 09:00 → Monday 17:00: only Fri 09-17 (8h) + Mon 09-17 (8h) = 16h raw
    const created = ms('2024-01-05T09:00:00'); // Friday
    const merged  = ms('2024-01-08T17:00:00'); // Monday
    const rawHours = 16;
    const expected = Math.round(rawHours * (1 - LEAVE_DISCOUNT) * 100) / 100;
    expect(computeCycleTimeHrs(created, merged)).toBeCloseTo(expected, 1);
  });

  // @req REQ-4.4.5-2
  it('applies leave discount: rawHours × (1 − 33/261) within ±0.01', () => {
    // Monday 09:00 → Monday 17:00: exactly 8 raw working hours
    const created = ms('2024-01-08T09:00:00');
    const merged  = ms('2024-01-08T17:00:00');
    const rawHours = 8;
    const expected = rawHours * (1 - LEAVE_DISCOUNT);
    expect(computeCycleTimeHrs(created, merged)).toBeCloseTo(expected, 2);
  });

  // @req REQ-4.4.5-1
  it('handles multi-day span crossing midnight', () => {
    // Monday 13:00 → Wednesday 13:00: Mon 13-17 (4h) + Tue 09-17 (8h) + Wed 09-13 (4h) = 16h raw
    const created = ms('2024-01-08T13:00:00');
    const merged  = ms('2024-01-10T13:00:00');
    const rawHours = 16;
    const expected = Math.round(rawHours * (1 - LEAVE_DISCOUNT) * 100) / 100;
    expect(computeCycleTimeHrs(created, merged)).toBeCloseTo(expected, 1);
  });

  // @req REQ-4.4.5-1
  it('returns 0 for a weekend-only range', () => {
    // Saturday 10:00 → Sunday 18:00
    const created = ms('2024-01-06T10:00:00');
    const merged  = ms('2024-01-07T18:00:00');
    expect(computeCycleTimeHrs(created, merged)).toBe(0);
  });
});
