// Titles, descriptions and structured data.
//
// Keyword shape is derived from how this market actually searches — observed
// from the category taxonomy and post-title patterns of the incumbent site,
// which has ten thousand posts of evidence behind it. The dominant query forms
// are: "<role> jobs in <city>", "walk in interview in <city>",
// "<company> careers", "fresher jobs <city>", "off campus drive <year>",
// "work from home jobs". Every page type below is written to match one of them.
//
// No invented figures anywhere: counts come from the database, and nothing
// claims a rating, a review count or a salary the employer did not state.

export const SITE_NAME = 'JoBmania';
export const TAGLINE = 'Job openings that are still actually open';

const n = (v) => Number(v ?? 0).toLocaleString('en-IN');

/* ------------------------------------------------------------- titles --- */

export const titles = {
  /*
   * Leads with walk-ins rather than "jobs in India", and puts the brand last.
   *
   * Two reasons. "Jobs in India" is held by Naukri, Indeed, LinkedIn and Shine;
   * a domain this new does not take that phrase from them at any point in the
   * next year, and pointing the homepage at it means ranking for nothing.
   * Walk-in interviews are 177 of the 447 listings we have handled, the largest
   * single category, and the sites competing on that phrase are far weaker.
   *
   * The brand moved to the end because nobody is searching for it yet. The
   * first words of a title are the most valuable thing on the page and they
   * were being spent on a name with no demand behind it.
   *
   * No count in the title either: it pushed the old one to 74 characters, past
   * the ~60 Google renders, so the differentiators were cut off in results.
   */
  home: () => `Walk-In Interviews & Fresher Jobs in India | ${SITE_NAME}`,

  city: (city, c) => `Jobs in ${city}: ${n(c)} Verified Openings | ${SITE_NAME}`,

  // `phrase` is already a full noun phrase ("Walk In Interviews"), so nothing
  // is appended to it.
  category: (phrase, c) => `${phrase} in India: ${n(c)} Live Openings | ${SITE_NAME}`,

  // The highest-intent pattern in this market: city + type.
  cityCategory: (city, phrase, c) => `${phrase} in ${city}: ${n(c)} Openings Today | ${SITE_NAME}`,

  company: (name, c) => `${name} Careers: ${n(c)} Open Roles in India | ${SITE_NAME}`,

  job: (title, company, city) =>
    `${title} at ${company}${city ? `, ${city}` : ''} | ${SITE_NAME}`,

  jobClosed: (title, company) => `${title} at ${company}, Closed | ${SITE_NAME}`,

  search: (q, city) =>
    q ? `${q}${city ? ` in ${city}` : ''} Jobs, Search Results | ${SITE_NAME}`
      : `All Job Openings in India | ${SITE_NAME}`,

  allJobs: (c) => `All Job Openings in India: ${n(c)} Live Vacancies Today | ${SITE_NAME}`,

  cityOnly: (city, c) => `Jobs in ${city}: ${n(c)} Verified Openings Hiring Now | ${SITE_NAME}`,
};

/* --------------------------------------------------------- descriptions --- */
// Each leads with the count and the verification claim, because those are the
// two things that differentiate a result in a crowded SERP.

/**
 * Google renders roughly 155 characters before it truncates, and a description
 * cut off mid-word reads as carelessness on a page asking someone to trust it.
 *
 * Every description here is assembled from live counts, city names and category
 * clauses, so a template that fits today overflows the moment a city with a
 * longer name leads the list. This is the backstop, not the first defence: the
 * templates below are written short, and this catches the rest. It prefers to
 * end on a sentence, falls back to a word boundary, and never leaves dangling
 * punctuation.
 */
const LIMIT = 155;
const clamp = (text) => {
  const t = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (t.length <= LIMIT) return t;
  const cut = t.slice(0, LIMIT);
  const sentence = cut.lastIndexOf('. ');
  if (sentence > 95) return cut.slice(0, sentence + 1);
  const space = cut.lastIndexOf(' ');
  return (space > 95 ? cut.slice(0, space) : cut).replace(/[,;:.\s]+$/, '') + '…';
};

