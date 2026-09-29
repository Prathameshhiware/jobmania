// Employer job descriptions arrive as HTML from third-party ATS feeds and are
// rendered with set:html. That is a stored-XSS sink: a compromised or hostile
// posting could ship <script>, an onerror handler, or a javascript: URL, and it
// would execute in every visitor's browser on our origin.
//
// Sanitised twice on purpose — once on ingest so the database holds clean HTML,
// and again on render so rows stored before this existed are still safe.

import sanitizeHtml from 'sanitize-html';

const OPTIONS = {
  // Formatting a job description legitimately needs, and nothing more.
  allowedTags: [
    'p', 'br', 'hr', 'div', 'span',
    'b', 'strong', 'i', 'em', 'u', 'small', 'sub', 'sup',
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'blockquote', 'pre', 'code',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a',
  ],
  allowedAttributes: {
    a: ['href', 'title'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  // No javascript:, data: or vbscript: URLs.
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href'],
  // Outbound links from employer copy are untrusted: never leak the referrer
  // and never hand over window.opener.
  transformTags: {
    a: (tagName, attribs) => ({
      tagName: 'a',
      attribs: { ...attribs, rel: 'nofollow noopener noreferrer ugc', target: '_blank' },
    }),
  },
  // style= can be an attack surface of its own; the page supplies the styling.
  allowedStyles: {},
  disallowedTagsMode: 'discard',
  // Strip the contents of these entirely rather than leaving the text behind.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript', 'iframe', 'object', 'embed'],
};

/** @returns {string|null} clean HTML, or null when nothing survives */
export function sanitizeJobHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const clean = sanitizeHtml(html, OPTIONS).trim();
  return clean.length ? clean : null;
}
