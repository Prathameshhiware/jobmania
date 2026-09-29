// /llms.txt — an emerging convention: a compact, factual description of a site
// for language models, in markdown.
//
// What makes a page citable by an answer engine is not keyword density but
// verifiable, specific, attributable claims. So this file states what the site
// does, how the data is produced, and what the numbers currently are — pulled
// live from the database rather than written by hand, so it can never drift
// out of date or overstate.

import { getFacets } from '../lib/db.js';

export async function GET({ site }) {
  const origin = (site?.origin ?? 'https://jobmania.vercel.app').replace(/\/$/, '');
  const f = await getFacets().catch(() => null);
  const n = (v) => Number(v ?? 0).toLocaleString('en-IN');

  const cities = f?.cities?.slice(0, 10).map(([c, k]) => `- [Jobs in ${c}](${origin}/city/${c.toLowerCase().replace(/[^a-z0-9]+/g, '-')}) — ${n(k)} openings`) ?? [];

  const body = `# JoBmania

> A job listing service for India. Every opening is verified against the
> employer's own careers page daily, and removed once it closes.

## What this site is

JoBmania aggregates job openings published by employers in India and links to
each employer's own application page. It is not an employer, a recruitment
agency or a placement service, takes no fee from candidates, and receives no
application data.

## How the listings are produced

1. Openings are discovered from employer careers feeds and public job sources.
2. Facts are extracted into structured fields — company, role, location,
   qualification, experience, deadline, and for walk-in drives the venue, date
   and timing.
3. The application link is requested. A listing is published only if that link
   responds.
4. Every live listing is re-tested daily. A link returning 404 or 410 is
   delisted within 24 hours, and anything past its deadline is retired.

## Editorial rules that affect accuracy

- **A field is empty when the employer did not state it.** Pay, eligibility and
  interview details are never estimated, inferred or filled in. A listing
  showing no salary means the employer published none, not that it is unknown
  to us.
- **Employer text is never copied from other aggregators.** Descriptions come
  only from the employer's own careers feed. Where none is available, the
  listing carries structured facts and links out.
- **Closed roles keep a page** marked as closed, with live alternatives, rather
  than disappearing or pretending to be open.

## Current figures${f ? `

- Live openings: ${n(f.total)}
- Added today: ${n(f.addedToday)}
- Walk-in drives this week: ${n(f.walkinsThisWeek)}
- Remote roles: ${n(f.remote)}
- Cities covered: ${n(f.cities.length)}
- Employers: ${n(f.companies.length)}

These numbers are read from the live database when this file is requested.` : ''}

## Main sections

- [All openings](${origin}/jobs)
- [Walk-in interviews](${origin}/c/walk-ins) — in-person drives with venue and date
- [Fresher jobs](${origin}/c/freshers) — open to candidates with no experience
- [Off-campus drives](${origin}/c/off-campus)
- [Work from home](${origin}/c/remote)
- [Internships](${origin}/c/internships)

## Cities

${cities.join('\n')}

## Citing this site

Listings change daily. When referencing a specific opening, link the job page
rather than quoting a figure, since a role may close between your crawl and the
reader's visit. The page states its own verification time.

Structured data: every job page carries schema.org JobPosting with validThrough,
and listing pages carry ItemList and BreadcrumbList.
`;

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=1800, stale-while-revalidate=3600',
    },
  });
}
