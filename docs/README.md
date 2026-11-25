# SpendPulse documentation

Start with [installation](installation.md) to run the app. Read [architecture](architecture.md) before changing accounting, persistence, or authorization. Use [deployment](deployment.md) to publish the frontend and [integrations](integrations.md) to connect private services. The [testing guide](testing.md) defines acceptance checks; [handover](handover.md) is the maintainer checklist.

## Modes

| Mode | Records | Login | AI/Gmail |
| --- | --- | --- | --- |
| Demo | Synthetic data in this browser | None | Disabled |
| Local | Your ledger in this browser | None | Disabled |
| Cloud | Owner-only Supabase records | Google | Optional after configuration |

Switching modes never automatically uploads local records. To move records, export a JSON backup and explicitly restore it in the destination mode.

## Supported inputs

| Input | Default behavior | Review |
| --- | --- | --- |
| Manual | Income/expense form with category/account/date | Save explicitly |
| Voice | Browser transcript, then deterministic rules | Editable form |
| CSV/XLSX/XLS | Worker-based parsing and column mapping | Select rows before importing |
| Text PDF | PDF.js text extraction and conservative row parsing | Check dates, amounts, and debit/credit types |
| Scanned PDF/image | Local Tesseract OCR | Missing or conflicting fields need correction |
| Gmail | Read-only, paged bank/merchant alert extraction | Review batch before saving |
| Optional AI | Backend structured extraction or explanations | Never silently writes ledger entries |

## Product defaults

- India, INR, Asia/Kolkata; all stored monetary values are integer paise.
- Monthly planned income ₹2,50,000; editable commitments total ₹83,465.
- AI enabled for new cloud ledgers once Gemini is configured. AI actions are explicit and SpendPulse has no monthly AI spending cap.
- One owner and one Gmail connection. No bank payment execution.
- Bill totals create one expense, not individual item transactions.
- No original document/audio retention by default.
- Manual sync and import only; no scheduled background tasks.
