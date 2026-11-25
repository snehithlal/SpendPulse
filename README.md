# SpendPulse

**A little clarity. A lot of possibility.**

A personal finance dashboard for India: manual expenses and income, category icons, a spending calendar, budgets, statement imports, bill scanning, and optional voice/AI assistance. The frontend can run on **GitHub Pages or Vercel**. Your cloud records live in a separately protected Supabase project.

## Start locally

```bash
nvm install
nvm use
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000). No credentials are needed to explore the synthetic demo or start a local ledger. Choose **Start my ledger** for an empty personal ledger. Browser storage is not a backup: export JSON from Settings regularly.

## What you can do

- Add, edit, delete, categorize, and exclude expenses; record income, refunds, transfers, and reimbursements.
- Customize category names, colors, and symbols. INR is the default and only currency.
- Browse daily expenses and income in a monthly calendar.
- Track personal shares of shared bills and outstanding friend payments.
- Plan category budgets and salary allocation between accounts.
- Import PDF, XLSX, XLS, and CSV statements with an editable preview and duplicate checks.
- Photograph a bill or upload an image; extract its total with local OCR and rules.
- Use English/Manglish voice entry on supported browsers, then review and save.
- Store account metadata and user-verified reward rules; compare estimated rewards.
- Connect private Supabase storage, Google login, and read-only Gmail imports.
- Use Gemini for extraction and savings explanations once the cloud ledger and Gemini key are configured.

**AI is optional.** Manual finance features work without it. Browser dictation and OCR model downloads may still need network access. Real Gmail, Google login, and Gemini require your credentials and deployment configuration; they are not preconnected.

Open **Settings → Backend connection** for Supabase setup and **Settings → AI setup** for Gemini. Follow the [Supabase deployment steps](docs/deployment.md#supabase-database-and-authentication) and [Gemini setup](docs/integrations.md#gemini-setup). New cloud ledgers enable AI by default. Google’s quotas and billing apply.

## Documentation

| Guide | Read it for |
| --- | --- |
| [Documentation index](docs/README.md) | Suggested reading order and feature coverage |
| [Installation](docs/installation.md) | Local setup, configuration, scripts, dependency policy |
| [Architecture](docs/architecture.md) | Components, data model, trust boundaries, diagrams, accounting |
| [Deployment](docs/deployment.md) | GitHub Pages, Vercel, and Supabase setup |
| [Integrations](docs/integrations.md) | Google OAuth, Gmail, optional AI, and document extraction |
| [Testing](docs/testing.md) | Automated checks and real-service acceptance scenarios |
| [Handover](docs/handover.md) | Maintainer orientation, limitations, operational procedures |

## Stack and conventions

Next.js 16, React 19, TypeScript 7, Tailwind CSS 4, TanStack Query 5, Zod 4, Supabase, Radix Dialog, Recharts, PDF.js, SheetJS, Tesseract.js, Biome, Vitest, and Playwright. Exact versions are pinned in `package.json` and `package-lock.json` after resolving the latest stable releases on November 25, 2026. SheetJS comes from its official distribution, not its older npm listing.

Use arrow functions, strict TypeScript, Zod at input boundaries, and pure money calculations in integer paise. Biome handles formatting and linting because the current Next ESLint dependency stack does not support TypeScript 7. The application uses static export on both hosts; it does not require a Next.js server.

```bash
npm run check       # types, lint, unit tests
npm run build       # static production site in out/
npm run start       # serve the production site locally
npm run test:e2e    # desktop and mobile Chromium workflows
npm run format     # consistent formatting
```

## Privacy and readiness

Only code and synthetic fixtures belong in the public repository. Never commit real bills, statements, backups, tokens, or `.env` files. The static UI is public; Supabase authorization protects cloud data. Local mode is protected by your device/browser, not a login.

Statement parsing is a review-first assistant, not a certified bank statement reconciler. Card rewards are not prepopulated with unverified marketing claims. See the [handover](docs/handover.md) for the exact implementation boundaries and remaining live-service checks.
