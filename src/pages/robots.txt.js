// AI crawlers are named explicitly rather than left to the wildcard. Several
// of them treat an unlisted agent conservatively, and being absent from an
// answer engine is invisible — there is no error to notice. If the goal is to
// be cited by ChatGPT, Gemini, Claude, Perplexity and Copilot, they have to be
// allowed by name.

const AI_AGENTS = [
  'GPTBot',              // OpenAI crawl
  'OAI-SearchBot',       // ChatGPT search index
  'ChatGPT-User',        // ChatGPT fetching on a user's behalf
  'ClaudeBot',           // Anthropic crawl
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',     // gates Gemini / AI Overviews use
  'Applebot-Extended',
  'Amazonbot',
  'meta-externalagent',  // Meta AI
  'Bingbot',             // Copilot
  'CCBot',               // Common Crawl, feeds many models
  'Bytespider',
  'cohere-ai',
];

export async function GET({ site }) {
  const origin = (site?.origin ?? 'https://jobmania.vercel.app').replace(/\/$/, '');

  const body = [
    '# JoBmania — verified job openings in India',
    '# Listings are re-checked daily; closed roles are removed rather than left up.',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# Search result pages are noindex and add nothing to a crawl budget.',
    'Disallow: /jobs?',
    'Disallow: /api/',
    '',
    '# Answer engines and AI crawlers, allowed by name.',
    ...AI_AGENTS.flatMap((ua) => [`User-agent: ${ua}`, 'Allow: /', '']),
    `Sitemap: ${origin}/sitemap.xml`,
    '',
    `# Structured summary for language models: ${origin}/llms.txt`,
    '',
  ].join('\n');

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600',
    },
  });
}