export const descriptions = {
  // The count lives here rather than in the title: a description has room for
  // it, and a real number is the thing that separates this from every other
  // job site making the same claim.
  home: (c) =>
    clamp(`${n(c)} live jobs in India: walk-in interviews, fresher jobs, off-campus drives and ` +
      `work from home. Re-checked daily, closed jobs removed.`),

  city: (city, c, types) =>
    clamp(`${n(c)} verified job openings in ${city}${types ? `, ${types}` : ''}. ` +
      `Apply links tested daily and closed roles removed within 24 hours.`),

  // `phrase` is already a noun phrase — appending "openings" to it produced
  // "walk in interviews openings", so nothing is appended.
  category: (phrase, detail, c) =>
    clamp(`${n(c)} live ${phrase.toLowerCase()} across India, verified against the employer's ` +
      `own careers page. ${detail}`),

  // `detail` is the category's own clause, so a freshers page no longer talks
  // about venues and a walk-in page still does.
  cityCategory: (city, phrase, detail, c) =>
    clamp(`${n(c)} ${phrase.toLowerCase()} in ${city}, verified against the employer's own ` +
      `careers page. ${detail}`),

  allJobs: (c, cities) =>
    clamp(`All ${n(c)} job openings live on ${SITE_NAME}, newest first` +
      `${cities ? `, across ${cities}` : ''}. Apply links tested daily, closed roles removed.`),

  company: (name, c, cities) =>
    clamp(`${n(c)} current openings at ${name}${cities ? ` across ${cities}` : ''}. ` +
      `We link to ${name}'s own application pages. Not affiliated with ${name}.`),

  job: (fact, company, verified) =>
    clamp(`${fact} Apply on ${company}'s official page. Verified ${verified}.`),

  jobClosed: (reason, company, city) =>
    clamp(`${reason} This ${company} opening is no longer accepting applications. ` +
      `See what is open${city ? ` in ${city}` : ''} on ${SITE_NAME}.`),
};

/* -------------------------------------------------------------- schema --- */

export function organizationSchema(origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': `${origin}/#organization`,
    name: SITE_NAME,
    url: `${origin}/`,
    logo: { '@type': 'ImageObject', url: `${origin}/icon.svg`, width: 512, height: 512 },
    description:
      'A job listing service for India that verifies every opening against the employer\'s ' +
      'own careers page daily and removes listings once they close.',
    areaServed: { '@type': 'Country', name: 'India' },
  };
}

export function websiteSchema(origin) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${origin}/#website`,
    name: SITE_NAME,
    url: `${origin}/`,
    description: TAGLINE,
    publisher: { '@id': `${origin}/#organization` },
    inLanguage: 'en-IN',
    // enables the sitelinks search box
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${origin}/jobs?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
}

export function breadcrumbSchema(origin, trail) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((t, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: t.name,
      ...(t.path ? { item: `${origin}${t.path}` } : {}),
    })),
  };
}

/** A listing page: the roles it holds, in order, as an ItemList. */
export function itemListSchema(origin, jobs, { name, description } = {}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    description,
    numberOfItems: jobs.length,
    itemListElement: jobs.slice(0, 50).map((j, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${origin}/job/${j.slug}`,
      name: `${j.title} at ${j.company_name}`,
    })),
  };
}

export function collectionPageSchema(origin, { path, name, description }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${origin}${path}#page`,
    url: `${origin}${path}`,
    name,
    description,
    isPartOf: { '@id': `${origin}/#website` },
    inLanguage: 'en-IN',
  };
}

/** Only ever built from questions the page genuinely answers. */
export function faqSchema(pairs) {
  const clean = pairs.filter((p) => p && p.q && p.a);
  if (!clean.length) return null;
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: clean.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  };
}

/** Strips undefined so JSON-LD never carries empty keys. */
export const clean = (o) => JSON.parse(JSON.stringify(o));
