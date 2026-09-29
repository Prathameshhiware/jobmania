import { e as createAstro, f as createComponent, k as renderComponent, r as renderTemplate, m as maybeRenderHead, h as addAttribute } from '../chunks/astro/server_4gD_hRxI.mjs';
import 'piccolore';
import { $ as $$Base } from '../chunks/JobCard_3K9k7J9o.mjs';
import { $ as $$JobList } from '../chunks/JobList_CTaVaoZ2.mjs';
import { b as getFacets, k as search, a as getByFacet, g as getLatest, c as citySlug } from '../chunks/db_7Duisgg7.mjs';
/* empty css                                */
export { renderers } from '../renderers.mjs';

const $$Astro = createAstro("https://jobmania.vercel.app");
const $$Jobs = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$Jobs;
  const q = Astro2.url.searchParams.get("q")?.trim() ?? "";
  const city = Astro2.url.searchParams.get("city")?.trim() ?? "";
  const facets = await getFacets();
  const knownCity = facets.cities.find(([n]) => n.toLowerCase() === city.toLowerCase())?.[0] ?? null;
  let jobs;
  if (q) jobs = await search(q, 60);
  else if (knownCity) jobs = await getByFacet({ city: knownCity }, 60);
  else jobs = await getLatest(60);
  if (q && knownCity) jobs = jobs.filter((j) => j.city_primary === knownCity);
  const heading = q ? `\u201C${q}\u201D${knownCity ? ` in ${knownCity}` : ""}` : knownCity ? `Jobs in ${knownCity}` : "All live openings";
  const sub = q || knownCity ? "Results from live openings only. Anything closed or unreachable has already been delisted." : `Every opening currently live on JoBmania, newest first.`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${heading} | JoBmania`, "description": sub, "noindex": Boolean(q), "data-astro-cid-7jf2fhdj": true }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "JobList", $$JobList, { "heading": heading, "sub": sub, "jobs": jobs, "crumb": "Search", "empty": q ? `Nothing live matches \u201C${q}\u201D right now. Try a company name, a role, or a city.` : "No live openings right now.", "data-astro-cid-7jf2fhdj": true })} ${maybeRenderHead()}<section class="refine" data-astro-cid-7jf2fhdj> <h2 data-astro-cid-7jf2fhdj>Browse by city</h2> <div class="row" data-astro-cid-7jf2fhdj> ${facets.cities.map(([name, n]) => renderTemplate`<a class="chip"${addAttribute(`/city/${citySlug(name)}`, "href")} data-astro-cid-7jf2fhdj>${name} · ${n}</a>`)} </div> </section> ` })} `;
}, "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/jobs.astro", void 0);

const $$file = "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/jobs.astro";
const $$url = "/jobs";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$Jobs,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
