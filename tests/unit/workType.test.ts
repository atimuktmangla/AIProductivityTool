import { describe, it, expect } from 'vitest';
import { classifyWorkType } from '../../backend/metrics/workType.js';

describe('classifyWorkType', () => {
  // ── Known type-map entries ────────────────────────────────────────────────
  // @req REQ-4.4.10-1
  it.each([
    ['New Feature',    'features'],
    ['Story',          'features'],
    ['Feature',        'features'],
    ['Epic',           'features'],
    ['Improvement',    'features'],
    ['Enhancement',    'features'],
    ['Bug',            'bugs'],
    ['Defect',         'bugs'],
    ['Hotfix',         'bugs'],
    ['Incident',       'bugs'],
    ['Technical Task', 'infraOrDebt'],
    ['Task',           'infraOrDebt'],
    ['Sub-Task',       'infraOrDebt'],
    ['Subtask',        'infraOrDebt'],
    ['Tech Debt',      'infraOrDebt'],
    ['Technical Debt', 'infraOrDebt'],
    ['Maintenance',    'infraOrDebt'],
    ['Infrastructure', 'infraOrDebt'],
    ['Infra',          'infraOrDebt'],
    ['Refactor',       'infraOrDebt'],
    ['Chore',          'infraOrDebt'],
  ] as [string, string][])('%s → %s', (typeName, expected) => {
    expect(classifyWorkType(typeName, [])).toBe(expected);
  });

  // ── Label fallback for unknown types ─────────────────────────────────────
  // @req REQ-4.4.10-2
  it('unknown type with bug label → bugs', () => {
    expect(classifyWorkType('Unknown', ['bug', 'customer-reported'])).toBe('bugs');
  });

  // @req REQ-4.4.10-2
  it('unknown type with debt label → infraOrDebt', () => {
    expect(classifyWorkType('Unknown', ['chore', 'tech-cleanup'])).toBe('infraOrDebt');
  });

  // @req REQ-4.4.10-3
  it('unknown type with no matching label → features (default)', () => {
    expect(classifyWorkType('Unknown', ['some-label'])).toBe('features');
  });

  // @req REQ-4.4.10-3
  it('unknown type with no labels → features (default)', () => {
    expect(classifyWorkType('Unknown', [])).toBe('features');
  });

  // ── Case-insensitivity ────────────────────────────────────────────────────
  // @req REQ-4.4.10-1
  it('is case-insensitive for type name', () => {
    expect(classifyWorkType('BUG', [])).toBe('bugs');
    expect(classifyWorkType('new feature', [])).toBe('features');
  });
});
