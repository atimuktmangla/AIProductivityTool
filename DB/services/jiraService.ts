import { getConfig } from '../../BL/config/env.js';
import { atlassianGet, atlassianPost } from '../client/atlassianFetch.js';
import type { RawJiraIssue, JiraSearchResponse } from '../../types/index.js';

export async function pingJira(): Promise<void> {
  const { jiraBaseUrl, jiraToken } = getConfig();
  await atlassianGet(jiraBaseUrl, jiraToken, '/rest/api/2/serverInfo');
}

// Jira usernames/keys are alphanumeric+hyphen by spec, but we escape any
// stray double-quotes defensively to prevent JQL injection.
function jqlStr(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
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

export async function getIssuesByKeys(issueKeys: string[]): Promise<RawJiraIssue[]> {
  if (issueKeys.length === 0) return [];
  const jql = `key in (${issueKeys.map(jqlStr).join(',')})`;
  return runJqlSearch(jql);
}

async function runJqlSearch(jql: string): Promise<RawJiraIssue[]> {
  const { jiraBaseUrl, jiraToken, jiraPageSize } = getConfig();
  const issues: RawJiraIssue[] = [];
  let startAt = 0;

  do {
    const page = await atlassianPost<JiraSearchResponse>(jiraBaseUrl, jiraToken, '/rest/api/2/search', {
      jql,
      startAt,
      maxResults: jiraPageSize,
      fields: ['summary', 'issuetype', 'status', 'assignee', 'created', 'updated', 'resolutiondate', 'labels'],
    });

    issues.push(...page.issues);
    startAt += page.issues.length;
    if (page.issues.length === 0 || startAt >= page.total) break;
  } while (true);

  return issues;
}
