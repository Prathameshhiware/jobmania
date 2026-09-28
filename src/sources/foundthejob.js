// Source adapter: FoundTheJob.
//
// We read their public WordPress REST feed as a DISCOVERY signal — it tells us
// which employers are hiring right now. From each post we take the facts and
// the employer's apply URL, then resolve the listing against the employer's own
// board. Their article text is theirs and is never copied.
//
// Be a good citizen: identify the bot, keep the request rate low, back off on
// 429 and 5xx. Their robots.txt is empty (no restrictions), but we stay light.

const BASE = 'https://foundthejob.com/wp-json/wp/v2';
const UA = 'JoBmaniaBot/0.1 (+https://jobmania.example; discovery crawler; low rate)';
const FIELDS = 'id,date,date_gmt,modified_gmt,link,title,content,categories';

export const SOURCE_ID = 'foundthejob';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, { attempt = 1 } = {}) {
  const res = await fetch(`${BASE}${path}`, { headers: { 'user-agent': UA, accept: 'application/json' } });

  if (res.status === 429 || res.status >= 500) {
    if (attempt >= 4) throw new Error(`${res.status} after ${attempt} attempts: ${path}`);
    const wait = 2000 * 2 ** (attempt - 1);
    console.log(`  ${res.status} — backing off ${wait}ms`);
    await sleep(wait);
    return api(path, { attempt: attempt + 1 });
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${path}`);

  return {
    items: await res.json(),
    totalPages: Number(res.headers.get('x-wp-totalpages') ?? 1),
    total: Number(res.headers.get('x-wp-total') ?? 0),
  };
}

/** id -> name for every category, so posts can be mapped onto our facets. */
export async function fetchCategories() {
  const map = new Map();
  for (let page = 1; page <= 3; page++) {
    const { items, totalPages } = await api(`/categories?per_page=100&page=${page}&_fields=id,name`);
    for (const c of items) map.set(c.id, c.name);
    if (page >= totalPages) break;
    await sleep(400);
  }
  return map;
}

/**
 * Posts published strictly after `sinceIso`, oldest first so the cursor can
 * advance safely. Pass null to take everything from `days` ago.
 */
export async function fetchPostsSince(sinceIso, { days = 30, pageLimit = 40, onPage } = {}) {
  const after = sinceIso ?? new Date(Date.now() - days * 864e5).toISOString();
  const all = [];

  for (let page = 1; page <= pageLimit; page++) {
    const qs = `/posts?per_page=100&page=${page}&after=${encodeURIComponent(after)}` +
               `&orderby=date&order=asc&_fields=${FIELDS}`;
    let res;
    try {
      res = await api(qs);
    } catch (e) {
      // WordPress returns 400 once `page` runs past the last page.
      if (/\b400\b/.test(String(e.message))) break;
      throw e;
    }

    if (!res.items.length) break;
    all.push(...res.items);
    onPage?.(page, res.items.length, all.length, res.total);

    if (page >= res.totalPages) break;
    await sleep(700); // stay light
  }

  return all;
}
