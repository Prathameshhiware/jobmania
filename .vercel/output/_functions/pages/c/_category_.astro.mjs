import { e as createAstro, f as createComponent, k as renderComponent, r as renderTemplate } from '../../chunks/astro/server_4gD_hRxI.mjs';
import 'piccolore';
import { $ as $$Base } from '../../chunks/JobCard_3K9k7J9o.mjs';
import { $ as $$JobList } from '../../chunks/JobList_CTaVaoZ2.mjs';
import { C as CATEGORIES, g as getLatest, a as getByFacet } from '../../chunks/db_7Duisgg7.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://jobmania.vercel.app");
const $$category = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$category;
  const { category } = Astro2.params;
  const cat = CATEGORIES.find((c) => c.slug === category);
  if (!cat) return Astro2.redirect("/404", 404);
  const jobs = cat.slug === "just-posted" ? await getLatest(60) : await getByFacet(cat.facet, 60);
  const BLURB = {
    "just-posted": "The newest openings on JoBmania, most recent first. Every one was checked against the employer\u2019s own page before it appeared here.",
    "freshers": "Roles open to candidates with no prior experience, including off-campus drives and trainee positions.",
    "experienced": "Roles asking for a few years behind you rather than a clean slate.",
    "remote": "Work-from-home and remote roles hiring across India.",
    "walk-ins": "Attend in person \u2014 no online application. Check the venue and timing on each listing, and confirm with the employer before you travel.",
    "internships": "Internships and apprenticeships, including stipend-paying and pre-placement roles.",
    "off-campus": "Off-campus drives open to graduates outside a college placement process."
  };
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${cat.label} jobs in India \u2014 ${jobs.length} live openings | JoBmania`, "description": BLURB[cat.slug], "noindex": jobs.length < 3 }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "JobList", $$JobList, { "heading": `${cat.label} jobs`, "sub": BLURB[cat.slug], "jobs": jobs, "crumb": cat.label, "empty": "No live openings in this category right now. The monitor runs every ten minutes, so check back shortly." })} ` })}`;
}, "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/c/[category].astro", void 0);

const $$file = "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/c/[category].astro";
const $$url = "/c/[category]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$category,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
