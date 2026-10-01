# Writing an article yourself

Articles you write live in the repository as files. The weekly roundup does not —
it is written by a machine and stored in the database. That split is deliberate:
anything a person wrote should be in version control, where a change can be
reviewed and a mistake can be undone.

You do not need to install anything. GitHub's website can create the file.

---

## The short version

1. Go to **https://github.com/Prathameshhiware/jobmania/new/main/src/content/insights**
2. Type a filename ending in `.md`. **This becomes the web address**, so use
   lowercase words joined by hyphens: `how-to-prepare-for-a-walk-in.md`
3. Paste the template below and write your piece under the second `---`
4. Scroll down, click **Commit changes**
5. Wait about two minutes. Vercel rebuilds and the article is live.

The address it lands at depends on `kind`:

| `kind:` | The article appears at |
|---|---|
| `blog` | `/insights/blogs/your-filename` |
| `playbook` | `/insights/playbook/your-filename` |
| `thought-leadership` | `/insights/thought-leadership/your-filename` |

---

## The template

Everything between the two `---` lines is settings. Everything after is the
article. Copy all of it.

```markdown
---
kind: blog
title: "Your headline, as a reader should see it"
dek: "One or two sentences under the headline explaining what the reader gets. This must be at least 40 characters long or the build will refuse it."
seoTitle: "Short Title For Google"
metaDescription: "The sentence Google shows under your link in search results. Keep it under 160 characters and put the important words early."
published: 2026-10-05
tags:
  - fresher jobs
  - walk-in interviews
faq:
  - q: A question people actually type into Google?
    a: "A direct answer, two or three sentences. These show on the page and are what AI assistants quote."
sources:
  - label: Economic Times — report name
    url: https://economictimes.indiatimes.com/example
---

## Your first heading

Write normally. A blank line starts a new paragraph.

**Bold** uses two asterisks. A [link to another page on your site](/c/walk-ins)
is written like that — internal links help your ranking, so use a few.

- Bullet points start with a dash
- One per line

## Another heading

Two hash marks for a heading, three for a smaller one.
```

---

## The rules that will stop a build

These are checked when the site rebuilds. Break one and your article will not
appear, and Vercel will show the deployment as failed. **Your live site stays up
and is not harmed** — the previous version keeps serving — but you will need to
fix the file and commit again.

| Field | Rule |
|---|---|
| `kind` | Exactly `blog`, `playbook`, or `thought-leadership`. Nothing else. |
| `title` | Required. Under 120 characters. |
| `dek` | Required. **At least 40 characters**, at most 300. This is the one people trip on. |
| `seoTitle` | Optional. Under 60 characters. |
| `metaDescription` | Optional. Under 160 characters. |
| `published` | Required. Written as `2026-10-05`, year first. |

Anything with a colon or a quote inside it should be wrapped in double quotes,
as in the template. That is the other common cause of a failed build.

Optional fields you can simply delete if you are not using them: `seoTitle`,
`metaDescription`, `tags`, `faq`, `sources`, `dataAsOf`, `updated`.

---

## Two things worth knowing

**To work on something without publishing it**, add `draft: true` under `kind`.
It stays in the repository and never appears on the site. Remove the line when
it is ready.

**If you quote a figure from somewhere**, put it under `sources` with a link. A
notice at the foot of every article credits those publishers and offers to
remove the reference on request, so the list is what makes that promise real.
Anything you state as fact and cannot source should come out — the same rule the
automated roundup follows.
