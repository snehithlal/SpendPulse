# Integrations and configuration

## Gemini setup

1. Set up your [Supabase cloud ledger](deployment.md#supabase-database-and-authentication).
2. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
3. In the Supabase project’s [Edge Function Secrets](https://supabase.com/docs/guides/functions/secrets), set `GEMINI_API_KEY` and `ALLOWED_ORIGINS`. Use `http://localhost:3000` for the local preview or the exact deployed origin, for example `https://your-name.github.io`. Origins omit paths and trailing slashes.
4. [Deploy the integrations function](deployment.md#edge-function-deployment). Gmail setup is optional and uses its own credentials.
5. Open the cloud ledger and go to **Settings → AI setup → Check AI setup**. This checks whether the function can see the key. Use an AI action to verify the key and model with Google. If you previously switched AI off, turn on **Enable AI assistance**.

## Google sign-in versus Gmail

These are separate flows. Supabase Google login establishes the app identity. **Connect Gmail** authorizes read-only mailbox access using another OAuth callback served by the Edge Function. Revoking Gmail should not sign the owner out of the finance app.

In Google Cloud, create a project, enable the Gmail API, and configure an OAuth consent screen for personal use. Add the owner as a test user when using Testing mode. Create web OAuth client credentials. Authorized redirects must include:

- The Google callback URL shown by Supabase Auth for app login.
- `https://YOUR-PROJECT.supabase.co/functions/v1/integrations` for Gmail access.

Configure the matching public frontend URLs in Supabase Auth, including the Pages repository path. Google Testing mode normally expires Gmail refresh tokens after seven days; the UI will ask to reconnect when refresh fails.

## Edge Function secrets

| Name | Required for | Notes |
| --- | --- | --- |
| `APP_URL` | Gmail | Canonical frontend URL, including trailing slash and Pages subpath |
| `ALLOWED_ORIGINS` | All integration POSTs | Comma-separated exact origins; no paths |
| `GOOGLE_CLIENT_ID` | Gmail | Web OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Gmail | Never exposed to the frontend |
| `GOOGLE_REDIRECT_URI` | Gmail | Exact Edge Function URL registered with Google |
| `TOKEN_ENCRYPTION_KEY` | Gmail | Base64 of 32 random bytes; AES-GCM key |
| `GEMINI_API_KEY` | Optional AI | Prefer paid access appropriate for private financial content |
| `GEMINI_MODEL` | Optional AI | Defaults to `gemini-3.5-flash-lite`; configurable |

Supabase supplies its URL, publishable keys, and secret keys to the function environment. Local setups using legacy anon and service-role keys also work. Only the public project URL and publishable key belong in frontend configuration.

Generate an encryption key privately using a cryptographic tool, for example `openssl rand -base64 32`. Save it directly in your secret manager/Supabase configuration; do not paste it into issues or commit it.

## Gmail behavior

The function requests only `gmail.readonly`. Sync queries use India-local date boundaries and an allowlist of bank/merchant domains. An optional Gmail filter lets the owner target another sender. Gmail does not execute payments, modify mail, or delete messages.

Each batch checks at most ten messages. Message IDs are the source identities. Existing imported messages are skipped. Text/plain bodies are preferred; HTML is stripped to inert text. Attachments are not downloaded. No raw message body is saved to the database.

Rules extract common currency, date, merchant, debit/credit, refund, and repayment patterns. Ambiguous/unrecognized messages are returned for manual review. When optional AI assistance is available, extracted records still require preview and confirmation. Do not assume every issuer email format is recognized correctly: validate with real anonymized fixtures before trusting a new sender layout.

When the owner selects **Send alerts that rules could not parse to Gemini**, the function sends one bounded request per page with the unresolved messages. Source IDs must match an unresolved message before an AI draft replaces it. If AI fails, the rules/manual-review drafts are retained with a warning.

The page token is a short-lived UI continuation, not a background job. Reloading restarts the date range; message-ID deduplication prevents reimporting saved messages. Deselect unresolved rows to continue, or finish them before saving.

## Optional AI behavior

New cloud ledgers enable AI by default. The backend rechecks the stored owner preference before calling Gemini. Manual entry, OCR, budgeting, and rules work with AI turned off in Settings.

Extraction accepts text and optionally a resized JPEG. Structured responses contain transaction drafts, not executable instructions or database mutations. All fields are validated. Insights use computed summary facts rather than a raw mailbox dump.

SpendPulse has no monthly AI cap. Gemini requests are subject to your Google project's quotas and billing.

## Documents

- SheetJS parses CSV/XLSX/XLS in a Web Worker. Formulas/macros are not executed; cached displayed values may be read.
- PDF.js extracts text and supports password-protected PDFs. Passwords live only in browser component memory and are cleared after success.
- Tesseract runs OCR locally using downloaded English language assets. This supports English-text Indian receipts; Malayalam-script receipt OCR is not configured by default.
- Scanned PDF pages are processed sequentially to limit memory consumption.
- Photos can be rotated or have their outer 10% trimmed. This is a simple crop helper, not automatic perspective correction.
- Maximums: 20 MB file, 50 PDF pages, 10,000 spreadsheet rows per sheet. Split larger documents.
- No originals are uploaded or retained during rules/OCR extraction. Explicit AI image extraction does send the selected image content to Gemini.

The generic PDF parser is deliberately conservative. Multi-column statement layouts may need manual corrections or AI. It does not prove a statement reconciles to opening/closing balances. Preview every row and exclude summary rows.

## Voice

The frontend uses feature-detected `SpeechRecognition` / `webkitSpeechRecognition`. Settings select `en-IN` or `ml-IN`. Rules support common English/Manglish phrases with numeric rupee amounts, yesterday/innale, known merchants, and account aliases.

Not every browser supports voice recognition. Browser vendors may process audio remotely; “AI off” means no generative provider calls by SpendPulse, not a promise of offline speech recognition. Dictated Malayalam number words and complex multi-expense utterances may need editing or optional AI. The transcript always opens an editable transaction; nothing is silently saved.

## Reference documentation

- [Google OAuth](https://developers.google.com/identity/protocols/oauth2)
- [Gmail message API](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages)
- [Supabase Google login](https://supabase.com/docs/guides/auth/social-sign-in/auth-google)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Gemini models](https://aistudio.google.com/docs/models) and [pricing/data policy](https://aistudio.google.com/docs/pricing)
- [PDF.js](https://mozilla.github.io/pdf.js/), [SheetJS](https://docs.sheetjs.com/docs/), [Tesseract.js](https://tesseract.projectnaptha.com/)
- [Browser speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition)
