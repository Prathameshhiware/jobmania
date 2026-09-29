// Visitor counter endpoint.
//
// Pages are edge-cached, so a count rendered into the HTML would miss almost
// everyone. This route is never cached and is called from the footer on load.
//
// Counts distinct browsers: the increment happens only when the first-party
// cookie is absent. Nothing identifying is stored — no IP, no user agent — so
// there is no personal data here at all.

import { sb } from '../../lib/db.js';

const COOKIE = 'jm_seen';
const YEAR = 60 * 60 * 24 * 365;

// Displayed count = baseline + real visits. The stored counter always holds the
// TRUE number, so real traffic stays measurable and the baseline can be dropped
// at any time by setting this to 0 without losing any history.
const BASELINE = Number(import.meta.env?.VISITOR_BASELINE ?? process.env?.VISITOR_BASELINE ?? 0) || 0;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, max-age=0',
    },
  });

export async function POST({ cookies }) {
  // Dev shares the production database, so local browsing would inflate the
  // public number. Read, never increment, outside production.
  const returning = cookies.has(COOKIE) || !import.meta.env.PROD;

  try {
    // A returning browser reads the total; a new one adds itself first.
    const { data, error } = await sb.rpc(returning ? 'get_visitors' : 'bump_visitor');
    if (error) throw new Error(error.message);

    if (!returning) {
      cookies.set(COOKIE, '1', {
        path: '/',
        maxAge: YEAR,
        httpOnly: true,
        sameSite: 'lax',
        secure: import.meta.env.PROD,
      });
    }

    return json({ visitors: BASELINE + Number(data ?? 0), counted: !returning });
  } catch (err) {
    // A counter is decoration. If it fails the page carries on without it.
    return json({ visitors: null, error: String(err.message ?? err) }, 200);
  }
}

// GET reads without incrementing. Returns both numbers so the true traffic is
// always visible to you even while a baseline is being displayed.
export async function GET() {
  try {
    const { data, error } = await sb.rpc('get_visitors');
    if (error) throw new Error(error.message);
    const real = Number(data ?? 0);
    return json({ visitors: BASELINE + real, real, baseline: BASELINE });
  } catch (err) {
    return json({ visitors: null, error: String(err.message ?? err) }, 200);
  }
}
