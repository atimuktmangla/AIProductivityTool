import { getConfig } from '../../backend/config/env.js';
import { atlassianGet, atlassianPost } from '../client/atlassianFetch.js';
import type {
  RawJiraIssue,
  JiraSearchResponse,
  JiraIssueWithChangelog,
  IssueLinkingStatus,
} from '../../types/index.js';

let connectorAvailable = false;
let fallbackEngaged = false;

export async function pingJira(): Promise<void> {
  const { jiraBaseUrl, jiraToken } = getConfig();
  await atlassianGet(jiraBaseUrl, jiraToken, '/rest/api/2/serverInfo');
}

function jqlStr(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildConnectorJql(developerId: string, startDate: string, endDate: string): string {
  return [
    `assignee = ${jqlStr(developerId)}`,
    `development[pullrequests].all > 0`,
    `updated >= "${startDate}"`,
    `updated <= "${endDate}"`,
  ].join(' AND ') + ' ORDER BY updated DESC';
}

function buildAssigneeJql(developerId: string, startDate: string, endDate: string): string {
  return [
    `assignee = ${jqlStr(developerId)}`,
    `updated >= "${startDate}"`,
    `updated <= "${endDate}"`,
  ].join(' AND ') + ' ORDER BY updated DESC';
}

export function mergeIssuesByKey(...lists: RawJiraIssue[][]): RawJiraIssue[] {
  const map = new Map<string, RawJiraIssue>();
  for (const list of lists) {
    for (const issue of list) map.set(issue.key, issue);
  }
  return [...map.values()];
}

export async function searchIssuesByAssignees(
  developerIds: string[],
  startDate: string,
  endDate: string,
): Promise<RawJiraIssue[]> {
  const assigneeList = developerIds.map(jqlStr).join(',');
  const conditions = [
    `assignee in (${assigneeList})`,
    `development[pullrequests].all > 0`,
    `updated >= "${startDate}"`,
    `updated <= "${endDate}"`,
  ];
  const jql = `${conditions.join(' AND ')} ORDER BY updated DESC`;
  return runJqlSearch(jql);
}

export async function searchIssuesForDeveloper(
  developerId: string,
  startDate: string,
  endDate: string,
): Promise<RawJiraIssue[]> {
  const { issueLinkingMode } = getConfig();

  if (issueLinkingMode === 'assignee') {
    return runJqlSearch(buildAssigneeJql(developerId, startDate, endDate));
  }

  if (issueLinkingMode === 'connector') {
    return runJqlSearch(buildConnectorJql(developerId, startDate, endDate));
  }

  try {
    const connectorIssues = await runJqlSearch(buildConnectorJql(developerId, startDate, endDate));
    if (connectorIssues.length > 0) return connectorIssues;
    fallbackEngaged = true;
    console.warn(`[jira] hybrid linking: connector JQL returned 0 issues for ${developerId}, falling back to assignee-only`);
    return runJqlSearch(buildAssigneeJql(developerId, startDate, endDate));
  } catch (err) {
    fallbackEngaged = true;
    const message = err instanceof Error ? err.message : String(err);
    console.warn(`[jira] hybrid linking: connector JQL failed for ${developerId} (${message}), falling back to assignee-only`);
    return runJqlSearch(buildAssigneeJql(developerId, startDate, endDate));
  }
}

export async function probeConnectorAvailability(): Promise<boolean> {
  try {
    const jql = 'development[pullrequests].all > 0 AND updated >= -1d ORDER BY updated DESC';
    const page = await runJqlSearch(jql, 1);
    connectorAvailable = true;
    return page.length >= 0;
  } catch {
    connectorAvailable = false;
    return false;
  }
}

export function getIssueLinkingStatus(): IssueLinkingStatus {
  return {
    mode:               getConfig().issueLinkingMode,
    connectorAvailable,
    fallbackEngaged,
  };
}

export function resetFallbackEngaged(): void {
  fallbackEngaged = false;
}

/** @internal test hook */
export function _setConnectorAvailableForTesting(value: boolean): void {
  connectorAvailable = value;
}

export async function getIssuesByKeys(issueKeys: string[]): Promise<RawJiraIssue[]> {
  if (issueKeys.length === 0) return [];
  const jql = `key in (${issueKeys.map(jqlStr).join(',')})`;
  return runJqlSearch(jql);
}

export async function getIssueChangelog(issueKey: string): Promise<JiraIssueWithChangelog | null> {
  const { jiraBaseUrl, jiraToken } = getConfig();
  try {
    return await atlassianGet<JiraIssueWithChangelog>(
      jiraBaseUrl,
      jiraToken,
      `/rest/api/2/issue/${encodeURIComponent(issueKey)}`,
      { expand: 'changelog', fields: 'summary,issuetype,status,assignee,created,updated,resolutiondate,labels' },
    );
  } catch {
    return null;
  }
}

async function runJqlSearch(jql: string, maxResults?: number): Promise<RawJiraIssue[]> {
  const { jiraBaseUrl, jiraToken, jiraPageSize } = getConfig();
  const pageSize = maxResults ?? jiraPageSize;
  const issues: RawJiraIssue[] = [];
  let startAt = 0;

  do {
    const page = await atlassianPost<JiraSearchResponse>(jiraBaseUrl, jiraToken, '/rest/api/2/search', {
      jql,
      startAt,
      maxResults: pageSize,
      fields: ['summary', 'issuetype', 'status', 'assignee', 'created', 'updated', 'resolutiondate', 'labels'],
    });

    issues.push(...page.issues);
    if (maxResults !== undefined) break;
    startAt += page.issues.length;
    if (page.issues.length === 0 || startAt >= page.total) break;
  } while (true);

  return issues;
}
