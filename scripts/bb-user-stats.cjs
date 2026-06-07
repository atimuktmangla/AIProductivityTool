/**
 * Bitbucket stats: authored merged PRs + reviewed PRs for specified users.
 * Repo discovery: profile/recent/repos only — no full project scan.
 * Both users run in parallel; per-user repos run concurrently.
 *
 * Usage:
 *   BB_TOKEN=<your-token> BB_HOST=bitbucket.yourcompany.com node scripts/bb-user-stats.cjs
 *
 * Or set TOKEN / HOST / USERS / FROM / TO directly in the script below.
 */
const https = require('https');

const TOKEN = process.env.BB_TOKEN ?? '';
const HOST  = process.env.BB_HOST  ?? 'bitbucket.yourcompany.com';
const USERS = (process.env.BB_USERS ?? 'alice,bob').split(',').map(s => s.trim());
const FROM  = new Date(process.env.BB_FROM ?? '2026-01-01').getTime();
const TO    = new Date(process.env.BB_TO   ?? new Date().toISOString().slice(0, 10)).getTime();

if (!TOKEN) {
  console.error('BB_TOKEN environment variable is required');
  process.exit(1);
}

function get(path) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: HOST,
      path,
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/json' },
      rejectUnauthorized: false,
    }, (res) => {
      let body = '';
      res.on('data', d => body += d);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch { reject(new Error('JSON: ' + body.slice(0, 120))); }
      });
    }).on('error', reject);
  });
}

async function getProfileRepos(userSlug) {
  const p = await get(`/rest/api/1.0/profile/recent/repos?username=${userSlug}&limit=50`);
  if (p.errors || !p.values) return [];
  return p.values.map(r => ({ projectKey: r.project.key, repoSlug: r.slug }));
}

async function getMergedByAuthor(projectKey, repoSlug, authorSlug) {
  const prs = [];
  let start = 0;
  while (true) {
    const p = await get(
      `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests` +
      `?state=MERGED&author=${authorSlug}&limit=100&start=${start}`
    );
    if (p.errors || !p.values?.length) break;
    let stop = false;
    for (const pr of p.values) {
      if (pr.author.user.name !== authorSlug) continue;
      const ts = pr.closedDate ?? pr.createdDate;
      if (ts < FROM) { stop = true; break; }
      if (ts <= TO) prs.push({ id: pr.id, title: pr.title, date: ts });
    }
    const oldest = p.values.at(-1)?.updatedDate ?? 0;
    if (p.isLastPage || stop || oldest < FROM) break;
    start = p.nextPageStart ?? start + p.values.length;
  }
  return prs;
}

async function getReviewedCount(projectKey, repoSlug, reviewerSlug) {
  let count = 0, start = 0;
  while (true) {
    const p = await get(
      `/rest/api/1.0/projects/${projectKey}/repos/${repoSlug}/pull-requests` +
      `?state=MERGED&reviewer=${reviewerSlug}&limit=100&start=${start}`
    );
    if (p.errors || !p.values?.length) break;
    let stop = false;
    for (const pr of p.values) {
      const ts = pr.closedDate ?? pr.createdDate;
      if (ts < FROM) { stop = true; break; }
      if (ts <= TO) count++;
    }
    const oldest = p.values.at(-1)?.updatedDate ?? 0;
    if (p.isLastPage || stop || oldest < FROM) break;
    start = p.nextPageStart ?? start + p.values.length;
  }
  return count;
}

async function statsForUser(user) {
  const repos = await getProfileRepos(user);
  console.log(`  ${user}: ${repos.length} repos from profile API`);

  const results = await Promise.all(
    repos.map(({ projectKey, repoSlug }) =>
      Promise.all([
        getMergedByAuthor(projectKey, repoSlug, user).catch(() => []),
        getReviewedCount(projectKey, repoSlug, user).catch(() => 0),
      ]).then(([authored, reviewedCount]) => ({ projectKey, repoSlug, authored, reviewedCount }))
    )
  );

  let totalAuthored = 0, totalReviewed = 0;
  for (const r of results) {
    totalAuthored += r.authored.length;
    totalReviewed += r.reviewedCount;
  }
  return { user, repos, results, totalAuthored, totalReviewed };
}

async function main() {
  const fromStr = new Date(FROM).toISOString().slice(0, 10);
  const toStr   = new Date(TO).toISOString().slice(0, 10);
  console.log(`Fetching profile repos for: ${USERS.join(', ')}...\n`);
  const stats = await Promise.all(USERS.map(statsForUser));

  for (const s of stats) {
    console.log('\n' + '='.repeat(64));
    console.log(`User: ${s.user}   ${fromStr} → ${toStr}`);
    console.log('='.repeat(64));
    console.log(`  Authored & merged PRs : ${s.totalAuthored}`);
    console.log(`  Reviewed PRs (merged) : ${s.totalReviewed}`);

    const withAuthored = s.results.filter(r => r.authored.length > 0);
    if (withAuthored.length) {
      console.log('\n  Authored breakdown:');
      for (const r of withAuthored) {
        console.log(`    ${r.projectKey}/${r.repoSlug}: ${r.authored.length} PR(s)`);
        for (const pr of r.authored) {
          const d = new Date(pr.date).toISOString().slice(0, 10);
          console.log(`      #${pr.id} [${d}] ${pr.title.slice(0, 72)}`);
        }
      }
    }

    const withReviewed = s.results
      .filter(r => r.reviewedCount > 0)
      .sort((a, b) => b.reviewedCount - a.reviewedCount);
    if (withReviewed.length) {
      console.log('\n  Reviewed breakdown:');
      for (const r of withReviewed) {
        console.log(`    ${r.projectKey}/${r.repoSlug}: ${r.reviewedCount}`);
      }
    }
  }

  console.log('\n' + '='.repeat(64));
  console.log('SUMMARY');
  console.log('='.repeat(64));
  console.log('User             | Authored+Merged | Reviewed (merged)');
  console.log('-----------------|-----------------|------------------');
  for (const s of stats) {
    console.log(`${s.user.padEnd(17)}| ${String(s.totalAuthored).padEnd(16)}| ${s.totalReviewed}`);
  }
}

main().catch(console.error);
