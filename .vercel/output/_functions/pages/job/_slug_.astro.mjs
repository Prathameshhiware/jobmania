import { e as createAstro, f as createComponent, k as renderComponent, r as renderTemplate, l as Fragment, u as unescapeHTML, m as maybeRenderHead, h as addAttribute } from '../../chunks/astro/server_4gD_hRxI.mjs';
import 'piccolore';
import { $ as $$Base, a as $$JobCard } from '../../chunks/JobCard_3K9k7J9o.mjs';
import { f as getJobBySlug, h as getSimilar, d as getByCompany, i as experienceLabel, s as salaryLabel, l as locationLabel, w as walkinLabel, j as daysLeft, c as citySlug, t as timeAgo, T as TYPE_LABEL } from '../../chunks/db_7Duisgg7.mjs';
/* empty css                                     */
export { renderers } from '../../renderers.mjs';

var __freeze = Object.freeze;
var __defProp = Object.defineProperty;
var __template = (cooked, raw) => __freeze(__defProp(cooked, "raw", { value: __freeze(cooked.slice()) }));
var _a;
const $$Astro = createAstro("https://jobmania.vercel.app");
const $$slug = createComponent(async ($$result, $$props, $$slots) => {
  const Astro2 = $$result.createAstro($$Astro, $$props, $$slots);
  Astro2.self = $$slug;
  const { slug } = Astro2.params;
  const job = await getJobBySlug(slug);
  if (!job) return Astro2.redirect("/404", 404);
  const [similar, sameCompany] = await Promise.all([
    getSimilar(job, 3),
    getByCompany(job.company_slug, 6)
  ]);
  const others = sameCompany.filter((j) => j.slug !== job.slug);
  const exp = experienceLabel(job.exp_min, job.exp_max);
  const pay = salaryLabel(job);
  const where = locationLabel(job);
  const walkin = walkinLabel(job);
  const left = daysLeft(job.valid_through);
  const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" }) : null;
  const factSentence = [
    `${job.company_name} is hiring for ${job.title}`,
    where ? ` in ${where}` : "",
    exp ? `, for candidates with ${exp.toLowerCase()} of experience` : "",
    job.qualification ? `. Qualification: ${job.qualification}` : "",
    "."
  ].join("");
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "JobPosting",
    title: job.title,
    description: job.description_html ?? factSentence,
    datePosted: job.posted_at,
    validThrough: job.valid_through,
    employmentType: job.hiring_type === "internship" ? "INTERN" : "FULL_TIME",
    hiringOrganization: { "@type": "Organization", name: job.company_name },
    jobLocation: job.is_remote ? void 0 : { "@type": "Place", address: { "@type": "PostalAddress", addressLocality: job.city_primary ?? void 0, addressCountry: "IN" } },
    jobLocationType: job.is_remote ? "TELECOMMUTE" : void 0,
    applicantLocationRequirements: job.is_remote ? { "@type": "Country", name: "India" } : void 0,
    identifier: { "@type": "PropertyValue", name: "JoBmania", value: job.short_id },
    directApply: false,
    // present only when the employer stated it
    baseSalary: job.salary_min != null || job.salary_max != null ? {
      "@type": "MonetaryAmount",
      currency: job.salary_currency ?? "INR",
      value: {
        "@type": "QuantitativeValue",
        minValue: job.salary_min ?? void 0,
        maxValue: job.salary_max ?? void 0,
        unitText: job.salary_period ?? "MONTH"
      }
    } : void 0
  };
  const crumbs = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: new URL("/", Astro2.site).href },
      job.city_primary && { "@type": "ListItem", position: 2, name: job.city_primary, item: new URL(`/city/${citySlug(job.city_primary)}`, Astro2.site).href },
      { "@type": "ListItem", position: 3, name: job.company_name, item: new URL(`/company/${job.company_slug}`, Astro2.site).href }
    ].filter(Boolean)
  };
  const clean = (o) => JSON.parse(JSON.stringify(o));
  const verifiedAgo = timeAgo(job.last_verified_at ?? job.posted_at);
  const pageTitle = `${job.title} at ${job.company_name}${where ? ` \u2014 ${where}` : ""} | JoBmania`;
  const pageDesc = `${factSentence} Apply on ${job.company_name}'s official page. Verified ${verifiedAgo}.`;
  const deadlineLabel = left == null ? null : left <= 0 ? "Closes today" : `${left} day${left === 1 ? "" : "s"} left to apply`;
  return renderTemplate`${renderComponent($$result, "Base", $$Base, { "title": pageTitle, "description": pageDesc, "maxAge": 300, "data-astro-cid-tpv5kdx7": true }, { "default": async ($$result2) => renderTemplate`  ${maybeRenderHead()}<nav class="crumbs" aria-label="Breadcrumb" data-astro-cid-tpv5kdx7> <a href="/" data-astro-cid-tpv5kdx7>Home</a>›
