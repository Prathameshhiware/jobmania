import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

// Server-rendered: freshness is the product, so pages are built per request and
// cached at the edge with short s-maxage headers set in Base.astro.
export default defineConfig({
  output: 'server',
  adapter: vercel(),
  site: process.env.SITE_URL ?? 'https://jobmania.vercel.app',
  srcDir: './src',
  publicDir: './public',
  build: { format: 'directory' },
  vite: {
    // the ingest pipeline shares src/ but is never part of the site bundle
    build: { rollupOptions: { external: ['node:sqlite'] } },
  },
});
