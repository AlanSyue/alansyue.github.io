const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const MEDIUM_DIR = '/Users/alanhsueh/Desktop/medium-export-499b2412d9a3e523929ad9478f5db0c3095084cc9effc485b1e23f8720775960/posts';

function isMediumHash(s) {
  return typeof s === 'string' && /^[0-9a-f]{8,16}$/.test(s);
}

function readFrontMatter(content) {
  const m = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return null;
  const block = m[1];
  const lines = block.split('\n');
  const fields = {};
  for (const line of lines) {
    const mm = line.match(/^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$/);
    if (mm) {
      fields[mm[1]] = mm[2];
    }
  }
  return { raw: m[0], block, fields, body: content.slice(m[0].length) };
}

function findMediumHtmlFile(hash) {
  const files = fs.readdirSync(MEDIUM_DIR);
  for (const f of files) {
    if (!f.endsWith('.html')) continue;
    if (f.startsWith('draft_')) continue;
    const base = f.slice(0, -5);
    if (base.endsWith(`-${hash}`)) return path.join(MEDIUM_DIR, f);
  }
  return null;
}

function extractIso(html) {
  const m = html.match(/<time[^>]*class="[^"]*dt-published[^"]*"[^>]*datetime="([^"]+)"/);
  if (m) return m[1];
  const m2 = html.match(/<time[^>]*datetime="([^"]+)"[^>]*class="[^"]*dt-published[^"]*"/);
  if (m2) return m2[1];
  return null;
}

function toTaipei(iso) {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t) => parts.find((p) => p.type === t).value;
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  return { date, datetime: `${date} ${time}` };
}

function replaceDateLine(raw, newDate) {
  return raw.replace(/^date:\s*.*$/m, `date: ${newDate}`);
}

const files = fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md'));
files.sort();

let total = 0;
let same = 0;
let timeOnly = 0;
let dateChanged = 0;
let skipped = 0;
let errors = 0;
const renamed = [];

for (const f of files) {
  const filePath = path.join(POSTS_DIR, f);
  const content = fs.readFileSync(filePath, 'utf8');
  const fm = readFrontMatter(content);
  if (!fm) { skipped += 1; continue; }
  const slug = fm.fields.slug;
  if (!isMediumHash(slug)) { skipped += 1; continue; }

  const htmlPath = findMediumHtmlFile(slug);
  if (!htmlPath) {
    console.log(`[miss] ${f} no medium html for slug ${slug}`);
    errors += 1;
    continue;
  }
  const html = fs.readFileSync(htmlPath, 'utf8');
  const iso = extractIso(html);
  if (!iso) {
    console.log(`[miss] ${f} no datetime in ${path.basename(htmlPath)}`);
    errors += 1;
    continue;
  }

  const { date: newDate, datetime: newDatetime } = toTaipei(iso);
  const oldDatetime = fm.fields.date;

  const fnameMatch = f.match(/^(\d{4}-\d{2}-\d{2})-([0-9a-f]+)\.md$/);
  if (!fnameMatch) {
    console.log(`[skip] ${f} unexpected filename`);
    skipped += 1;
    continue;
  }
  const oldDate = fnameMatch[1];

  total += 1;

  const newRaw = replaceDateLine(fm.raw, newDatetime);
  const newContent = newRaw + fm.body;

  if (newDate !== oldDate) {
    const newFilename = `${newDate}-${slug}.md`;
    const newPath = path.join(POSTS_DIR, newFilename);
    fs.writeFileSync(filePath, newContent);
    fs.renameSync(filePath, newPath);
    console.log(`[date+time] ${f} -> ${newFilename}  ${oldDatetime} -> ${newDatetime}`);
    dateChanged += 1;
    renamed.push({ from: f, to: newFilename });
  } else if (oldDatetime !== newDatetime) {
    fs.writeFileSync(filePath, newContent);
    const oldTime = (oldDatetime || '').split(' ')[1] || '';
    const newTime = newDatetime.split(' ')[1];
    console.log(`[time] ${f} ${oldTime} -> ${newTime}`);
    timeOnly += 1;
  } else {
    console.log(`[same] ${f}`);
    same += 1;
  }
}

console.log('\n=== summary ===');
console.log(`processed: ${total}`);
console.log(`same: ${same}`);
console.log(`time-only changes: ${timeOnly}`);
console.log(`date+time changes (renamed): ${dateChanged}`);
console.log(`skipped (non-medium): ${skipped}`);
console.log(`errors: ${errors}`);
if (renamed.length) {
  console.log('\nrenamed files:');
  renamed.forEach((r) => console.log(`  ${r.from} -> ${r.to}`));
}
