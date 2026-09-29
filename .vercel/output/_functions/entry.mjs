import { renderers } from './renderers.mjs';
import { c as createExports, s as serverEntrypointModule } from './chunks/_@astrojs-ssr-adapter_feg008bC.mjs';
import { manifest } from './manifest_CDCSGoQq.mjs';

const serverIslandMap = new Map();;

const _page0 = () => import('./pages/_image.astro.mjs');
const _page1 = () => import('./pages/404.astro.mjs');
const _page2 = () => import('./pages/c/_category_.astro.mjs');
const _page3 = () => import('./pages/city/_city_.astro.mjs');
const _page4 = () => import('./pages/company/_company_.astro.mjs');
const _page5 = () => import('./pages/job/_slug_.astro.mjs');
const _page6 = () => import('./pages/jobs.astro.mjs');
const _page7 = () => import('./pages/robots.txt.astro.mjs');
const _page8 = () => import('./pages/sitemap.xml.astro.mjs');
const _page9 = () => import('./pages/index.astro.mjs');
const pageMap = new Map([
    ["node_modules/astro/dist/assets/endpoint/generic.js", _page0],
    ["src/pages/404.astro", _page1],
    ["src/pages/c/[category].astro", _page2],
    ["src/pages/city/[city].astro", _page3],
    ["src/pages/company/[company].astro", _page4],
    ["src/pages/job/[slug].astro", _page5],
    ["src/pages/jobs.astro", _page6],
    ["src/pages/robots.txt.js", _page7],
    ["src/pages/sitemap.xml.js", _page8],
    ["src/pages/index.astro", _page9]
]);

const _manifest = Object.assign(manifest, {
    pageMap,
    serverIslandMap,
    renderers,
    actions: () => import('./noop-entrypoint.mjs'),
    middleware: () => import('./_noop-middleware.mjs')
});
const _args = {
    "middlewareSecret": "9d0f7a39-e135-4d4d-9c00-de03741546b3",
    "skewProtection": false
};
const _exports = createExports(_manifest, _args);
const __astrojsSsrVirtualEntry = _exports.default;
const _start = 'start';
if (Object.prototype.hasOwnProperty.call(serverEntrypointModule, _start)) ;

export { __astrojsSsrVirtualEntry as default, pageMap };
