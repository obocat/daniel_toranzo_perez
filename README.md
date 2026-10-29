# Daniel Toranzo Pérez — CV & Blog

Personal CV and technical blog built with Jekyll and hosted on GitHub Pages.

**Live site:** [www.obocat.com](https://www.obocat.com)

## Overview

This repository contains my bilingual CV and a small technical blog. The site is
static, data-driven, and designed to work without a build step on the client:
Jekyll generates the pages, SCSS handles the styling, and a small amount of
vanilla JavaScript provides the language switch and UI interactions.

### Features

- Bilingual Spanish/English interface with a persisted language preference.
- Light and dark appearance based on the operating system preference.
- Data-driven CV sections: profile, experience, projects, skills, education,
  certifications, contact, and social links.
- Blog with a yearly archive, tags, reading time, previous/next navigation, and
  per-post SEO metadata.
- Print-friendly CV layout.
- Responsive Apple-inspired design.
- Custom domain configured through `CNAME`.

## Tech stack

- [Jekyll](https://jekyllrb.com/) 3.8 through the `github-pages` gem.
- Kramdown for Markdown rendering.
- Rouge for syntax highlighting.
- SCSS compiled to `css/main.css`.
- Vanilla JavaScript for the language toggle, reveal effects, and date
  localisation.

## Project structure

```text
.
├── _config.yml              # Site metadata, sections, and social links
├── _data/                   # CV content (experience, projects, skills, ...)
├── _includes/               # Header, blog card, icons, shared fragments
├── _layouts/
│   ├── resume.html          # Main CV page
│   ├── blog-index.html      # /blog/ listing
│   └── blog.html            # Individual article
├── _posts/                  # Blog articles
├── blog/index.html          # Blog entry point
├── css/
│   ├── main.scss            # Source styles
│   └── main.css             # Compiled styles served by the site
├── js/reveal.js             # Language switch and UI behaviour
├── images/                  # Avatar, project images, social card
├── index.html               # CV page
└── CNAME                    # Custom domain
```

## Running locally

### Requirements

- Ruby
- Bundler
- The dependencies declared in the `Gemfile`

### Start the site

```bash
bundle install
bundle exec jekyll serve
```

Open [http://localhost:4000](http://localhost:4000).

Changes to `_config.yml` require restarting the server. Changes to Markdown,
Liquid, and data files are picked up automatically.

### CSS compilation

The project keeps both `css/main.scss` and the compiled `css/main.css`. Because
the compiled file already exists in the source tree, Jekyll does not regenerate
it automatically. After editing SCSS, run:

```bash
bundle exec sass --sourcemap=auto css/main.scss css/main.css
```

Then rebuild or let `jekyll serve` refresh the page.

## Customising the CV

| What to change | Where |
| --- | --- |
| Site title, description, URL, social links | `_config.yml` |
| Profile summary and location | `_data/profile.yml` |
| Work experience | `_data/experience.yml` |
| Projects and project links | `_data/projects.yml` |
| Skills | `_data/skills.yml` |
| Education | `_data/education.yml` |
| Certifications | `_data/certifications.yml` |
| External links | `_data/links.yml` |
| Page markup and section order | `_layouts/resume.html` |
| Colours, spacing, typography | `css/main.scss` |
| Language switch and interactions | `js/reveal.js` |

Sections can be shown or hidden from the `resume_section_*` flags in
`_config.yml`.

## Bilingual content

The site uses two complementary mechanisms:

- **Data files:** English variants use the `_en` suffix, for example
  `position_en`, `summary_en`, or `tagline_en`. When an English value is
  missing, the Spanish value is used as a fallback.
- **Markup and articles:** UI strings and article bodies are wrapped in
  `.lang-es` and `.lang-en` elements. CSS displays only the active language.

The selected language is stored in `localStorage` under `cv-lang`. Dates are
rendered with `<time data-date="YYYY-MM-DD">` and formatted by JavaScript using
`Intl.DateTimeFormat`, so blog dates follow the selected language.

## Writing a blog post

Create a file in `_posts/` named `YYYY-MM-DD-slug.markdown`:

```yaml
---
title: "Título en español"
title_en: "Title in English"
date: 2026-10-26 00:00:00
description: "Resumen usado en la tarjeta y en SEO."
description_en: "Summary used on the card and for SEO."
lang: es
tags: [iOS, Swift]
categories: blog
layout: blog
reading_time: 6
---
```

For a bilingual article, wrap each version in a container with
`markdown="1"` so Kramdown processes the Markdown inside it:

```html
<div class="lang-es" lang="es" markdown="1">

Contenido en español.

</div>

<div class="lang-en" lang="en" markdown="1">

Content in English.

</div>
```

Notes:

- `title_en`, `description_en`, and `reading_time` are optional.
- If `reading_time` is omitted, it is calculated from the post content. For
  bilingual posts, set it manually so both languages are not counted at once.
- Post URLs use `/blog/:year/:month/:day/:title/`.
- The latest three posts are shown on the CV home page. Set
  `resume_section_blog: false` in `_config.yml` to hide that section.
- The blog archive is available at `/blog/` and is grouped by year.

## Deployment

The site is designed for GitHub Pages:

1. Push the changes to the repository.
2. GitHub Pages builds the Jekyll site.
3. The custom domain is configured in `CNAME` and in the repository's Pages
   settings.

The current production domain is [www.obocat.com](https://www.obocat.com).

For local verification before publishing:

```bash
bundle exec jekyll build
```

The generated site is written to `_site/`. The build also produces
`_site/sitemap.xml` through the `jekyll-sitemap` plugin, listing the home page,
the blog archive, and every published post.

## Contributing

This is a personal site, but suggestions and bug reports are welcome in the
[repository issues](https://github.com/obocat/daniel_toranzo_perez/issues).

## License

The code and styles are released under the MIT license. See [LICENSE](LICENSE).
The CV content, personal information, and images are not intended for reuse.
