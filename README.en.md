<div align="center">

<img src="client/public/icon.svg" width="88" alt="MarkBook" />

# MarkBook

**Scattered text, gathered into a book.**

Read a folder of .md / .txt files as one continuous book, entirely in your browser

[![CI](https://github.com/rockbenben/markbook/actions/workflows/ci.yml/badge.svg)](https://github.com/rockbenben/markbook/actions/workflows/ci.yml)
[![Live Demo](https://img.shields.io/badge/Live%20Demo-markbook.newzone.top-2c5a80)](https://markbook.newzone.top/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![365 Open Source Plan #011](https://img.shields.io/badge/365%20Open%20Source%20Plan-%23011-1f6feb)](https://github.com/rockbenben/365opensource)

</div>

**English** · [简体中文](README.md)

🚀 **[Try it in your browser](https://markbook.newzone.top/)** — opens a folder from your own machine, uploads nothing.

![MarkBook screenshot](docs/screenshot.png)

Point it at a folder of `.md` / `.txt` files (subfolders included) — **or one large file** — and it becomes a single continuous, navigable, searchable, exportable book. Reading comes first; when you spot something worth fixing, you edit it in place and it writes back to the original file. Everything runs locally, nothing is uploaded, and external file changes sync live.

Do you have a pile of loose text sitting on disk — a few hundred `chapter-NNN.md` files, a multi-megabyte `.txt` you downloaded, a folder of messy notes? MarkBook splits or gathers them into **one continuous book**: it detects chapters and volumes, sorts them naturally, indexes them for full-text search, and exports by volume to TXT / EPUB / HTML. Spotted a typo, need to rename a character throughout, or want to clean up garbled downloaded text? **Edit in place, replace across the whole book, tidy up in one click** — then it writes back to the source files. It isn't trying to replace your editor. It does one thing thoroughly: **make that pile of text comfortable to read.**

## Features

- **📚 Gather / split** — every `.md` / `.txt` under a folder is stitched into one continuously scrolling document in natural order; open a single large file and it's split into chapters by heading (`#` / `##`, `Chapter X`, `1.1`, Setext underlines, and Chinese chapter conventions). `.md` supports YAML frontmatter (`title` becomes the heading, `tags` render as labels).
- **🎨 Reading experience** — virtualized rendering (smooth at hundreds or thousands of chapters; oversized single chapters paginate automatically), rendered / source views, font size, line height, typeface, page width, first-line indent, sepia / parchment / night backgrounds, immersive mode, reading progress and bookmarks — all persisted, all responsive down to narrow screens.
- **🧭 Navigation** — an auto-generated, volume-grouped, collapsible, filterable table of contents that highlights and follows the current chapter; a floating **in-chapter outline** for long documents; markdown **cross-file links** (`[x](./other.md)`) jump to the matching chapter; `j` / `k`, space to page, `Home` / `End`; in folder mode you can **drag to reorder** within a volume (order is stored in your browser and carries through to exports).
- **🔍 Search** — FlexSearch index plus `Intl.Segmenter` word segmentation, multi-term and prefix matching, relevance ranking, per-chapter hit counts, and hit highlighting after you jump.
- **📤 Export** — whole book or by volume, to TXT / Markdown / HTML (with its own contents and styling) / EPUB — ready for a Kindle, a phone reader, or sharing. PDF goes through your browser's print dialog on the generated HTML; EPUB needs the server build.
- **✏️ Edit and tidy in passing** — fix a typo where you find it, find-and-replace across every chapter, one-click **tidy up** (strip garbled characters, duplicate lines, separator rules, full-width digits… with a preview), create / rename / delete chapters. CodeMirror with a split preview, debounced auto-save, and mtime conflict protection. **Enough to be useful, not competing with a real editor.**
- **⚡ Live sync** — chokidar watching plus WebSocket push: edit a file elsewhere and the view updates smoothly, keeping your scroll position (server mode).
- **🌍 Interface languages** — English and 简体中文, switchable in Settings; defaults to your browser language.

> Good for novels and downloaded web fiction, technical docs, research material, notes and journals — anything made of many pieces of text that you'd rather read as a book.
>
> Everything runs on your machine; your data never leaves it. Feature-by-feature notes in the [usage guide](docs/USAGE.md) (written in Chinese).

## Where it fits

It started out for **writing long fiction**: a few hundred chapter files in one folder, gathered into a continuous manuscript to read through, revise in place, find-and-replace across, and export by volume. Beyond that, anything shaped like "**a lot of text I'd rather read — and fix — as one book**" works:

- **✍️ Fiction — writing and reading** — read many chapters continuously to judge pacing and continuity; revise in place, rename a character book-wide, tidy up text downloaded from fiction sites, export by volume.
- **📚 Technical docs / manuals** — read scattered `.md` files as one, or split a large manual into navigable chapters by heading.
- **🗒️ Notes / research material** — files by date or topic, plus loose excerpts, become one fully searchable notebook you can edit as you go.
- **📖 Making ebooks** — gather, then export to TXT / Markdown / HTML / EPUB for a Kindle or phone reader.

Translation and proofreading, scripts and talks, or taking over someone else's pile of text — same shape, same fit.

> It doesn't require a particular folder layout or naming scheme — numbered filenames sort most accurately, but headings and filenames work as a fallback.

## Quick start

```bash
npm install

# development (frontend 5173 + backend 5179, proxied, hot reload)
npm run dev

# point it at the library you want to read (a folder or a single file):
CV_ROOT=/path/to/library npm run dev
# Windows PowerShell:  $env:CV_ROOT='D:\my-novels'; npm run dev
```

For everyday use:

```bash
npm run build
CV_ROOT=/path/to/library npm start   # single process, opens your browser
```

The root folder you pick in the UI, the sort order, and your reading preferences are stored **in your browser** (localStorage) and restored on reload. `CV_ROOT` or a command-line argument sets the default library at startup.

## Two ways to deploy

|                        | Server mode                          | Static web mode                                            |
| ---------------------- | ------------------------------------ | ---------------------------------------------------------- |
| How to run             | `npm run build && npm start` (Node)  | `npm run build:static` → host `dist/static` anywhere       |
| Where files come from  | the server's filesystem              | the visitor's **own browser**, picking their own folder     |
| Live external changes  | ✅                                   | ❌ (manual refresh re-reads)                                |
| Installable / offline  | —                                    | ✅ (PWA)                                                    |
| Best for               | a local tool on your own machine     | a page anyone can use directly, uploading nothing           |

The static build can read, search, edit, and export, with all settings in the browser. Chrome and Edge can edit in place via the File System Access API; other browsers are read-only. See **[DEPLOY](docs/DEPLOY.md)**.

## Two content modes

| What you open   | Mode        | Chapters come from                                                    |
| --------------- | ----------- | --------------------------------------------------------------------- |
| **A folder**    | folder mode | each `.md` / `.txt` file is a chapter; subfolders are volumes          |
| **A file**      | file mode   | headings inside the file; `#` = volume, `##` = chapter, auto-detected  |

Reading, searching, editing, and exporting behave identically in both. Recognized heading and numbering formats are listed in [FORMATS](docs/FORMATS.md).

## Documentation

Detailed docs are maintained in Chinese; the structure and field names are language-neutral.

| Document                                     | Covers                                                                        |
| -------------------------------------------- | ----------------------------------------------------------------------------- |
| [USAGE](docs/USAGE.md)                        | reading, editing, searching, exporting, settings                              |
| [DEPLOY](docs/DEPLOY.md)                      | server vs static, securing a public deployment (token / sandbox), PWA          |
| [CONFIGURATION](docs/CONFIGURATION.md)        | where settings live, env vars, root precedence, sorting and ignore rules       |
| [FORMATS](docs/FORMATS.md)                    | folder vs single file, heading / volume / chapter / numbering rules            |

## Stack

- **Frontend** — Vite 8 (Rolldown) + React 19 + TypeScript + antd 6 + zustand; reading via react-markdown (remark-gfm, rehype-highlight, github-slugger), editing via CodeMirror 6 (lazy-loaded), lists via react-virtuoso; tests with Vitest 4.
- **Backend** — Fastify 5 + chokidar + WebSocket, search via FlexSearch, export via unified / epub-gen-memory, bundled to a single-file server with esbuild.
- **Shared core** — everything environment-independent (parsing, splitting, sorting, search, export, tidy-up, links, render preprocessing, ids) lives in `core/` and is shared between server and browser, so **one implementation keeps both in sync**. The static build (`npm run build:static`) uses exactly that to run the same logic in the browser over the File System Access API and localStorage.

Local-only. Nothing uploaded.

## Privacy

No telemetry, no analytics, no third-party requests. Files are read from your machine and written back to it. In static mode the browser holds a File System Access handle you granted; in server mode the Node process reads the root you configured and listens on `127.0.0.1` by default — exposing it on the network requires explicitly setting `CV_HOST`.

## Contributing

Issues and pull requests are welcome.

## About the 365 Open Source Plan

Project **#011** of the [365 Open Source Plan](https://github.com/rockbenben/365opensource) — one person + AI, 300+ open-source projects in a year. [Submit your idea →](https://365.aishort.top/) · [Discord](https://discord.gg/PZTQfJ4GjX) · [Telegram](https://t.me/aishort_top)

## License

[MIT](LICENSE) © rockbenben
