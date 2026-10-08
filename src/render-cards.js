// Render a real plan to disk so the cards can be looked at.
import { writeFileSync, mkdirSync } from 'node:fs';
import { readdirSync, readFileSync } from 'node:fs';
import { planRotation } from './src/lib/rotation.js';
import { planPngs } from './src/lib/render.js';

const KIND_SLUG = { blog: 'blogs', playbook: 'playbook', 'thought-leadership': 'thought-leadership' };
const dir = './src/content/insights/';
const faqs = [];
for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
  const raw = readFileSync(dir + file, 'utf8');
  const fm = raw.split(/^---$/m)[1] ?? '';
  const title = (fm.match(/^title:\s*"?(.+?)"?\s*$/m) ?? [])[1] ?? file;
  const kind = (fm.match(/^kind:\s*(\S+)/m) ?? [])[1] ?? 'blog';
  const path = `/insights/${KIND_SLUG[kind] ?? 'blogs'}/${file.replace(/\.md$/, '')}`;
  const block = fm.split(/^faq:\s*$/m)[1];
  if (!block) continue;
  for (const m of block.matchAll(/^\s*-\s*q:\s*"?(.+?)"?\s*\n\s*a:\s*"?([\s\S]+?)"?\s*(?=\n\s*-\s*q:|\n\w|$)/gm)) {
    faqs.push({ q: m[1].trim(), a: m[2].trim().replace(/\s+/g, ' '), title, path });
  }
}

const OUT = './.preview-cards/';
mkdirSync(OUT, { recursive: true });

const want = process.argv[2] ?? null;
const date = process.argv[3] ?? null;
const now = date ? new Date(`${date}T09:00:00+05:30`) : new Date();

const t0 = Date.now();
const plan = await planRotation({ now, faqs, force: want });
if (!plan) { console.log('no plan'); process.exit(0); }

const pngs = await planPngs(plan);
pngs.forEach((b, i) => writeFileSync(`${OUT}${plan.kind}-${i + 1}.png`, b));

console.log(`${plan.kind}: ${pngs.length} cards in ${Date.now() - t0}ms`);
console.log('  headline:', plan.headline);
pngs.forEach((b, i) => console.log(`  ${plan.kind}-${i + 1}.png  ${(b.length / 1024).toFixed(0)} KB  ${plan.slides[i].type}`));
