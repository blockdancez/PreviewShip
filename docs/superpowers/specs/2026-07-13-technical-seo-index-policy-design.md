# Technical SEO index policy design

Approved: 2026-07-13

## Goal

Make route metadata, sitemap discovery, hreflang, prerendered language, Showcase discovery, and IndexNow submission follow one explicit index policy.

## Content states

- `CURATED`: indexable canonical content maintained as a primary page.
- `PROVEN`: indexable localized page with confirmed search performance. Exactly 23 localized paths are pinned in code.
- `OBSERVE`: an existing localized page kept indexable for a 28-day observation window beginning 2026-07-13. It remains available but is excluded from proactive discovery signals. New generic localized pages are not created in this state.
- `NOINDEX`: rendered with `noindex, follow` and excluded from sitemap and hreflang, so crawlers can still discover useful canonical pages through its links.

English content entries are `CURATED`. The 23 approved localized paths are `PROVEN`. Existing non-proven localized pages are `OBSERVE` until the later signal-import process makes an explicit promotion or demotion decision.

## Observation status command

Run `npm run seo:index-status -- --input <signals.json|signals.csv>` from `console/`. Each input row contains `path`, `clicks`, `impressions`, `position`, and `bingAiCitations`; `observeSince` is optional and defaults to `2026-07-13`. JSON may be a row array or an object with a `rows` array, and CSV uses the same field names as headers.

The command defaults to a dry run and prints its decisions without changing repository files. Only an explicit `--write` updates `config/content-index-overrides.json`; `--write <path>` writes to a different manifest. Partial or missing GSC/Bing data remains `OBSERVE`, so an incomplete import cannot accidentally remove a page from the index.

## Generation rules

- Route metadata is generated for all existing routes so direct visits keep working.
- Sitemap and hreflang contain only `CURATED` and `PROVEN` URLs.
- `OBSERVE` stays `index, follow` during the observation window but is removed from sitemap and hreflang proactive discovery.
- `NOINDEX` never enters sitemap or hreflang.
- Prerendered HTML receives the URL locale in the static `<html lang>` attribute and static alternate links.
- The build validator asserts the exact 23-path PROVEN set and cross-checks metadata, sitemap, hreflang, language, and index state.

## Showcase

- `previewship.com/public/showcase/sitemap.xml` proxies to the public backend sitemap.
- Direct `/showcase/:itemId` requests proxy to a backend-rendered HTML page containing canonical metadata, CreativeWork JSON-LD, visible title/description/cover/tags, and a real 404 for unavailable work.
- Browser-side navigation may continue using the React detail page.

## IndexNow

- Submission operates on explicitly changed URLs rather than every sitemap URL.
- Static page changes are derived from the current sitemap `lastmod` values and an optional deployment baseline; an explicit environment URL list remains available for release automation.
- Showcase lifecycle changes are outside the static build submission and can be added to backend event delivery independently.
- Empty change sets skip submission; network failure remains fail-soft unless strict mode is enabled.

## Structured data

The HTML template owns only site-wide schema that is not emitted by the landing component. Duplicate Organization and SoftwareApplication entities are removed from the template so the prerendered home page has one authoritative representation.

## Verification

- Console unit tests.
- Public SEO validator.
- Full console production build.
- Backend Showcase controller/service tests for 200, escaping, and 404 behavior.
