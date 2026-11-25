# Installation and development

## Requirements

- Node.js 26 LTS recommended, selected by `.nvmrc`; Node.js 24.13 also runs the current build.
- npm; use the committed lockfile with `npm ci`.
- A modern browser. Android/desktop Chrome are the primary voice targets.
- Supabase and Google Cloud accounts only if enabling cloud integrations.

## Local setup

```bash
git clone YOUR_REPOSITORY_URL spendpulse
cd spendpulse
nvm install
nvm use
npm ci
cp .env.example .env.local
npm run dev
```

Leave the environment values empty for demo/local mode. Open [localhost:3000](http://localhost:3000). The default is clearly marked synthetic demo data. **Start my ledger** creates an empty, separate browser ledger.

## Public frontend configuration

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Public publishable/anon key; RLS must be configured |
| `NEXT_PUBLIC_BASE_PATH` | `/repository-name` on Pages; empty at a domain root or on Vercel |

These values are compiled into browser JavaScript. They are not secrets. Never put Google client secrets, a Supabase service-role key, or Gemini keys in `NEXT_PUBLIC_*` variables. Changing a public value requires rebuilding the frontend.

Backend variables are described in [integrations](integrations.md); their template is `supabase/functions/.env.example`.

## Commands

| Command | Result |
| --- | --- |
| `npm run dev` | Copies the PDF worker and starts Next.js development mode |
| `npm run typecheck` | Strict TypeScript checking of the frontend |
| `npm run lint` | Biome lint checks |
| `npm test` | Vitest domain/parser/persistence tests |
| `npm run check` | Typecheck, lint, and unit tests |
| `npm run build` | Copies the PDF worker, writes `.nojekyll`, exports to `out/` |
| `npm run start` | Serves `out/` for production testing |
| `npm run test:e2e` | Playwright desktop/mobile tests |
| `npm run format` | Formats TypeScript, TSX, JavaScript, and CSS |
| `npm exec deno -- check --config supabase/functions/integrations/deno.json supabase/functions/integrations/index.ts` | Checks the Edge Function separately |

Webpack is explicitly selected for Next builds/dev. Turbopack’s CSS evaluation attempted a restricted local socket in the authoring environment; Webpack successfully exports the same application without that worker requirement.

## Dependency policy

Direct dependencies are exact versions, resolved from latest stable releases during implementation. Future upgrades are deliberate: update dependencies, check compatibility, run both deployment build variants, review the lockfile, and commit it. Do not substitute floating `latest` tags into production configuration.

SheetJS is installed from its official release tarball because its npm package listing is not the maintained distribution. Keep the lockfile’s integrity hash. Tesseract may download its OCR language/model resources on first use; this downloads models rather than uploading your bill.

## Common problems

- **App appears empty:** demo/local/cloud modes have separate records. Check the mode in the top bar and Settings.
- **Private browsing or quota failure:** browser storage can be unavailable or full. Export backups and use normal browsing/cloud mode. Errors are surfaced rather than resetting records.
- **PDF worker 404:** run the asset preparation/build script and confirm the deployment base path.
- **Mic unavailable:** use HTTPS or localhost; allow microphone access. Browser support varies. Type the phrase or use keyboard dictation.
- **Cloud fails:** check public environment values, owner allowlist, database migration, and Auth redirect URLs.
- **Changed host/base path:** clear the previous build output by rebuilding; never reuse root-path artifacts for a Pages subpath.