${job.city_primary && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-tpv5kdx7": true }, { "default": async ($$result3) => renderTemplate`<a${addAttribute(`/city/${citySlug(job.city_primary)}`, "href")} data-astro-cid-tpv5kdx7>${job.city_primary}</a>›` })}`} <a${addAttribute(`/company/${job.company_slug}`, "href")} data-astro-cid-tpv5kdx7>${job.company_name}</a>›
<span data-astro-cid-tpv5kdx7>${job.title}</span> </nav> <div class="cols" data-astro-cid-tpv5kdx7> <main class="stack" data-astro-cid-tpv5kdx7> <header class="card glass" data-astro-cid-tpv5kdx7> <div class="head-co" data-astro-cid-tpv5kdx7> <span class="co" data-astro-cid-tpv5kdx7>${job.company_name}</span><span class="sep" data-astro-cid-tpv5kdx7></span> <span class="status" data-astro-cid-tpv5kdx7><span class="dot" data-astro-cid-tpv5kdx7></span>Verified ${timeAgo(job.last_verified_at ?? job.posted_at)}</span> </div> <h1 data-astro-cid-tpv5kdx7>${job.title}</h1> <div class="chips" data-astro-cid-tpv5kdx7> ${where && renderTemplate`<span class="chip" data-astro-cid-tpv5kdx7>${where}</span>`} ${exp && renderTemplate`<span class="chip" data-astro-cid-tpv5kdx7>${exp}</span>`} ${job.qualification && renderTemplate`<span class="chip" data-astro-cid-tpv5kdx7>${job.qualification}</span>`} <span class="chip" data-astro-cid-tpv5kdx7>${TYPE_LABEL[job.hiring_type] ?? job.hiring_type}</span> </div> <p class="meta" data-astro-cid-tpv5kdx7>
Posted ${fmtDate(job.posted_at)} ${job.valid_through && renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-tpv5kdx7": true }, { "default": async ($$result3) => renderTemplate` · Applications close ${fmtDate(job.valid_through)}` })}`} </p> </header> ${walkin && renderTemplate`<section class="card glass walkin" data-astro-cid-tpv5kdx7> <h2 class="sec" data-astro-cid-tpv5kdx7>Walk-in details</h2> <p class="sec-note" data-astro-cid-tpv5kdx7>As published by the employer. Confirm before you travel.</p> <dl class="facts" data-astro-cid-tpv5kdx7> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Dates</dt><dd data-astro-cid-tpv5kdx7>${walkin}</dd></div> ${job.walkin_time && renderTemplate`<div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Timing</dt><dd data-astro-cid-tpv5kdx7>${job.walkin_time}</dd></div>`} ${job.walkin_venue && renderTemplate`<div class="fact wide" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Venue</dt><dd data-astro-cid-tpv5kdx7>${job.walkin_venue}</dd></div>`} </dl> ${!job.walkin_venue && renderTemplate`<p class="absent" data-astro-cid-tpv5kdx7>The venue was not published in the source listing. Check the employer’s page before travelling.</p>`} </section>`} <section class="card glass" data-astro-cid-tpv5kdx7> <h2 class="sec" data-astro-cid-tpv5kdx7>At a glance</h2> <p class="sec-note" data-astro-cid-tpv5kdx7>Structured from the employer’s listing. A blank field means they did not state it.</p> <dl class="facts" data-astro-cid-tpv5kdx7> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Company</dt><dd data-astro-cid-tpv5kdx7>${job.company_name}</dd></div> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Role</dt><dd data-astro-cid-tpv5kdx7>${job.title}</dd></div> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Qualification</dt><dd${addAttribute(job.qualification ? "" : "none", "class")} data-astro-cid-tpv5kdx7>${job.qualification ?? "Not stated"}</dd></div> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Experience</dt><dd${addAttribute(exp ? "" : "none", "class")} data-astro-cid-tpv5kdx7>${exp ?? "Not stated"}</dd></div> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Location</dt><dd${addAttribute(where ? "" : "none", "class")} data-astro-cid-tpv5kdx7>${where ?? "Not stated"}</dd></div> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Type</dt><dd data-astro-cid-tpv5kdx7>${TYPE_LABEL[job.hiring_type] ?? job.hiring_type}</dd></div> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Pay</dt><dd${addAttribute(pay ? "" : "none", "class")} data-astro-cid-tpv5kdx7>${pay ?? "Not stated by the employer"}</dd></div> <div class="fact" data-astro-cid-tpv5kdx7><dt data-astro-cid-tpv5kdx7>Last date</dt><dd data-astro-cid-tpv5kdx7>${fmtDate(job.valid_through)}</dd></div> </dl> <p class="policy" data-astro-cid-tpv5kdx7>We publish pay only when the employer states it, and never estimate a range.</p> </section> ${job.description_html && renderTemplate`<section class="card glass" data-astro-cid-tpv5kdx7> <h2 class="sec" data-astro-cid-tpv5kdx7>About the role</h2> <p class="sec-note" data-astro-cid-tpv5kdx7>Published by ${job.company_name} on their own careers site.</p> <div class="jd" data-astro-cid-tpv5kdx7>${unescapeHTML(job.description_html)}</div> </section>`} <section class="card glass faq" data-astro-cid-tpv5kdx7> <h2 class="sec" data-astro-cid-tpv5kdx7>About this listing</h2> <p class="sec-note" data-astro-cid-tpv5kdx7>Answered from what the employer published and from our own records. Anything they did not state, we do not fill in.</p> ${!pay && renderTemplate`<details open data-astro-cid-tpv5kdx7> <summary data-astro-cid-tpv5kdx7>Why is no pay shown?</summary> <p data-astro-cid-tpv5kdx7>Because ${job.company_name} did not state it in this listing. We publish pay only when the employer does and never estimate a range, so a blank field means the information does not exist upstream — not that we failed to find it.</p> </details>`} <details data-astro-cid-tpv5kdx7> <summary data-astro-cid-tpv5kdx7>How current is this listing?</summary> <p data-astro-cid-tpv5kdx7>We last confirmed the application link was live ${timeAgo(job.last_verified_at ?? job.posted_at)}, and we re-check every opening daily. If it closes or the link stops responding, this page is delisted within 24 hours.</p> </details> ${!job.description_html && renderTemplate`<details data-astro-cid-tpv5kdx7> <summary data-astro-cid-tpv5kdx7>Where is the full job description?</summary> <p data-astro-cid-tpv5kdx7>${job.company_name} does not publish this role through a feed we can read, so we hold the facts above but not their full write-up. Rather than guess at the rest, we send you to their official page.</p> </details>`} </section> ${others.length > 0 && renderTemplate`<section data-astro-cid-tpv5kdx7> <div class="sec-head" data-astro-cid-tpv5kdx7><h2 data-astro-cid-tpv5kdx7>More at ${job.company_name}</h2></div> <div class="grid-job" data-astro-cid-tpv5kdx7>${others.slice(0, 2).map((j) => renderTemplate`${renderComponent($$result2, "JobCard", $$JobCard, { "job": j, "compact": true, "data-astro-cid-tpv5kdx7": true })}`)}</div> </section>`} </main> <aside class="stack" data-astro-cid-tpv5kdx7> <div class="card glass aside" data-astro-cid-tpv5kdx7> ${deadlineLabel && left <= 14 && renderTemplate`<span class="deadline" data-astro-cid-tpv5kdx7> <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-astro-cid-tpv5kdx7><circle cx="12" cy="12" r="9" data-astro-cid-tpv5kdx7></circle><path d="M12 7v5l3 2" data-astro-cid-tpv5kdx7></path></svg> ${deadlineLabel} </span>`} ${job.apply_url ? renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "data-astro-cid-tpv5kdx7": true }, { "default": async ($$result3) => renderTemplate` <a class="btn apply"${addAttribute(job.apply_url, "href")} target="_blank" rel="noopener nofollow ugc" data-astro-cid-tpv5kdx7>
Apply on ${job.company_name} <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" data-astro-cid-tpv5kdx7><path d="M15 3h6v6" data-astro-cid-tpv5kdx7></path><path d="M10 14 21 3" data-astro-cid-tpv5kdx7></path><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" data-astro-cid-tpv5kdx7></path></svg> </a> <p class="note" data-astro-cid-tpv5kdx7>Opens ${job.company_name}’s official application page. We never collect your application.</p> ` })}` : renderTemplate`<p class="note" data-astro-cid-tpv5kdx7>This listing has no online application link — it is a walk-in. Check the venue and timing above.</p>`} </div> <div class="card glass aside" data-astro-cid-tpv5kdx7> <h2 class="sec small" data-astro-cid-tpv5kdx7>How we verified this</h2> <div class="rows" data-astro-cid-tpv5kdx7> <div class="row" data-astro-cid-tpv5kdx7><span data-astro-cid-tpv5kdx7>Apply link tested</span><span data-astro-cid-tpv5kdx7>${timeAgo(job.last_checked_at) ?? "\u2014"}</span></div> <div class="row" data-astro-cid-tpv5kdx7><span data-astro-cid-tpv5kdx7>First seen</span><span data-astro-cid-tpv5kdx7>${fmtDate(job.first_seen_at)}</span></div> <div class="row" data-astro-cid-tpv5kdx7><span data-astro-cid-tpv5kdx7>Auto-expires</span><span data-astro-cid-tpv5kdx7>${fmtDate(job.valid_through)}</span></div> <div class="row" data-astro-cid-tpv5kdx7><span data-astro-cid-tpv5kdx7>Fee requested</span><span data-astro-cid-tpv5kdx7>${job.scam_flags?.length ? "Flagged" : "None"}</span></div> </div> ${job.canonical_url && renderTemplate`<a class="src"${addAttribute(job.canonical_url, "href")} target="_blank" rel="noopener nofollow" data-astro-cid-tpv5kdx7>Employer’s own listing →</a>`} </div> ${similar.length > 0 && renderTemplate`<div class="card glass aside" data-astro-cid-tpv5kdx7> <h2 class="sec small" data-astro-cid-tpv5kdx7>Similar in ${job.city_primary ?? "India"}</h2> <div class="more-list" data-astro-cid-tpv5kdx7> ${similar.map((j) => renderTemplate`<a${addAttribute(`/job/${j.slug}`, "href")} data-astro-cid-tpv5kdx7> <span class="t" data-astro-cid-tpv5kdx7>${j.title}</span> <span class="s" data-astro-cid-tpv5kdx7>${j.company_name}</span> </a>`)} </div> </div>`} </aside> </div> `, "head": async ($$result2) => renderTemplate`${renderComponent($$result2, "Fragment", Fragment, { "slot": "head" }, { "default": async ($$result3) => renderTemplate(_a || (_a = __template([' <script type="application/ld+json">', '<\/script> <script type="application/ld+json">', "<\/script> "])), unescapeHTML(JSON.stringify(clean(jsonLd))), unescapeHTML(JSON.stringify(clean(crumbs)))) })}` })} `;
}, "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/job/[slug].astro", void 0);

const $$file = "C:/Users/LENOVO/OneDrive/Desktop/Job Portal/src/pages/job/[slug].astro";
const $$url = "/job/[slug]";

const _page = /*#__PURE__*/Object.freeze(/*#__PURE__*/Object.defineProperty({
  __proto__: null,
  default: $$slug,
  file: $$file,
  url: $$url
}, Symbol.toStringTag, { value: 'Module' }));

const page = () => _page;

export { page };
