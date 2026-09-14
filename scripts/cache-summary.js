const fs = require('fs'), p = require('path');
const base = p.join(__dirname, '..', 'data', 'cache');

function walk(d) {
  if (!fs.existsSync(d)) return [];
  let r = [];
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const f = p.join(d, e.name);
    if (e.isDirectory()) r = r.concat(walk(f));
    else r.push(f);
  }
  return r;
}

function extractUser(filename) {
  const base = p.basename(filename, '.json');
  const parts = base.split('__');
  return parts.length >= 3 ? parts[parts.length - 1] : null;
}

const allFiles = walk(base);
const fwdFiles = allFiles.map(f => f.split(p.sep).join('/'));

const userPRs = {};
const prOwners = {};

for (let i = 0; i < allFiles.length; i++) {
  if (!fwdFiles[i].includes('/merged-prs/')) continue;
  const user = extractUser(allFiles[i]);
  if (!user) continue;
  try {
    const d = JSON.parse(fs.readFileSync(allFiles[i], 'utf8'));
    const prs = Array.isArray(d) ? d : (d.prs || []);
    if (prs.length > 0) {
      userPRs[user] = (userPRs[user] || 0) + prs.length;
      for (const pr of prs) {
        const proj = pr.fromRef?.repository?.project?.key ?? '';
        const repo = pr.fromRef?.repository?.slug ?? '';
        prOwners[proj + '__' + repo + '__' + pr.id] = user;
      }
    }
  } catch (e) {}
}

const userCommits = {};
for (let i = 0; i < allFiles.length; i++) {
  if (!fwdFiles[i].includes('/commits/')) continue;
  const user = extractUser(allFiles[i]);
  if (!user) continue;
  try {
    const d = JSON.parse(fs.readFileSync(allFiles[i], 'utf8'));
    const arr = Array.isArray(d) ? d : (d.commits || []);
    if (arr.length > 0) userCommits[user] = (userCommits[user] || 0) + arr.length;
  } catch (e) {}
}

const userDetails = {};
for (let i = 0; i < allFiles.length; i++) {
  if (!fwdFiles[i].includes('/pr-details/')) continue;
  try {
    const d = JSON.parse(fs.readFileSync(allFiles[i], 'utf8'));
    if (!d.activities) continue;
    const fname = p.basename(allFiles[i], '.json');
    const parts = fname.split('__');
    if (parts.length < 3) continue;
    const key = parts[0] + '__' + parts[1] + '__' + parts[2];
    const user = prOwners[key];
    if (user) userDetails[user] = (userDetails[user] || 0) + 1;
  } catch (e) {}
}

const allUsers = new Set([...Object.keys(userPRs), ...Object.keys(userCommits), ...Object.keys(userDetails)]);
console.log('User             | Merged PRs | Commits (rows) | PR-Detail files');
console.log('-----------------|------------|----------------|----------------');
for (const u of [...allUsers].sort()) {
  console.log(
    u.padEnd(17) + '| ' +
    String(userPRs[u] || 0).padEnd(11) + '| ' +
    String(userCommits[u] || 0).padEnd(15) + '| ' +
    (userDetails[u] || 0)
  );
}
