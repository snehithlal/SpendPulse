# Maintainer handover

## What is delivered

A Next.js static application with a complete navigable finance UI, local/demo persistence, optional Supabase persistence, income/expense CRUD, category icons/colors, calendar, budget simulator, account settings, verified-rule reward comparison, splits, refunds, reimbursements, import review, receipt OCR, voice entry, and rule-based insights.

The repository also contains the Supabase schema/policies, Google OAuth/Gmail/AI Edge Function, GitHub Pages workflow, Vercel configuration, tests, and installation/deployment documentation. External services are configurable implementations, not preconnected accounts. No site or repository has been published by this handover.

## Start here

1. Run [installation](installation.md), explore demo mode, then create an empty local ledger.
2. Read [architecture](architecture.md), particularly accounting and trust boundaries.
3. Run [automated checks](testing.md).
4. Follow [deployment](deployment.md) for the intended host.
5. Configure the owner allowlist and Auth hook before connecting real records.
6. Follow [integrations](integrations.md) and validate Google/AI with a small test range.

## Engineering decisions

- Static export on both hosts; Supabase remains the private backend. No server secrets in Next builds.
- Latest stable direct dependencies are pinned exactly; lockfile upgrades are reviewed.
- TypeScript 7 is retained. Biome replaces incompatible Next ESLint tooling.
- Arrow functions throughout application code. Zod domain validation and pure financial utilities.
- TanStack Query handles data refresh after confirmed mutations. Financial records are not optimistically accepted before persistence succeeds.
- Local and demo stores are separate; cloud mode does not silently migrate either.
- SQL stores per-transaction JSONB documents with relational owner/source/link columns and constraints.
- AI responses always become drafts or explanatory text. They cannot execute tools or write transactions.
- Card rules are entered with an issuer URL/verification date. No real reward rates are silently assumed.
- Webpack build mode is selected to avoid restricted Turbopack worker socket behavior in the authoring environment.

## Verification performed

On November 25, 2026, local verification covered strict frontend types, clean Biome lint, Deno Edge Function types, 31 unit/database/persistence tests, and root/subpath static production builds. Browser coverage includes manual income/expense editing and persistence, calendar amounts, CSV duplicates, PDF extraction, bill-image OCR, and desktop/mobile layouts. Nine browser cases passed under both the root and Pages-style prefix; the duplicate mobile OCR case was intentionally skipped.

Live Supabase deployment, Google OAuth consent, real Gmail messages, and paid Gemini requests were not exercised because no owner service credentials were supplied. No repository was published or production database changed. Complete the real-service matrix before using cloud mode with financial records.

## Known boundaries

These are important when describing or extending the application:

- Bank parsing is generic and review-first. There is no full issuer-template certification or statement balance reconciliation.
- PDFs with difficult multi-column layouts can need manual correction or AI assistance. Image enhancement is rotate/edge-trim, not perspective correction.
- Voice supports browser engines and common phrases; mixed-language recognition quality depends on the browser. It is not guaranteed offline.
- OCR is configured for English text. Malayalam speech support does not imply Malayalam receipt OCR.
- Receipt imports create one expense per bill; item-level categorization is not implemented.
- Similar-transaction detection uses normalized merchant/date/amount. Different bank aliases can evade a match; exact repeated sources are reliably identified.
- Import undo deletes newly created batch entries and refuses broken credit dependencies. It does not revert later edits to pre-existing records.
- Gmail sync is manual and paged. Restarting after reload rechecks messages and skips saved IDs; there is no durable scheduled sync job.
- Google Testing mode can require weekly Gmail reconnection. Publishing/verification requirements depend on Google's current OAuth policies.
- Reward rules support cash-equivalent percentage, monthly cap, minimum purchase, and fee. Complex voucher routes, MCC exclusions, tiered point conversion, and shared reward caps need additional modeling before being presented as exact recommendations.
- Fixed commitments are seeded as planned budgets, not actual expenses. Salary is a plan until entered as actual income.
- SpendPulse has no monthly AI spending cap. Gemini usage and billing are tracked by Google.
- Browser storage is origin-specific and not encrypted by the app. Use device security and export backups; cloud mode provides authenticated access and RLS.
- Account/authentication/provider credentials and live end-to-end checks must be completed by the owner in their accounts.

## Operational playbook

**Missing records:** check mode, month/filter, browser origin, and Supabase pause status before importing duplicates. Local records on a Pages domain do not automatically appear on Vercel.

**Backup:** export JSON from Settings before a deployment/schema change. For cloud use, also use the database backup capability appropriate to your Supabase plan. Keep financial backups outside Git.

**Restore:** choose the destination mode, select a validated backup, confirm the merge. Existing UUIDs/source identities are not duplicated. Preferences are replaced. Recheck totals and category/account references.

**Gmail authorization error:** reconnect in Imports. If the token-encryption key changed, reconnect rather than trying to decrypt with the wrong key. Disconnect revokes the refresh token and removes the stored credential.

**AI unavailable:** open Settings → AI setup and check the backend key. Verify the Gemini model, quota, and billing in Google AI Studio. Manual entry, rules, and local OCR remain available.

**Bad import:** undo the affected batch. If other entries link to it, unlink those credits first. Preserve a private copy of the problematic statement for debugging; commit only an anonymized fixture.

**Dependency update:** resolve current stable versions, run types/lint/tests, rebuild both host variants, verify workers and OAuth paths, review security advisories, and update the lockfile.

## Extension priorities

1. Collect anonymized real issuer fixtures and add dedicated parsers/reconciliation tests.
2. Add durable sync jobs only if manual paging becomes inconvenient.
3. Expand merchant aliases and explicit cross-source linking, retaining conservative duplicate behavior.
4. Add itemized receipt allocation if needed without counting the bill total twice.
5. Model more complex reward rules only with current issuer evidence and cap/fee tests.

Use descriptive branches such as `feat/statement-parsers` or `fix/refund-allocation`; do not use a `codex/` prefix.
