// Runs the health checks and prints them.
//
//   npm run doctor
//
// Exits 1 on any fail, so a scheduler or a CI step can tell the difference
// between "checked, fine" and "checked, broken" without parsing anything.
// A warn exits 0: it is worth reading, not worth waking anyone.

import { runHealth, formatHealth } from './lib/health.js';

const origin = process.argv[2] || 'https://jobmania.dpdns.org';
const report = await runHealth({ origin });

console.log(formatHealth(report));

if (report.verdict === 'fail') process.exit(1);
