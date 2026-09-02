# UncommonStash

UncommonStash is a collection of useful browser-based tools. Everything runs
locally in your browser — no uploads, no server processing.

Live site: [https://uncommonstash.com](https://uncommonstash.com)

Built with Vite + React + Tailwind CSS, deployed as a static site to GitHub
Pages (custom domain via `public/CNAME`).

## Getting Started

Install Node.js 24 and pnpm 10, then install dependencies:

```bash
pnpm install
```

Copy the example env file (optional — the app works without it):

```bash
cp .env.example .env
```

Then run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

## Building

```bash
pnpm build
```

Output goes to `dist/` (plus `dist/404.html` SPA fallback, `dist/.nojekyll`,
`dist/CNAME`). Preview the production build:

```bash
pnpm preview
```

## Tests

```bash
pnpm test
pnpm lint
npx tsc -b
```

E2E (Playwright, Chromium):

```bash
npx playwright install chromium
pnpm exec playwright test
```

## Deployment

Pushes to `main` trigger `.github/workflows/deploy-pages.yml`:
`install → build → upload dist/ → deploy-pages`.
In repo Settings → Pages, set Source to **GitHub Actions**, add the custom
domain `uncommonstash.com`, and enforce HTTPS.

## Configuration

- `vite.config.ts` — Vite + `@` alias + `magick.wasm` static copy
- `index.html` — fonts, meta, root entry
- `.env.example` — `VITE_GA_ID`, `VITE_CRONFORMER_API_URL`, `VITE_BASE_URL`
- `scripts/prebuild-blog.mjs` — `content/blog/*.md` → `src/lib/blog-data.ts`
- `scripts/collect-tools.mjs` — `src/pages/**/tool.yaml` → `src/lib/tools.json`
- `scripts/postbuild-pages.mjs` — `404.html`, `.nojekyll`, `CNAME`

The optional text-to-cron AI suggestions call `VITE_CRONFORMER_API_URL`
directly from the browser. Without it, that tool falls back to local
`cronstrue`/`cron-parser` while the rest of the app keeps working.

## Project Structure

- `src/main.tsx`, `src/App.tsx` — entry + `react-router` routes
- `src/pages/` — one folder per tool + `home.tsx`, `blog/`, `DynamicConverter.tsx`
- `src/components/` — converters, Radix/Shadcn-style `ui/`, `app-bar`, `page-meta`
- `src/lib/` — `ffmpeg`, `blog`, `gtag`, `utils`, `compat`, generated `tools.json`/`blog-data.ts`
- `content/blog/` — Markdown posts
- `public/` — `logo.svg`, `magick.wasm`, `CNAME`
- `e2e/` — Playwright specs

## Tech Stack

- **Build**: Vite 6 + `@vitejs/plugin-react`
- **UI**: React 19, React Router 7, Tailwind CSS 4, Radix UI
- **WASM**: `@ffmpeg/core` (single-thread), `@imagemagick/magick-wasm`, `tesseract.js`
- **Language**: TypeScript (strict, `tsc -b`)
- **Hosting**: GitHub Pages (static, no server)

## License

MIT — see [LICENSE](./LICENSE).
