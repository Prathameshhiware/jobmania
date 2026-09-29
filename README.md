# JoBmania

Job aggregator for the Indian market. Openings that are still actually open.

**Live: [jobmania.dpdns.org](https://jobmania.dpdns.org)**

This repo is the **ingestion pipeline**: it discovers openings, resolves them
against the employer's own careers board, stores structured facts in Supabase,
and retires listings that have closed. The website is a separate concern and
reads the same database.

```
source feed ──► extract facts ──► resolve on employer ATS ──► Supabase
                                                                 │
   GitHub Actions: monitor (10 min) · expire (daily) ────────────┘
```

---

## Two rules that govern everything here

**1. Facts only. Nothing is ever invented.**
A field is `NULL` when the source did not state it, and the site renders that
as "not stated". We never estimate a salary, never guess interview rounds,
never fill a gap because the layout looks better full. An empty field is the
truth; a plausible-sounding one is a lie a job seeker may act on. If you are
adding a default value to make a page look complete, stop.

**2. We take facts and an apply URL, never someone else's prose.**
The aggregator feed is a *discovery signal* — it tells us who is hiring. The
company, role, location, eligibility and apply link are facts, and facts are
not copyrightable. The article text around them belongs to whoever wrote it, is
never copied, and would not rank anyway. Descriptions come only from the
employer's own public board (Greenhouse, Lever, Ashby), which exists to be
syndicated. Where we cannot reach one, the listing stands on facts and links out.

---

## Setup

### 1. Database

Supabase project: **Jobmania**. In the SQL editor, run [`db/schema.sql`](db/schema.sql).

It creates `jobs`, `source_state` and `job_sources`, plus RLS policies. Public
read is restricted to `status = 'live'`; every write needs the service role.
Note the constraint: **a row cannot be `live` without a `valid_through` and an
apply URL.** That is the freshness contract enforced in the database rather
than trusted to application code.

### 2. Local environment

```bash
cp .env.example .env.local     # then paste your keys in
npm install
```

Keys live in *Project Settings → API*. `.env.local` is gitignored — never
commit it.

| Variable | Where it belongs |
|---|---|
| `SUPABASE_URL` | `.env.local`, GitHub secret, Vercel env |
| `SUPABASE_SERVICE_ROLE_KEY` | `.env.local` and **GitHub secret only** — bypasses RLS |
| `SUPABASE_ANON_KEY` | Vercel env only — safe for the browser, RLS restricts it |

### 3. CI secrets

*Settings → Secrets and variables → Actions* — add `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`. Without them both workflows fail on the first step.

---

## Running it

```bash
npm run backfill -- 30 dry   # extract 30 days, report, write nothing
npm run backfill -- 30       # seed the table
npm run monitor              # one poll (what CI runs every 10 minutes)
npm run expire               # deadline pass + apply-link re-check
npm run stats                # table health
```

Start with the dry run. It reports how many posts yielded a usable company and
role, how many have no apply link, and how many are walk-ins — which tells you
what the extractor is actually coping with before anything is written.

---

## How a listing becomes live

1. **Extract** — company, role, qualification, location and experience come out
   of the source's details table. Absent fields stay `NULL`.
2. **Dedupe** — on `(source, source_uid)`, then on
   `dedupe_key = company + title + city`. A second sighting is recorded in
   `job_sources` rather than duplicated.
3. **Resolve** — if the apply URL points at a known ATS, fetch the employer's
   own listing for the canonical description.
4. **Probe** — request the apply URL. A hard 404/410 means `dead_link`.
5. **Publish** — a clean, reachable listing becomes `live`. Anything with a
   scam flag or an unresolvable link waits in `needs_review` for a human.

Nothing reaches `live` automatically without a working apply route. That is
deliberate: the whole product claim is that our listings are real.

### Statuses

| Status | Meaning |
|---|---|
| `live` | Verified reachable, published |
| `needs_review` | Extracted but unresolved or flagged — awaiting a person |
| `dead_link` | Apply URL returned 404/410 |
| `expired` | Past `valid_through` |
| `rejected` | Reviewed and refused |

---

## Scheduling

`monitor.yml` runs every 10 minutes; the source publishes roughly one post per
10–15 minutes during business hours, so new openings appear here within minutes.
Actions minutes are unlimited on a public repo. GitHub's scheduler is
best-effort and can run late — the stored cursor means a late run just collects
everything it missed.

`expire.yml` runs daily at 07:00 IST.

---

## Layout

```
db/schema.sql            tables, indexes, RLS, the live-requires-expiry constraint
src/lib/normalize.js     slugs, cities, experience parsing, scam heuristics
src/lib/extract.js       source post -> structured row   ← the integrity rules live here
src/lib/ats.js           ATS identification, canonical fetch, link probing
src/lib/ingest.js        shared extract -> dedupe -> resolve -> insert pass
src/lib/supabase.js      client and cursor helpers
src/sources/             one adapter per source
src/backfill.js          one-time seed
src/monitor.js           scheduled poll
src/expire.js            freshness contract
```

## Adding a source

Write an adapter under `src/sources/` exposing `fetchPostsSince(cursor)` and a
`SOURCE_ID`, map its payload in `extract.js`, and reuse `ingestPosts`. The
dedupe key means the same opening arriving from two sources collapses to one row
with two entries in `job_sources`.

Employers' own boards are the best sources and need no discovery step:
Greenhouse (`boards-api.greenhouse.io/v1/boards/{token}/jobs?content=true`),
Lever, Ashby and SmartRecruiters all publish open JSON.

---

## The website

Astro, server-rendered, deployed on Vercel. It reads the same Supabase database
through the **anon** key, so RLS restricts every query to `status = 'live'` —
the site physically cannot serve an expired or unreviewed listing even if a
query forgets to filter.

```bash
npm run dev      # localhost:4321
npm run build    # production build
```

### Environment

| Variable | Where |
|---|---|
| `SUPABASE_URL` | `.env.local` and Vercel |
| `SUPABASE_ANON_KEY` | `.env.local` and Vercel — **anon**, never service_role |
| `SITE_URL` | Vercel only, e.g. `https://jobmania.vercel.app` |

The service_role key belongs to the ingest pipeline and GitHub Actions only. It
must never appear in the site's environment.

### Routes

| Route | Page |
|---|---|
| `/` | Home — live counts, categories, latest, cities, closing soon |
| `/jobs?q=&city=` | Search and browse all live openings |
| `/job/{slug}` | Job detail, with `JobPosting` + `BreadcrumbList` schema |
| `/c/{category}` | Just Posted, Freshers, Experienced, Remote, Walk-ins, Internships, Off-campus |
| `/city/{city}` | One page per city that has live openings |
| `/company/{slug}` | Every live opening for one employer |
| `/sitemap.xml` | Live listings only — expired pages leave the same day |
| `/robots.txt` | With the sitemap directive |

### SEO notes

`JobPosting` carries `validThrough` on every page, so Google expires a listing
even if it has not recrawled. `baseSalary` is emitted **only** when the employer
stated a figure — an invented range is a structured-data violation and a lie to
the reader. `hiringOrganization` is the actual employer, never JoBmania.
Facet pages with fewer than three results are `noindex` so thin pages never
enter the index.
