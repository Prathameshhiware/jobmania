-- Articles written by the machine rather than by a person.
-- Run once in the Supabase SQL editor.
--
-- Why a table and not a file. Everything else the site publishes as writing
-- lives in the repository as markdown, which is the right home for it: a person
-- wrote it, a change to it is reviewable, and a mistake is revertable. But only
-- a CI runner can commit a file, and we no longer use one. So the weekly
-- roundup, which nobody writes and nobody reviews, is stored here and rendered
-- at request time.
--
-- That split is worth stating plainly, because it is also the honest one:
--   src/content/insights/*.md   authored by a person, in version control
--   public.generated_posts      produced by src/lib/roundup.js, from the
--                               numbers in `jobs` and headlines from the news
--                               allowlist, with nothing written in between
--
-- The body is stored as HTML. It is generated, not typed, so there is no
-- editing convenience to protect, and storing HTML means nothing has to parse
-- markdown on every page view.

create table if not exists public.generated_posts (
  slug             text primary key,

  -- Matches the `kind` enum the content collection uses, so a generated post
  -- and an authored one can sit in the same list and at the same URL shape.
  kind             text not null default 'blog'
                   check (kind in ('blog', 'thought-leadership', 'playbook')),

  title            text not null,
  dek              text not null,
  seo_title        text,
  meta_description text,

  published        date not null,
  updated          date,

  -- The moment the figures in the body were true. A statistic with no as-of
  -- date cannot be checked, and an answer engine quoting it has no way to know
  -- it has gone stale.
  data_as_of       date,

  tags             jsonb not null default '[]'::jsonb,
  faq              jsonb not null default '[]'::jsonb,

  -- Story links, emitted as schema.org `citation`. Not rendered as a separate
  -- list, because the body already shows each one with its publisher and date.
  citations        jsonb not null default '[]'::jsonb,

  html             text not null,
  -- Tags stripped, for reading time and for anything that wants the words
  -- without the markup.
  plain            text not null default '',

  generated_at     timestamptz not null default now()
);

create index if not exists generated_posts_published_idx
  on public.generated_posts (published desc);

comment on table public.generated_posts is
  'Articles produced by src/lib/roundup.js and published without review. Authored writing lives in the repository instead; this table is only for what a machine wrote.';

alter table public.generated_posts enable row level security;

-- Public read: these are published articles, and the site renders them to
-- anonymous visitors.
drop policy if exists generated_posts_public_read on public.generated_posts;
create policy generated_posts_public_read on public.generated_posts
  for select to anon, authenticated using (true);

grant select on public.generated_posts to anon, authenticated;
grant all privileges on public.generated_posts to service_role;

-- What has been published so far:
--   select slug, published, title, length(html) as bytes
--   from public.generated_posts order by published desc;
