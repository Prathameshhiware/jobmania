import { f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead } from '../chunks/astro/server_4gD_hRxI.mjs';
import 'piccolore';
import { $ as $$Base, a as $$JobCard } from '../chunks/JobCard_3K9k7J9o.mjs';
import { g as getLatest } from '../chunks/db_7Duisgg7.mjs';
/* empty css                               */
export { renderers } from '../renderers.mjs';

const $$404 = createComponent(async ($$result, $$props, $$slots) => {
  const latest = await getLatest(3);
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": "This opening is no longer live | JoBmania", "noindex": true, "maxAge": 60, "data-astro-cid-zetdm5md": true }, { "default": async ($$result2) => renderTemplate` ${maybeRenderHead()}<div class="lead" data-astro-cid-zetdm5md> <h1 data-astro-cid-zetdm5md>This opening is no longer live.</h1> <p class="sub" data-astro-cid-zetdm5md>
Either it closed, or the employer’s application link stopped working and we
      delisted it. We remove openings rather than leaving them up — that is the
      whole point of the site, even when it means a dead end for you here.
</p> <div class="actions" data-astro-cid-zetdm5md> <a class="btn" href="/jobs" data-astro-cid-zetdm5md>Browse live openings</a> <a class="btn ghost" href="/" data-astro-cid-zetdm5md>Back to home</a> </div> </div> ${latest.length > 0 && renderTemplate`<section data-astro-cid-zetdm5md> <h2 data-astro-cid-zetdm5md>Posted most recently</h2> <div class="grid-job" data-astro-cid-zetdm5md>${latest.map((job) => renderTemplate`${renderComponent($$result2, "JobCard", $$JobCard, { "job": job, "compact": true, "data-astro-cid-zetdm5md": true })}`)}</div> </section>`}` })} `;
}, "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/404.astro", void 0);

const $$file = "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/404.astro";
const $$url = "/404";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$404,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
