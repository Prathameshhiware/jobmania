import { e as createAstro, f as createComponent, k as renderComponent, r as renderTemplate } from '../../chunks/astro/server_4gD_hRxI.mjs';
import 'piccolore';
import { $ as $$Base } from '../../chunks/JobCard_3K9k7J9o.mjs';
import { $ as $$JobList } from '../../chunks/JobList_CTaVaoZ2.mjs';
import { b as getFacets, c as citySlug, a as getByFacet } from '../../chunks/db_7Duisgg7.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://jobmania.vercel.app");
const $$city = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$city;
  const { city } = Astro2.params;
  const facets = await getFacets();
  const match = facets.cities.find(([name2]) => citySlug(name2) === city);
  if (!match) return Astro2.redirect("/404", 404);
  const [name, count] = match;
  const jobs = await getByFacet({ city: name }, 60);
  const sub = `Live job openings in ${name}, re-checked daily against each employer\u2019s own careers page. Walk-ins show their venue and timing so you can confirm before travelling.`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `Jobs in ${name} \u2014 ${count} live openings | JoBmania`, "description": sub, "noindex": jobs.length < 3 }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "JobList", $$JobList, { "heading": `Jobs in ${name}`, "sub": sub, "jobs": jobs, "crumb": name })} ` })}`;
}, "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/city/[city].astro", void 0);

const $$file = "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/city/[city].astro";
const $$url = "/city/[city]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$city,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
