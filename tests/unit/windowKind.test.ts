import { describe, it, expect } from 'vitest';
import {
  detectWindowKind,
  formatLocalDate,
  daySpanInclusive,
  nextIsoDate,
  currentMonthId,
} from '../../backend/metrics/windowKind.js';

describe('windowKind', () => {
  // @req REQ-004-FR-002
  it('detects rolling-90 when end is today and span is 90 days', () => {
    const end = formatLocalDate(new Date());
    const start = new Date();
    start.setDate(start.getDate() - 89);
    const startDate = formatLocalDate(start);
    expect(detectWindowKind(startDate, end)).toBe('rolling-90');
    expect(daySpanInclusive(startDate, end)).toBe(90);
  });

  // @req REQ-004-FR-003
  it('uses fixed window for historical end dates', () => {
    expect(detectWindowKind('2026-01-01', '2026-03-31')).toBe('fixed');
  });

  // @req REQ-004-FR-003
  it('uses fixed window when span is not ~90 days even if end is today', () => {
    const end = formatLocalDate(new Date());
    const start = new Date();
    start.setDate(start.getDate() - 30);
    expect(detectWindowKind(formatLocalDate(start), end)).toBe('fixed');
  });

  // @req REQ-004-FR-004
  it('nextIsoDate advances one calendar day', () => {
    expect(nextIsoDate('2026-06-01')).toBe('2026-06-02');
  });

  // @req REQ-004-FR-002
  it('currentMonthId returns YYYY-MM for local month', () => {
    expect(currentMonthId()).toMatch(/^\d{4}-\d{2}$/);
  });
});
