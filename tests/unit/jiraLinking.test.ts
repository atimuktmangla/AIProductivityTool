import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseIssueLinkingMode } from '../../backend/config/env.js';
import {
  mergeIssuesByKey,
  searchIssuesForDeveloper,
  getIssueLinkingStatus,
  resetFallbackEngaged,
  _setConnectorAvailableForTesting,
} from '../../databaselayer/services/jiraService.js';
import { getConfig } from '../../backend/config/env.js';
import type { RawJiraIssue } from '../../types/index.js';

const atlassianPostMock = vi.fn();

vi.mock('../../databaselayer/client/atlassianFetch.js', () => ({
  atlassianGet: vi.fn(),
  atlassianPost: (...args: unknown[]) => atlassianPostMock(...args),
}));

vi.mock('../../backend/config/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../backend/config/env.js')>();
  return {
    ...actual,
    getConfig: vi.fn(() => ({
      jiraBaseUrl: 'https://jira.test',
      jiraToken: 'token',
      jiraPageSize: 50,
      issueLinkingMode: 'hybrid' as const,
    })),
  };
});

function issue(key: string): RawJiraIssue {
  return {
    key,
    fields: {
      summary: key,
      issuetype: { name: 'Story' },
      status: { name: 'Done' },
      assignee: { name: 'dev1', displayName: 'Dev One' },
      created: '2026-01-01T00:00:00.000Z',
      updated: '2026-03-01T00:00:00.000Z',
      resolutiondate: '2026-03-02T00:00:00.000Z',
      labels: [],
    },
  };
}

describe('Jira issue linking (003-performance-resilience)', () => {
  beforeEach(() => {
    atlassianPostMock.mockReset();
    resetFallbackEngaged();
    _setConnectorAvailableForTesting(false);
    vi.mocked(getConfig).mockReturnValue({
      jiraBaseUrl: 'https://jira.test',
      jiraToken: 'token',
      jiraPageSize: 50,
      issueLinkingMode: 'hybrid',
    } as ReturnType<typeof getConfig>);
  });

  // @req REQ-003-FR-001
  it('parseIssueLinkingMode accepts connector, assignee, and hybrid', () => {
    expect(parseIssueLinkingMode('connector')).toBe('connector');
    expect(parseIssueLinkingMode('assignee')).toBe('assignee');
    expect(parseIssueLinkingMode('hybrid')).toBe('hybrid');
  });

  // @req REQ-003-FR-001
  it('parseIssueLinkingMode throws on invalid mode', () => {
    expect(() => parseIssueLinkingMode('invalid')).toThrow(/Invalid JIRA_ISSUE_LINKING_MODE/);
  });

  // @req REQ-003-FR-002
  it('hybrid falls back to assignee-only when connector JQL returns zero issues', async () => {
    atlassianPostMock
      .mockResolvedValueOnce({ issues: [], total: 0 })
      .mockResolvedValueOnce({ issues: [issue('PROJ-1')], total: 1 });

    const results = await searchIssuesForDeveloper('dev1', '2026-01-01', '2026-03-31');
    expect(results).toHaveLength(1);
    expect(results[0].key).toBe('PROJ-1');
    expect(atlassianPostMock).toHaveBeenCalledTimes(2);
    expect(getIssueLinkingStatus().fallbackEngaged).toBe(true);
  });

  // @req REQ-003-FR-002
  it('hybrid falls back to assignee-only when connector JQL throws', async () => {
    atlassianPostMock
      .mockRejectedValueOnce(new Error('JQL unsupported'))
      .mockResolvedValueOnce({ issues: [issue('PROJ-2')], total: 1 });

    const results = await searchIssuesForDeveloper('dev1', '2026-01-01', '2026-03-31');
    expect(results[0].key).toBe('PROJ-2');
    expect(getIssueLinkingStatus().fallbackEngaged).toBe(true);
  });

  // @req REQ-003-FR-004
  it('merged issues retain issuetype and labels used for work-type classification', () => {
    const connectorIssue = issue('PROJ-1');
    connectorIssue.fields.issuetype.name = 'Bug';
    connectorIssue.fields.labels = ['security'];
    const assigneeIssue = issue('PROJ-2');
    assigneeIssue.fields.issuetype.name = 'Story';
    const merged = mergeIssuesByKey([connectorIssue], [assigneeIssue]);
    expect(merged.find((i) => i.key === 'PROJ-1')?.fields.issuetype.name).toBe('Bug');
    expect(merged.find((i) => i.key === 'PROJ-1')?.fields.labels).toEqual(['security']);
    expect(merged.find((i) => i.key === 'PROJ-2')?.fields.issuetype.name).toBe('Story');
  });

  // @req REQ-003-FR-003
  it('mergeIssuesByKey deduplicates assignee and PR-title-linked issues by key', () => {
    const merged = mergeIssuesByKey(
      [issue('PROJ-1'), issue('PROJ-2')],
      [issue('PROJ-2'), issue('PROJ-3')],
    );
    expect(merged.map((i) => i.key).sort()).toEqual(['PROJ-1', 'PROJ-2', 'PROJ-3']);
  });

  // @req REQ-003-FR-005
  it('getIssueLinkingStatus reflects config mode and connector probe result', () => {
    _setConnectorAvailableForTesting(true);
    const status = getIssueLinkingStatus();
    expect(status.mode).toBe('hybrid');
    expect(status.connectorAvailable).toBe(true);
    expect(status.fallbackEngaged).toBe(false);
  });
});
