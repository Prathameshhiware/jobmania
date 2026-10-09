// The words on an Indian job offer, explained.
//
// READ THIS BEFORE CHANGING ANYTHING HERE.
//
// This is authored reference content, not generated content. It lives in the
// repo for the same reason the articles do: it changes rarely, a person wrote
// it, and a mistake needs to be reviewable and revertable rather than
// discovered on a graphic that has already been posted.
//
// Why it exists at all: we measured it. Of 405 live listings carrying the
// employer's own description, 132 said "hybrid" and exactly zero said "CTC" or
// "LPA". One mentioned a notice period. That is not because those words do not
// matter in India — it is because most of our descriptions come from the
// global boards of companies like Okta, Stripe and MongoDB, who write in
// global corporate English. The vocabulary an Indian fresher actually trips
// over is missing from our own corpus, so a glossary adds something the site
// does not otherwise have.
//
// Two tiers, and the distinction is the important part:
//
//   convention  How the industry uses a word. CTC, bench, HR round. These are
//               descriptions of common usage. They can go out unattended.
//
//   statutory   A thing defined by law: gratuity, EPF, ESIC, Form 16. These
//               name the governing Act and explain what the thing IS. They
//               deliberately do NOT state rates, thresholds or percentages,
//               because those change by notification and a stale number on a
//               posted graphic cannot be corrected. Anyone who needs the
//               current figure is sent to the source instead.
//
//               All six were reviewed and approved by the site owner on
//               9 October 2026, so they publish unattended like the rest.
//               What keeps them safe is not the review but the rule above:
//               they carry no figure that can go out of date. A statutory
//               term added later must follow it, and must be reviewed.
//
// Every statutory entry carries `source`. Nothing here states a statistic
// about the Indian job market, because this file is for defining words, not
// for making claims.

/**
 * @typedef {object} Term
 * @property {string} term      as it appears on a posting
 * @property {string} [expand]  what the abbreviation stands for
 * @property {string} short     the definition, written to fit one card
 * @property {string} why       why it matters to the reader, in one line
 * @property {'convention'|'statutory'} tier
 * @property {string} [act]     the governing law, for statutory terms
 * @property {string} [source]  where to check the current rule
 * @property {string} [path]    a page on our site that goes deeper
 */

