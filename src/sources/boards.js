// Employer job boards we pull from, and nothing else.
//
// Every token here was tested before it was added: the board exists, it answers
// the public API, and it had at least one role in India at the time of writing.
// The `india` figure is what it held on that date — it moves constantly and is
// recorded only so a board that quietly empties out is noticeable.
//
// Why a hand-kept list rather than a search. There is no directory of
// Greenhouse boards, and guessing tokens returns a 404 far more often than a
// board. More importantly, a curated list is the thing that makes the listings
// trustworthy: every company on it is one a person chose, so a job that reaches
// the site came from an employer we decided to carry rather than from whatever
// a crawler happened to reach.
//
// To add one: find the company's careers page, take the token out of the
// boards.greenhouse.io/<token> URL, and check it answers:
//   curl https://boards-api.greenhouse.io/v1/boards/<token>/jobs | head
// Boards with no India roles are deliberately left out rather than carried at
// zero — see the list at the foot of this file for ones already checked.

/** @typedef {{ token: string, name: string, india: number }} Board */

/** Greenhouse public boards, largest India presence first. */
export const GREENHOUSE = [
  { token: 'okta',         name: 'Okta',             india: 108 },
  { token: 'databricks',   name: 'Databricks',       india: 94 },
  { token: 'purestorage',  name: 'Pure Storage',     india: 84 },
  { token: 'mongodb',      name: 'MongoDB',          india: 83 },
  { token: 'zscaler',      name: 'Zscaler',          india: 71 },
  { token: 'stripe',       name: 'Stripe',           india: 43 },
  { token: 'rubrik',       name: 'Rubrik',           india: 33 },
  { token: 'gitlab',       name: 'GitLab',           india: 29 },
  { token: 'netskope',     name: 'Netskope',         india: 22 },
  { token: 'netradyne',    name: 'Netradyne',        india: 15 },
  { token: 'elastic',      name: 'Elastic',          india: 14 },
  { token: 'chargepoint',  name: 'ChargePoint',      india: 14 },
  { token: 'coinbase',     name: 'Coinbase',         india: 11 },
  { token: 'twilio',       name: 'Twilio',           india: 10 },
  { token: 'newrelic',     name: 'New Relic',        india: 9 },
  { token: 'datadog',      name: 'Datadog',          india: 8 },
  { token: 'groww',        name: 'Groww',            india: 7 },
  { token: 'anthropic',    name: 'Anthropic',        india: 5 },
  { token: 'airbnb',       name: 'Airbnb',           india: 5 },
  { token: 'sumologic',    name: 'Sumo Logic',       india: 5 },
  { token: 'adyen',        name: 'Adyen',            india: 4 },
  { token: 'mixpanel',     name: 'Mixpanel',         india: 4 },
  { token: 'figma',        name: 'Figma',            india: 2 },
  { token: 'vercel',       name: 'Vercel',           india: 2 },
  { token: 'cloudflare',   name: 'Cloudflare',       india: 1 },
];

/*
 * Checked and deliberately not carried, so nobody spends an afternoon
 * rediscovering them. These boards exist and answer, but held no India role
 * when tested:
 *
 *   slice dropbox robinhood brex netlify airtable asana duolingo discord
 *   lyft pinterest reddit instacart chime affirm wise gocardless circleci
 *   pagerduty intercom
 *
 * And these had no Greenhouse board at all. Most are Indian companies that
 * use Lever, Ashby, Darwinbox or their own system, which is why Lever and
 * Ashby adapters are the obvious next step:
 *
 *   razorpay zomato swiggy phonepe paytm flipkart myntra zerodha cred
 *   meesho (Lever) unacademy delhivery udaan nykaa lenskart practo
 */

/** Every board across every platform, for the poller to walk. */
export const ALL_BOARDS = GREENHOUSE.map((b) => ({ ...b, platform: 'greenhouse' }));
