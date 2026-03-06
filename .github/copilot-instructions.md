# Copilot Instructions for `skip-class`

## Build, test, and lint commands

- Install deps (local): `npm install`
- Start local dev server: `npm run dev`
- Lint: `npm run lint`
- Build: `VITE_API_BASE_URL=https://your-api-host.example.com/path npm run build`
- Run all E2E tests: `npm run test:e2e`
- Run a single E2E spec: `npm run test:e2e -- e2e/app.spec.ts`
- Run one E2E test by name: `npm run test:e2e -- -g "shows the watch api tool heading"`
- First-time Playwright browser install: `npx playwright install --with-deps chromium`

CI uses Bun (see `.github/workflows/ci.yml`), so parity checks can also be run with:

- `bun install --frozen-lockfile`
- `bun run lint`
- `VITE_API_BASE_URL=https://your-api-host.example.com/path bun run build`
- `bun run test:e2e`

## High-level architecture

- This is a single-page Svelte 5 + Vite app. `src/main.ts` mounts `src/App.svelte`, and almost all product behavior is implemented directly in `App.svelte`.
- `App.svelte` owns the full watch-request flow: form state, field validation, endpoint construction, payload serialization, POST submission, and response rendering.
- API target URL is built from `VITE_API_BASE_URL` plus `/class/{classId}/learning-activity/{activityId}/watch`; class/activity IDs are URL-encoded before request submission.
- Preview panes are feature-flagged by `VITE_ENABLE_PREVIEW_PANES === 'true'`; when enabled, request preview text and a sandboxed iframe preview are generated client-side.
- E2E tests are Playwright-based (`e2e/`), and `playwright.config.ts` starts a local Vite server on `127.0.0.1:4173` via `webServer`.
- GitHub Pages deployment computes base path in workflow and builds with `bun run build -- --base "${BASE_PATH%/}/"` rather than hardcoding repo subpaths in source.

## Key conventions in this repo

- Keep user-facing copy in Traditional Chinese (existing labels/messages are Chinese-first).
- Treat `VITE_API_BASE_URL` as required: when missing, UI must clearly surface the configuration error and prevent submission.
- Keep preview panes opt-in and strict: only exact string `true` enables them.
- Preserve validation behavior unless requirements change: all numeric fields must be integers >= 0, `playedEnd >= playedStart`, and `last_view_time >= playedEnd`.
- Do not hardcode or auto-fill Bearer tokens; tokens come from user input only.
- Maintain current preview safety model: mask token in preview output, escape preview HTML, and keep iframe sandbox locked down (`sandbox=""`).
