const fs = require('fs'), p = require('path');
const base = p.join(__dirname, '..', 'data', 'cache');

function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

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

const cur = currentMonth();
let deleted = 0;

for (const f of walk(base)) {
  const norm = f.split(p.sep).join('/');
  if (!norm.includes('/merged-prs/')) continue;

  // Extract month from path like .../data/cache/2026-04/merged-prs/...
  const monthMatch = norm.match(/\/(\d{4}-\d{2})\/merged-prs\//);
  if (!monthMatch) continue;
  const month = monthMatch[1];

  // Only delete closed months (not current month — delta cursor is still useful)
  if (month >= cur) continue;

  try {
    const d = JSON.parse(fs.readFileSync(f, 'utf8'));
    const prs = Array.isArray(d) ? d : (d.prs ?? []);
    if (prs.length === 0) {
      fs.unlinkSync(f);
      deleted++;
      console.log(`  deleted: ${norm.split('/data/cache/')[1]}`);
    }
  } catch (e) {}
}

console.log(`\nDeleted ${deleted} empty merged-PR cache files.`);
