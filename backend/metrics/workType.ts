export type WorkCategory = 'features' | 'bugs' | 'infraOrDebt';

// Maps Jira issuetype.name values as specified: "New Feature" → features, "Bug" → bugs,
// "Technical Task" / infra-flavoured types → infraOrDebt.
const TYPE_MAP: Record<string, WorkCategory> = {
  // Features
  'new feature':        'features',
  'story':              'features',
  'feature':            'features',
  'epic':               'features',
  'improvement':        'features',
  'enhancement':        'features',
  // Bugs
  'bug':                'bugs',
  'defect':             'bugs',
  'hotfix':             'bugs',
  'incident':           'bugs',
  // Infra / debt
  'technical task':     'infraOrDebt',
  'task':               'infraOrDebt',
  'sub-task':           'infraOrDebt',
  'subtask':            'infraOrDebt',
  'tech debt':          'infraOrDebt',
  'technical debt':     'infraOrDebt',
  'maintenance':        'infraOrDebt',
  'infrastructure':     'infraOrDebt',
  'infra':              'infraOrDebt',
  'refactor':           'infraOrDebt',
  'chore':              'infraOrDebt',
};

const BUG_LABEL_RE  = /\b(bug|defect|hotfix|incident|fix)\b/i;
const DEBT_LABEL_RE = /\b(infra|infrastructure|debt|chore|refactor|maintenance|cleanup)\b/i;

export function classifyWorkType(issueTypeName: string, labels: string[]): WorkCategory {
  const key = issueTypeName.toLowerCase().trim();
  if (key in TYPE_MAP) return TYPE_MAP[key];

  const labelStr = labels.join(' ');
  if (BUG_LABEL_RE.test(labelStr))  return 'bugs';
  if (DEBT_LABEL_RE.test(labelStr)) return 'infraOrDebt';

  return 'features'; // default
}
