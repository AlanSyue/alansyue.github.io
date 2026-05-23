const fs = require('fs');
const path = require('path');
const { parse } = require('node-html-parser');
const TurndownService = require('turndown');

const ROOT = path.resolve(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'source', '_posts');
const IMAGES_DIR = path.join(ROOT, 'source', 'images');
const SOURCE_DIR = '/Users/alanhsueh/Desktop/medium-export-499b2412d9a3e523929ad9478f5db0c3095084cc9effc485b1e23f8720775960/posts';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchBuffer(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

function pickExtFromImageId(imageId) {
  const m = imageId.match(/\.(png|jpe?g|gif|webp)$/i);
  if (m) return m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
  return 'png';
}

function extractHash(canonical) {
  if (!canonical) return null;
  const m = canonical.match(/-([0-9a-f]{8,16})(?:[?/#]|$)/);
  return m ? m[1] : null;
}

function cleanText(s) {
  if (!s) return '';
  return s
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, '')
    .replace(/[\u200b-\u200f\u202a-\u202e\u2060-\u206f\ufeff]/g, '')
    .trim();
}

function escapeYamlTitle(s) {
  return `'${s.replace(/'/g, "''")}'`;
}

function formatDate(iso) {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return { date: '', datetime: '' };
  return {
    date: `${m[1]}-${m[2]}-${m[3]}`,
    datetime: `${m[1]}-${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`,
  };
}

function transformIframes(bodyNode) {
  bodyNode.querySelectorAll('figure').forEach((fig) => {
    const ifr = fig.querySelector('iframe');
    if (!ifr) return;
    const src = ifr.getAttribute('src') || '';
    let target = src;
    const yt = src.match(/youtube\.com\/embed\/([A-Za-z0-9_-]+)/);
    if (yt) {
      target = `https://www.youtube.com/watch?v=${yt[1]}`;
    }
    if (target) {
      fig.replaceWith(parse(`<p><a href="${target}">${target}</a></p>`));
    } else {
      fig.remove();
    }
  });
}

function transformMixtapeEmbeds(bodyNode) {
  bodyNode.querySelectorAll('div.graf--mixtapeEmbed, .mixtapeEmbed').forEach((card) => {
    const a = card.querySelector('a');
    if (!a) {
      card.remove();
      return;
    }
    const href = a.getAttribute('href') || '';
    const strong = card.querySelector('strong');
    const title = (strong ? strong.textContent : a.textContent || href).trim() || href;
    card.replaceWith(parse(`<p><a href="${href}">${escapeHtml(title)}</a></p>`));
  });
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function transformFigures(bodyNode) {
  bodyNode.querySelectorAll('figure').forEach((fig) => {
    const img = fig.querySelector('img');
    const figcap = fig.querySelector('figcaption');
    if (!img) {
      if (figcap) {
        fig.replaceWith(parse(`<p><em>${figcap.innerHTML}</em></p>`));
      } else {
        fig.remove();
      }
      return;
    }
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || (figcap ? figcap.textContent.trim() : '');
    let html = `<p><img src="${src}" alt="${escapeHtml(alt)}"></p>`;
    if (figcap) {
      html += `\n<p><em>${figcap.innerHTML}</em></p>`;
    }
    fig.replaceWith(parse(html));
  });
}

async function downloadImages(bodyNode, hash) {
  const imgs = bodyNode.querySelectorAll('img');
  if (imgs.length === 0) return { count: 0, failed: 0 };
  const imgDir = path.join(IMAGES_DIR, hash);
  fs.mkdirSync(imgDir, { recursive: true });
  let idx = 0;
  let failed = 0;
  for (const img of imgs) {
    idx += 1;
    let imageId = img.getAttribute('data-image-id') || '';
    const src = img.getAttribute('src') || '';
    if (!imageId && src) {
      const m = src.match(/\/([0-9]\*[A-Za-z0-9_.-]+)$/);
      if (m) imageId = m[1];
    }
    if (!imageId) {
      const m = src.match(/\/([^/?]+)(?:\?|$)/);
      if (m) imageId = m[1];
    }
    const ext = pickExtFromImageId(imageId || src);
    const dlUrl = imageId
      ? `https://miro.medium.com/v2/resize:fit:1600/${imageId}`
      : src;
    const destName = `${idx}.${ext}`;
    const destPath = path.join(imgDir, destName);
    try {
      const buf = await fetchBuffer(dlUrl);
      fs.writeFileSync(destPath, buf);
      img.setAttribute('src', `/images/${hash}/${destName}`);
      img.removeAttribute('srcset');
      img.removeAttribute('data-src');
      img.removeAttribute('data-image-id');
      await sleep(80);
    } catch (err) {
      failed += 1;
      console.warn(`  ! image ${idx} failed (${dlUrl}): ${err.message}`);
    }
  }
  return { count: idx - failed, failed, total: idx };
}

function buildTurndown() {
  const td = new TurndownService({
    headingStyle: 'atx',
    codeBlockStyle: 'fenced',
    bulletListMarker: '-',
    emDelimiter: '*',
    fence: '```',
  });
  td.addRule('preBlock', {
    filter: (node) => node.nodeName === 'PRE',
    replacement: function (content, node) {
      let html = node.innerHTML || '';
      html = html.replace(/<br\s*\/?>/gi, '\n');
      const tmp = parse('<div>' + html + '</div>');
      tmp.querySelectorAll('a').forEach((a) => {
        const t = a.textContent || '';
        a.replaceWith(t);
      });
      let text = tmp.textContent || '';
      text = text.replace(/\r\n/g, '\n').replace(/ /g, ' ');
      text = text.replace(/^\n+/, '').replace(/\n+$/, '');
      return '\n\n```\n' + text + '\n```\n\n';
    },
  });
  return td;
}

async function processFile(filename) {
  const filePath = path.join(SOURCE_DIR, filename);
  const html = fs.readFileSync(filePath, 'utf8');
  const root = parse(html);

  let title = '';
  const h1 = root.querySelector('h1.p-name');
  if (h1) title = (h1.textContent || '').trim();
  if (!title) {
    const t = root.querySelector('title');
    if (t) title = (t.textContent || '').trim();
  }
  title = cleanText(title);

  const timeEl = root.querySelector('time.dt-published');
  const iso = timeEl ? timeEl.getAttribute('datetime') : null;
  if (!iso) throw new Error('no datetime');
  const { date, datetime } = formatDate(iso);

  const canonEl = root.querySelector('a.p-canonical');
  const canonical = canonEl ? canonEl.getAttribute('href') : '';
  const hash = extractHash(canonical);
  if (!hash) throw new Error('no hash in canonical');

  const outPath = path.join(POSTS_DIR, `${date}-${hash}.md`);
  if (fs.existsSync(outPath)) {
    return { status: 'skip-exists', hash, date, title };
  }

  const subtitleEl = root.querySelector('section[data-field="subtitle"]');
  let subtitle = subtitleEl ? (subtitleEl.textContent || '').trim() : '';

  const body = root.querySelector('section[data-field="body"]');
  if (!body) throw new Error('no body section');

  body.querySelectorAll('script, style, noscript').forEach((el) => el.remove());

  const firstHeading = body.querySelector('h1, h2, h3, h4');
  if (firstHeading) {
    const ht = (firstHeading.textContent || '').trim();
    if (ht && (ht === title || title.includes(ht) || ht.includes(title))) {
      firstHeading.remove();
    }
  }

  transformMixtapeEmbeds(body);
  transformIframes(body);
  transformFigures(body);

  const imgResult = await downloadImages(body, hash);

  const td = buildTurndown();
  let md = td.turndown(body.toString());
  md = md.replace(/\n{3,}/g, '\n\n').trim();

  const frontParts = [
    '---',
    `title: ${escapeYamlTitle(title)}`,
    `date: ${datetime}`,
    `slug: ${hash}`,
    'tags: []',
    `original_url: ${canonical}`,
    '---',
    '',
    `> 本文最初發表於 [Medium](${canonical})，已搬運至個人 blog。`,
    '',
  ];
  if (subtitle) {
    frontParts.push(`*${subtitle}*`, '');
  }
  const out = frontParts.join('\n') + md + '\n';
  fs.writeFileSync(outPath, out);
  return { status: 'ok', hash, date, title, images: imgResult };
}

if (require.main !== module) {
  module.exports = {};
} else {
(async () => {
  fs.mkdirSync(POSTS_DIR, { recursive: true });
  fs.mkdirSync(IMAGES_DIR, { recursive: true });

  const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.html') && !f.startsWith('draft_'));
  files.sort();
  console.log(`Found ${files.length} non-draft html files.`);

  let okCount = 0;
  let skipCount = 0;
  let failCount = 0;
  let imgTotal = 0;
  let imgFailTotal = 0;
  const failures = [];
  const titleWarnings = [];

  for (const f of files) {
    try {
      const r = await processFile(f);
      if (r.status === 'ok') {
        okCount += 1;
        if (r.images) {
          imgTotal += r.images.count;
          imgFailTotal += r.images.failed;
        }
        console.log(`[ok] ${r.date} ${r.hash} ${r.title}`);
        if (!r.title || r.title.length < 2 || /^[-\s]+$/.test(r.title)) {
          titleWarnings.push(`${r.hash}: "${r.title}"`);
        }
      } else if (r.status === 'skip-exists') {
        skipCount += 1;
        console.log(`[skip] ${r.date} ${r.hash} already exists`);
      }
    } catch (err) {
      failCount += 1;
      failures.push({ file: f, reason: err.message });
      console.log(`[fail] ${f} ${err.message}`);
    }
  }

  console.log('\n=== summary ===');
  console.log(`ok: ${okCount}, skip: ${skipCount}, fail: ${failCount}`);
  console.log(`images downloaded: ${imgTotal}, image failures: ${imgFailTotal}`);
  if (failures.length) {
    console.log('\nfailures:');
    failures.forEach((f) => console.log(`  ${f.file}: ${f.reason}`));
  }
  if (titleWarnings.length) {
    console.log('\ntitle warnings:');
    titleWarnings.forEach((w) => console.log(`  ${w}`));
  }
})();
}
