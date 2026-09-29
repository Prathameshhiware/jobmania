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
  home: (c) => `${SITE_NAME} — ${n(c)} Verified Job Openings in India | Freshers, Walk-ins, Remote`,

  city: (city, c) => `Jobs in ${city} — ${n(c)} Verified Openings | ${SITE_NAME}`,

  // `phrase` is already a full noun phrase ("Walk In Interviews"), so nothing
  // is appended to it.
  category: (phrase, c) => `${phrase} in India — ${n(c)} Live Openings | ${SITE_NAME}`,

  // The highest-intent pattern in this market: city + type.
  cityCategory: (city, phrase, c) => `${phrase} in ${city} — ${n(c)} Openings Today | ${SITE_NAME}`,

  company: (name, c) => `${name} Careers — ${n(c)} Open Roles in India | ${SITE_NAME}`,

  job: (title, company, city) =>
    `${title} at ${company}${city ? ` — ${city}` : ''} | ${SITE_NAME}`,

  jobClosed: (title, company) => `${title} at ${company} — Closed | ${SITE_NAME}`,

  search: (q, city) =>
    q ? `${q}${city ? ` in ${city}` : ''} Jobs — Search Results | ${SITE_NAME}`
      : `All Job Openings in India | ${SITE_NAME}`,
};

/* --------------------------------------------------------- descriptions --- */
// Each leads with the count and the verification claim, because those are the
// two things that differentiate a result in a crowded SERP.

export const descriptions = {
  home: (c, today) =>
    `Browse ${n(c)} verified job openings across India — freshers, walk-in interviews, ` +
    `off-campus drives, internships and work-from-home roles. Every listing is re-checked ` +
    `daily against the employer's own careers page${today ? `, with ${n(today)} added today` : ''}. ` +
    `Closed jobs are removed, never left up.`,

  city: (city, c, types) =>
    `${n(c)} verified job openings in ${city}${types ? ` — ${types}` : ''}. ` +
    `Each apply link is tested daily and closed roles are removed within 24 hours, ` +
    `so every listing you see in ${city} is genuinely still open.`,

  category: (label, blurb, c) => `${n(c)} live ${label.toLowerCase()} openings across India. ${blurb}`,

  cityCategory: (city, label, c) =>
    `${n(c)} ${label.toLowerCase()} openings in ${city}, verified against each employer's ` +
    `own careers page and re-checked daily. Venue, timing and eligibility shown where the ` +
    `employer published them.`,

  company: (name, c, cities) =>
    `${n(c)} current openings at ${name}${cities ? ` across ${cities}` : ''}. ` +
    `We link to ${name}'s own application pages and remove roles once they close. ` +
    `Not affiliated with ${name}.`,

  job: (fact, company, verified) =>
    `${fact} Apply on ${company}'s official page. Verified ${verified}.`,

  jobClosed: (reason, company, city) =>
    `${reason} This ${company} opening is no longer accepting applications. ` +
    `See what is currently open${city ? ` in ${city}` : ''} on ${SITE_NAME}.`,
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