/** @type {Term[]} */
export const GLOSSARY = [
  // ------------------------------------------------------------------ pay
  {
    term: 'CTC', expand: 'Cost to Company', tier: 'convention',
    short: 'Everything your employer spends on you in a year, added up. It includes things that never reach your bank account, such as the employer’s provident fund contribution, gratuity provision and the notional value of insurance.',
    why: 'A 6 LPA CTC does not mean 50,000 a month in your account. Ask for the in-hand figure before you decide.',
  },
  {
    term: 'In-hand salary', question: 'What is in-hand salary?', tier: 'convention',
    short: 'What actually lands in your bank account each month, after provident fund, professional tax and income tax have been deducted. Also called take-home.',
    why: 'This is the only number that tells you what you can afford to live on.',
  },
  {
    term: 'LPA', expand: 'Lakhs Per Annum', tier: 'convention',
    short: 'A way of writing annual pay. 1 lakh is 100,000, so 6 LPA means six lakh rupees a year. It almost always refers to CTC rather than to take-home.',
    why: 'When someone says their package is 12 LPA, they are usually quoting CTC, not what they receive.',
  },
  {
    term: 'Basic salary', question: 'What is basic salary?', tier: 'convention',
    short: 'The fixed core of your pay, before allowances. Most other components, and several statutory contributions, are calculated as a percentage of it.',
    why: 'A low basic makes the headline CTC look larger while shrinking your provident fund and gratuity.',
  },
  {
    term: 'HRA', expand: 'House Rent Allowance', tier: 'convention',
    short: 'A salary component meant to cover rent. If you pay rent and submit proof, part of it can reduce your taxable income.',
    why: 'If you are paying rent and not claiming it, you are paying more tax than you need to.',
  },
  {
    term: 'Variable pay', question: 'What is variable pay?', tier: 'convention',
    short: 'The part of your package that depends on performance, usually yours or the company’s or both. It is quoted inside CTC as though it were certain, and it is not.',
    why: 'Ask what percentage of variable pay was actually paid out last year before you count it.',
  },
  {
    term: 'Joining bonus', question: 'What is a joining bonus?', tier: 'convention',
    short: 'A one-time amount paid when you join. It very often comes with a condition that you repay it if you leave within a stated period.',
    why: 'Read the clawback clause. The money is not unconditionally yours on day one.',
  },
  {
    term: 'ESOP', expand: 'Employee Stock Ownership Plan', tier: 'convention',
    short: 'A right to buy company shares later at a fixed price. Options usually vest over several years, and in an unlisted company there may be no way to sell them.',
    why: 'ESOPs quoted inside CTC are not cash and may never become cash. Value them separately.',
  },
  {
    term: 'Stipend', question: 'What is a stipend?', tier: 'convention',
    short: 'A fixed payment made to an intern or a trainee. It is not a salary, and it usually comes without the benefits attached to employment.',
    why: 'An unpaid or very low stipend is normal in some fields and a warning sign in others. Compare before you accept.',
  },

  // ------------------------------------------------------------ statutory
  {
    term: 'Provident Fund', question: 'What is the Provident Fund?', expand: 'EPF', tier: 'statutory',
    short: 'A retirement savings fund that you and your employer both pay into every month, held by the Employees’ Provident Fund Organisation. It follows you across jobs through your UAN.',
    why: 'Your UAN stays the same for life. Keep it, and link each new job to it instead of starting again.',
    act: 'Employees’ Provident Funds and Miscellaneous Provisions Act, 1952',
    source: 'epfindia.gov.in',
  },
  {
    term: 'Gratuity', question: 'What is gratuity?', tier: 'statutory',
    short: 'A lump sum an employer pays you for long service when you leave. It is a legal entitlement in covered establishments once you have served the qualifying period, not a favour.',
    why: 'It is quoted inside CTC from your first day, but you only receive it if you stay long enough to qualify.',
    act: 'Payment of Gratuity Act, 1972',
    source: 'labour.gov.in',
  },
  {
    term: 'ESIC', expand: 'Employees’ State Insurance', tier: 'statutory',
    short: 'A medical and cash-benefit scheme for employees earning under a stated wage limit, funded by contributions from both you and your employer.',
    why: 'If you are covered, you and your dependants get treatment at ESIC facilities. Many people never find out they were eligible.',
    act: 'Employees’ State Insurance Act, 1948',
    source: 'esic.gov.in',
  },
  {
    term: 'Form 16', question: 'What is Form 16?', tier: 'statutory',
    short: 'A certificate your employer gives you each year showing the salary paid and the tax deducted from it. You use it to file your income tax return.',
    why: 'If you changed jobs during the year you need one from every employer, or your return will be short.',
    act: 'Income-tax Act, 1961',
    source: 'incometax.gov.in',
  },
  {
    term: 'TDS', expand: 'Tax Deducted at Source', tier: 'statutory',
    short: 'Income tax your employer takes out of your salary before paying you and deposits with the government on your behalf.',
    why: 'TDS is not a final tax bill. If too much was deducted, you claim it back by filing a return.',
    act: 'Income-tax Act, 1961',
    source: 'incometax.gov.in',
  },
  {
    term: 'Apprenticeship', question: 'What is an apprenticeship?', tier: 'statutory',
    short: 'A fixed-term training contract registered with the government, under schemes such as NAPS and NATS. An apprentice receives a stipend and formal training, and is not an employee of the company.',
    why: 'It is a recognised route into a first job, but it does not by itself become permanent employment. Ask what happened to last year’s apprentices.',
    act: 'Apprentices Act, 1961',
    source: 'apprenticeshipindia.gov.in',
  },

  // ------------------------------------------------------- offer and exit
  {
    term: 'Offer letter', question: 'What is an offer letter?', tier: 'convention',
    short: 'The document proposing a role, pay and a joining date. It is an offer, and until you join it is not the same as being employed.',
    why: 'An offer can be withdrawn before you join. Do not resign from your current job on a verbal promise alone.',
    path: '/insights/blogs/offer-letter-no-joining-date-india',
  },
  {
    term: 'Appointment letter', question: 'What is an appointment letter?', tier: 'convention',
    short: 'The document issued when you actually join, setting out your terms of employment. This is the one that governs the job.',
    why: 'If an employer keeps delaying this after you have joined, that is worth asking about in writing.',
  },
  {
    term: 'Notice period', question: 'What is a notice period?', tier: 'convention',
    short: 'How long you must keep working after you resign, as stated in your contract. In India it commonly runs from 30 to 90 days.',
    why: 'Your next employer will ask about it. A long notice period can cost you an offer, so know yours before you apply.',
  },
  {
    term: 'Probation', question: 'What is probation?', tier: 'convention',
    short: 'An initial period in a new job during which either side can end it with a shorter notice. Some benefits may not start until it is confirmed.',
    why: 'Ask what confirmation depends on, and get the answer in writing rather than in conversation.',
  },
  {
    term: 'Bond', question: 'What is an employment bond?', tier: 'convention',
    short: 'A clause requiring you to stay for a fixed period or pay the employer a stated amount. Common where the employer funds significant training.',
    why: 'Read the amount and the exit terms before you sign. Never hand over original certificates to anyone.',
  },
  {
    term: 'Relieving letter', question: 'What is a relieving letter?', tier: 'convention',
    short: 'A letter from a former employer confirming you completed your notice and left properly.',
    why: 'Many employers will not complete your onboarding without it. Ask for it on your last day, not months later.',
  },
  {
    term: 'BGV', expand: 'Background Verification', tier: 'convention',
    short: 'The check a new employer runs on what you told them: previous employment, dates, qualifications and sometimes criminal record.',
    why: 'Overstated dates or titles surface here, often after you have already resigned elsewhere. Keep it accurate.',
  },
  {
    term: 'Immediate joiner', question: 'What does "immediate joiner" mean?', tier: 'convention',
    short: 'Someone available to start at once, usually meaning within 15 to 30 days. Postings use it when a role must be filled quickly.',
    why: 'If you are serving a 90-day notice, these roles will usually not wait for you. Filter accordingly.',
  },

  // -------------------------------------------------------------- process
  {
    term: 'Walk-in interview', question: 'What is a walk-in interview?', tier: 'convention',
    short: 'An open hiring day. You turn up at a stated venue within stated hours with your documents, and interview the same day. No prior application is needed.',
    why: 'The fastest route into a first job in India, and the one most often moved or cancelled. Confirm before you travel.',
    path: '/c/walk-ins',
  },
  {
    term: 'Off-campus drive', question: 'What is an off-campus drive?', tier: 'convention',
    short: 'A hiring drive open to anyone who meets the criteria, rather than only to students of one college.',
    why: 'If your placement cell did not come through, this is the same opportunity without the college in between.',
    path: '/c/off-campus',
  },
  {
    term: 'ATS', question: 'What is an ATS?', expand: 'Applicant Tracking System', tier: 'convention',
    short: 'The software an employer uses to collect and sort applications. Most medium and large companies receive applications only through one.',
    why: 'A plain, clearly structured CV survives this better than a heavily designed one.',
  },
  {
    term: 'Shortlisted', question: 'What does "shortlisted" mean?', tier: 'convention',
    short: 'Your application has passed an initial filter and moved to the next stage. It is not an offer and not an interview guarantee.',
    why: 'Keep applying elsewhere until you have a signed offer. Shortlists go quiet all the time.',
  },
  {
    term: 'Aptitude test', question: 'What is an aptitude test?', tier: 'convention',
    short: 'A timed test of reasoning, basic maths and English, used early to narrow a large applicant pool.',
    why: 'It is usually sat before anyone reads your CV, so it is worth practising the format rather than the content.',
  },
  {
    term: 'Group discussion', question: 'What is a group discussion?', expand: 'GD', tier: 'convention',
    short: 'A stage where several candidates discuss a topic while assessors watch. It tests how you argue and listen, not whether you win.',
    why: 'Talking the most is not the same as scoring the highest. Making room for someone else is often marked well.',
  },
  {
    term: 'HR round', question: 'What is the HR round?', tier: 'convention',
    short: 'A conversation about fit, expectations, notice period and pay, usually after the technical stages.',
    why: 'This is where salary is decided. Know your current in-hand and your minimum before you walk in.',
  },

  // ------------------------------------------------------------ work setup
  {
    term: 'GCC', question: 'What is a GCC?', expand: 'Global Capability Centre', tier: 'convention',
    short: 'An office a foreign company owns and staffs itself in India, rather than outsourcing the work to a service provider. You are employed by the company, not by a vendor.',
    why: 'GCCs have been a major source of fresher hiring, and the work is usually the company’s own core product.',
    path: '/insights/playbook/how-to-get-into-a-gcc-as-a-fresher',
  },
  {
    term: 'Third-party payroll', question: 'What is third-party payroll?', tier: 'convention',
    short: 'You work at one company but are employed and paid by a staffing firm. Your offer letter carries the staffing firm’s name.',
    why: 'Benefits, appraisals and job security follow the staffing firm, not the brand on the building. Check whose letter you are signing.',
  },
  {
    term: 'Bench', question: 'What does being on the bench mean?', tier: 'convention',
    short: 'Being employed and paid but not assigned to a project. Common in IT services between client engagements.',
    why: 'Long periods on the bench can affect appraisals and, in some companies, continued employment.',
  },
  {
    term: 'Rotational shift', question: 'What is a rotational shift?', tier: 'convention',
    short: 'A schedule where your working hours change on a cycle, including nights. Standard in support, operations and healthcare roles.',
    why: 'Check whether transport is provided for night shifts, especially if you are travelling late.',
  },
  {
    term: 'Hybrid', question: 'What does hybrid working mean?', tier: 'convention',
    short: 'A mix of office and home working, usually with a stated minimum number of office days a week.',
    why: 'The most common arrangement in our listings. Ask how many days, and whether the number is fixed or a team decision.',
  },
  {
    term: 'Internship', question: 'What is an internship?', tier: 'convention',
    short: 'A short, usually paid placement to gain experience, often while studying or just after. Shorter and less formal than an apprenticeship.',
    why: 'Converts into a full-time role far more often than a cold application does. Ask the conversion rate.',
    path: '/c/internships',
  },
];

/** Terms that can be posted without a person checking them first. */
export const postable = () => GLOSSARY.filter((t) => t.tier === 'convention');

/** Look a term up by name, case-insensitively. */
export const lookup = (name) =>
  GLOSSARY.find((t) => t.term.toLowerCase() === String(name).toLowerCase()) ?? null;
