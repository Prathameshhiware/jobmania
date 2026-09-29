import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Server-rendered: freshness is the product, so pages are built per request and
// cached at the edge with short s-maxage headers set in Base.astro.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  // Canonicals, sitemap and JSON-LD all need an absolute origin. SITE_URL wins
  // once a real domain exists; before that Vercel supplies its own production
  // host, so nothing points at a placeholder on the first deploy.
  site:
    process.env.SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : 'http://localhost:4321'),
  srcDir: './src',
  publicDir: './public',
  build: { format: 'directory' },
  vite: {
    // the ingest pipeline shares src/ but is never part of the site bundle
    build: { rollupOptions: { external: ['node:sqlite'] } },
    server: {
      watch: {
        // Running `astro build` while `astro dev` is up rewrites these folders
        // underneath the watcher. On Windows a directory disappearing mid-watch
        // throws UNKNOWN from lstat, chokidar emits an unhandled 'error' and
        // the dev server dies. Build output is never worth watching anyway.
        ignored: ['**/.vercel/**', '**/dist/**', '**/.astro/**', '**/node_modules/**'],
      },
    },
  },
});
