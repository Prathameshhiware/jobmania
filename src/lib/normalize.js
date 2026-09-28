// Pure helpers. Every function here either derives a value from text that is
// present, or returns null. Nothing is guessed.

export const DEFAULT_TTL_DAYS = 45;

export function slugify(s, max = 70) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/g, '');
}

// Short, stable, URL-safe id derived from the source identity.
export function shortId(source, sourceUid) {
  let h = 2166136261;
  for (const ch of `${source}:${sourceUid}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(36).padStart(7, '0').slice(0, 7);
}

export function dedupeKey(company, title, city) {
  const norm = (s) => slugify(s, 120).replace(/-/g, '');
  return [norm(company), norm(title), norm(city ?? '')].join('|');
}

export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&rsquo;|&#8217;/gi, '’').replace(/&ndash;|&#8211;/gi, '–')
    .replace(/&mdash;|&#8212;/gi, '—');
}

export function stripTags(html) {
  return decodeEntities(String(html ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
}

const CITIES = [
  ['Hyderabad', /hyderabad|secunderabad/i],
  ['Bengaluru', /bengaluru|bangalore/i],
  ['Chennai',   /chennai|madras/i],
  ['Mumbai',    /mumbai|bombay|navi mumbai|thane/i],
  ['Delhi NCR', /delhi|gurgaon|gurugram|noida|ncr|faridabad|ghaziabad/i],
  ['Pune',      /\bpune\b|pimpri/i],
  ['Kolkata',   /kolkata|calcutta/i],
  ['Ahmedabad', /ahmedabad|gandhinagar/i],
  ['Kochi',     /kochi|cochin|ernakulam/i],
  ['Coimbatore',/coimbatore/i],
  ['Visakhapatnam', /visakhapatnam|vizag/i],
  ['Jaipur',    /jaipur/i],
  ['Indore',    /indore/i],
  ['Chandigarh',/chandigarh|mohali/i],
  ['Lucknow',   /lucknow/i],
  ['Bhubaneswar', /bhubaneswar/i],
  ['Guwahati',  /guwahati/i],
  ['Mysore',    /mysore|mysuru/i],
  ['Nagpur',    /nagpur/i],
  ['Trivandrum',/trivandrum|thiruvananthapuram/i],
];

// Returns every recognised city, in the order they appear. [] when none match.
export function parseLocations(text) {
  if (!text) return [];
  const found = [];
  for (const [name, re] of CITIES) if (re.test(text) && !found.includes(name)) found.push(name);
  return found;
}

export function isRemote(text) {
  return /work\s*from\s*home|\bremote\b|\bwfh\b/i.test(String(text ?? ''));
}

// "0-5 years" -> {min:0,max:5}. "2+ years" -> {min:2,max:null}. Unparseable -> nulls.
export function parseExperience(text) {
  const t = String(text ?? '').toLowerCase();
  if (!t) return { min: null, max: null };
  if (/fresher/.test(t) && !/\d/.test(t)) return { min: 0, max: 1 };

  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:-|–|to)\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: +m[1], max: +m[2] };

  m = t.match(/(\d+(?:\.\d+)?)\s*\+/);
  if (m) return { min: +m[1], max: null };

  m = t.match(/(?:min(?:imum)?|above|over)\s*(\d+(?:\.\d+)?)/);
  if (m) return { min: +m[1], max: null };

  m = t.match(/(\d+(?:\.\d+)?)\s*(?:year|yr)/);
  if (m) return { min: +m[1], max: +m[1] };

  return { min: null, max: null };
}

export function experienceLevel(min, max) {
  if (min == null && max == null) return null;
  const lo = min ?? 0;
  if ((max ?? lo) <= 1) return 'fresher';
  if (lo < 2) return '0-2';
  if (lo < 5) return '2-5';
  if (lo < 10) return '5-10';
  return '10+';
}

// Graduation years explicitly named in the text. [] when none.
export function parseBatches(text) {
  const years = new Set();
  const now = new Date().getFullYear();
  for (const m of String(text ?? '').matchAll(/\b(20\d{2})\b/g)) {
    const y = +m[1];
    if (y >= now - 6 && y <= now + 2) years.add(y);
  }
  return [...years].sort();
}

export function hiringType({ title = '', categories = [], body = '' }) {
  const hay = `${title} ${categories.join(' ')}`.toLowerCase();
  if (/walk[\s-]?in/.test(hay) || /walk[\s-]?in\s+(drive|interview)/i.test(body)) return 'walk-in';
  if (/intern(ship)?\b/.test(hay)) return 'internship';
  if (/off[\s-]?campus|campus\s+(drive|hiring)/.test(hay)) return 'off-campus';
  return 'regular';
}

export function ttl(postedAt, days = DEFAULT_TTL_DAYS) {
  return new Date(new Date(postedAt).getTime() + days * 864e5).toISOString();
}

// Listings that ask candidates for money, or route through a personal address.
export function scamFlags(text, applyUrl) {
  const t = String(text ?? '').toLowerCase();
  const flags = [];
  if (/registration\s*fee|security\s*deposit|training\s*(charge|fee)|pay\s*(?:rs\.?|₹)\s*\d/.test(t))
    flags.push('asks-for-money');
  if (/refundable/.test(t) && /\b(fee|amount|deposit)\b/.test(t)) flags.push('refundable-amount');
  if (/@(gmail|yahoo|outlook|hotmail|rediffmail)\.com/i.test(t)) flags.push('free-email-contact');
  if (applyUrl && /^https?:\/\/(t\.me|wa\.me|api\.whatsapp)/i.test(applyUrl)) flags.push('messaging-only-apply');
  return flags;
}
