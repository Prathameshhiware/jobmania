import { e as createAstro, f as createComponent, k as renderComponent, r as renderTemplate } from '../../chunks/astro/server_4gD_hRxI.mjs';
import 'piccolore';
import { $ as $$Base } from '../../chunks/JobCard_3K9k7J9o.mjs';
import { $ as $$JobList } from '../../chunks/JobList_CTaVaoZ2.mjs';
import { d as getByCompany } from '../../chunks/db_7Duisgg7.mjs';
export { renderers } from '../../renderers.mjs';

const $$Astro = createAstro("https://jobmania.vercel.app");
const $$company = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$company;
  const { company } = Astro2.params;
  const jobs = await getByCompany(company, 60);
  if (!jobs.length) return Astro2.redirect("/404", 404);
  const name = jobs[0].company_name;
  const cities = [...new Set(jobs.map((j) => j.city_primary).filter(Boolean))];
  const sub = `Every live opening we hold for ${name}${cities.length ? `, across ${cities.slice(0, 4).join(", ")}` : ""}. We link to ${name}\u2019s own application pages \u2014 we are not affiliated with them.`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": `${name} jobs \u2014 ${jobs.length} live openings | JoBmania`, "description": sub, "noindex": jobs.length < 2 }, { "default": async ($$result2) => renderTemplate` ${renderComponent($$result2, "JobList", $$JobList, { "heading": `Jobs at ${name}`, "sub": sub, "jobs": jobs, "crumb": name })} ` })}`;
}, "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/company/[company].astro", void 0);

const $$file = "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/company/[company].astro";
const $$url = "/company/[company]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$company,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
