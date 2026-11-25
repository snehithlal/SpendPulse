# Testing and acceptance

## Automated checks

```bash
npm ci
npm run check
npm run build
npm exec playwright -- install chromium
npm run test:e2e
```

Vitest covers paise conversion, income/expense distinctions, transfers, splits, linked reimbursements, partial/capped refunds, cross-month effects, exclusion, invalid dates, source/possible duplicate detection, date boundaries, English/Manglish rules, receipt totals, and spreadsheet mapping.

Embedded PostgreSQL tests apply the migrations to PGlite with a minimal Supabase Auth fixture. They exercise owner/stranger/anonymous roles, token-table isolation, invalid writes, atomic imports, foreign-key protection, signup-hook rejection, and retirement of the AI cap RPC.

Playwright runs desktop Chrome and a mobile Chrome viewport against the exported site. It exercises an empty local ledger, income creation, expense creation/editing, persistence after reload, calendar values, CSV import and repeat import deselection, and basic responsive overflow. It asserts manual operations make no generative AI/backend integration requests.

Additional browser cases load a synthetic text PDF through the real PDF worker and extract a synthetic bill image through the real OCR engine. OCR is run once on desktop; its duplicate mobile test is explicitly skipped. Camera hardware, real speech engines, and protected-PDF passwords still require the manual acceptance checks below.

If a server is already available:

```bash
TEST_BASE_URL=http://127.0.0.1:3000 npm run test:e2e
```

Screenshots and traces are under ignored `test-results/` and `playwright-report/`. Never commit artifacts captured with real financial data.

## Backend type check

```bash
npm exec deno -- check --config supabase/functions/integrations/deno.json supabase/functions/integrations/index.ts
```

This verifies types and module resolution, not real OAuth, deployment, database permissions, or provider behavior. The Supabase runtime is configured separately from the frontend TypeScript project.

## Real-service acceptance matrix

| Scenario | Expected result |
| --- | --- |
| Owner signs in | Google returns to the correct Pages/Vercel URL; private ledger loads |
| Another Google account signs in | Auth hook rejects signup; RLS denies any direct access |
| Anonymous database request | No transaction/preferences data returned |
| Browser tries to read token/usage tables | Access denied |
| Invalid transaction through REST | SQL validation rejects invalid amounts, dates, splits, and links |
| Import batch fails validation | Entire batch rolls back |
| Two identical import requests | Unique source keys/UUIDs prevent duplicates |
| Gmail permission denied/expired | Clear error and reconnect path; manual ledger unaffected |
| OAuth callback replay | Consumed/expired state rejected |
| AI disabled | The backend rejects AI calls before contacting Gemini. Manual features remain available |
| Missing Gemini secret | Check AI setup reports the missing key without calling Gemini |
| Gmail sync with AI unchecked | Unparsed alerts stay in manual review |
| Gemini timeout/malformed JSON | Error shown without any ledger writes |
| Provider output contains unknown data | Schema validation/review prevents automatic writes |
| Pages subpath deployment | App, CSS, workers, OAuth callbacks, and refresh work under repository path |
| Vercel root deployment | Same features work with empty base path |

## Document/voice manual checks

Use synthetic or consented, anonymized fixtures:

1. Text PDF with a single transaction; verify amount/date/merchant.
2. Password-protected PDF, wrong password, then correct password.
3. Scanned PDF/image; verify OCR progress and cancellation.
4. Blurry/rotated bill and conflicting subtotal/final total; verify missing values require review.
5. Spreadsheet with preamble rows, multiple sheets, debit/credit columns, and Indian digit grouping.
6. Same purchase from Gmail, a receipt, and a statement; verify possible duplicates are surfaced.
7. A statement containing repayment, refund, and balance rows; correct the transaction types before importing.
8. Unsupported format, corrupt file, oversized file, and too many pages/rows; verify actionable errors.
9. Mic permission denied, unsupported browser, English utterance, and common Manglish utterance.
10. Keyboard-only modal editing, Escape, focus restoration, dark/light themes, and reduced-motion preference.

Generic parsers cannot guarantee correctness for every bank layout. Add regression fixtures whenever introducing issuer-specific handling.

## Release evidence

Record actual command results and live-service checks in the handover or release notes. A successful static build does not prove Google credentials or database policies are configured in a deployed account. Do not claim a live integration was verified unless it actually was.
