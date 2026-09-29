import { e as createAstro, f as createComponent, m as maybeRenderHead, r as renderTemplate, k as renderComponent } from './astro/server_4gD_hRxI.mjs';
import 'piccolore';
import { a as $$JobCard } from './JobCard_3K9k7J9o.mjs';
/* empty css                              */

const $$Astro = createAstro("https://jobmania.vercel.app");
const $$JobList = createComponent(($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$JobList;
  const { heading, sub, jobs = [], empty = "Nothing live here right now.", crumb } = Astro2.props;
  return renderTemplate`${crumb && renderTemplate`${maybeRenderHead()}<nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-m5x2lo23><a href="/" data-astro-cid-m5x2lo23>Home</a>›<span data-astro-cid-m5x2lo23>${crumb}</span></nav>`}<header class="lead" data-astro-cid-m5x2lo23> <h1 data-astro-cid-m5x2lo23>${heading}</h1> <p class="sub" data-astro-cid-m5x2lo23>${sub}</p> <p class="count" data-astro-cid-m5x2lo23> <span class="dot" data-astro-cid-m5x2lo23></span> ${jobs.length} live opening${jobs.length === 1 ? "" : "s"}${jobs.length ? " \xB7 all link-checked within the last 24 hours" : ""} </p> </header> ${jobs.length ? renderTemplate`<div class="grid-job" data-astro-cid-m5x2lo23>${jobs.map((job) => renderTemplate`${renderComponent($$result, "JobCard", $$JobCard, { "job": job, "data-astro-cid-m5x2lo23": true })}`)}</div>` : renderTemplate`<p class="empty glass" data-astro-cid-m5x2lo23>${empty}</p>`} `;
}, "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/components/JobList.astro", void 0);

export { $$JobList as $ };
