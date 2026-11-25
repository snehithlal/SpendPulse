# Deployment

The frontend is a static export on both GitHub Pages and Vercel. Supabase is the optional private backend. Deploying the frontend alone gives working demo/local modes; Google login, Gmail, and AI require the additional backend setup below.

## GitHub Pages

1. Create a public repository and push this source to `main`. Do not add `node_modules`, `.env` files, real financial documents, or `out`.
2. In repository **Settings → Pages**, choose **GitHub Actions** as the publishing source.
3. For cloud mode, add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` under **Settings → Secrets and variables → Actions → Variables**. Leave them unset for local mode only.
4. Run the included **Deploy SpendPulse** workflow or push to `main`.
5. The workflow installs locked dependencies, runs checks, computes the Pages base path, builds, uploads `out/`, and deploys it.
6. Open `https://YOUR-NAME.github.io/YOUR-REPOSITORY/`. Check the initial page, imports, charts, and a browser refresh.

`actions/configure-pages` supplies the path automatically; do not hardcode `/spendpulse` if your repository has another name. `.nojekyll` prevents Pages from dropping `_next` assets. Navigation stays on the exported root with URL fragments, so no catch-all rewrite is needed.

For a custom domain, configure it in GitHub Pages and use the resulting root base path. Rebuild. Update Supabase allowed redirects and backend CORS to the new domain. Camera/microphone features require HTTPS or localhost.

### Local subpath verification

```bash
NEXT_PUBLIC_BASE_PATH=/spendpulse npm run build
PREVIEW_BASE_PATH=/spendpulse PORT=3001 npm run start
```

Serve the exported output mounted at `/spendpulse/`, not at `/`. Verify the PDF worker, spreadsheet worker, CSS, and JavaScript return 200 beneath that prefix. Rebuild with an empty base path afterward for normal root previews.

In another terminal, run `TEST_BASE_URL=http://127.0.0.1:3001/spendpulse/ npm run test:e2e` against that preview.

## Vercel

1. Import the same Git repository into Vercel.
2. Use the Next.js preset and Node.js 26 LTS. The committed `vercel.json` selects `npm run build` and output directory `out`.
3. Set `NEXT_PUBLIC_BASE_PATH` to empty. Add the two public Supabase variables if cloud mode is required.
4. Deploy. The application stays static; it does not migrate private functions into Vercel.
5. Add the production Vercel/custom-domain URL to Supabase Auth redirects and backend `ALLOWED_ORIGINS`. Set `APP_URL` to the canonical production frontend URL for Gmail callbacks.

Do not use a Pages-built artifact on Vercel: base paths are embedded at build time. For previews, authorize explicit preview URLs only when needed; avoid permissive wildcard OAuth origins.

## Supabase database and authentication

1. Create a Supabase project. Copy the Project URL and publishable key from its [Connect dialog or API Keys settings](https://supabase.com/docs/guides/getting-started/api-keys). For a local frontend connected to this project, copy `.env.example` to `.env.local`, fill in `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, then restart the dev server or rebuild the preview.
2. Apply the SQL files in `supabase/migrations/` in filename order using the SQL editor or the Supabase CLI migration workflow.
3. In the SQL editor, add your actual lower-case email privately:

```sql
insert into private.allowed_owners(email) values ('you@example.com');
```

4. Under Auth Hooks, enable **Before User Created** and select `public.before_user_created`. The migration grants the required hook permissions.
5. Configure the Google provider. Use the callback URL shown by Supabase as an authorized redirect URI in your Google OAuth client.
6. Configure the Supabase Site URL and additional redirect URLs with the full frontend path, including the repository path and trailing slash for Pages. Add localhost only for development.
7. Build and serve the frontend with its public variables. In **Settings → Backend connection**, sign in with the owner account. Attempt another account and verify rejection.
8. Verify RLS denies anonymous reads and that the authenticated owner can create/read/update/delete a test record.

The migration's private allowlist and RLS protect cloud data even if someone bypasses the frontend. The service-role key must never appear in frontend variables or source.

## Edge Function deployment

With a current Supabase CLI authenticated to your project:

```bash
supabase link --project-ref YOUR_PROJECT_REF
supabase db push
supabase secrets set --env-file supabase/functions/.env.local
supabase functions deploy integrations
```

Create `.env.local` from the backend template and fill it privately. Do not use `db push` on an unrelated database. If the migration was already applied manually, reconcile migration history before using the CLI.

The function's platform JWT switch is disabled in `config.toml` because the Google OAuth redirect is unauthenticated. This is intentional: all POST operations explicitly verify JWTs and owner status; only the single-use OAuth callback uses state/PKCE authentication instead.

Supabase supplies its project URL and API keys to the runtime. You supply the allowed frontend origins and the secrets for the integrations you use. For AI without Gmail, see [Gemini setup](integrations.md#gemini-setup).

For an existing deployment with the AI budget feature, deploy the updated function before retiring the old reservation RPC. Apply `202611250002_remove_ai_budget.sql` and rebuild the frontend. The old `AI_REQUEST_RESERVE_PAISE` secret can be removed.

## Updates and rollback

- Frontend: deploy a checked commit. Roll back to an earlier deployment/commit without changing the database.
- Schema: append a new migration; never rewrite a migration already deployed. Back up before changes that alter existing records.
- Secrets: rotate Gemini keys independently. Rotating the token encryption key requires reconnecting Gmail or migrating encrypted tokens before deleting the old key.
- Domain change: update redirects/CORS, rebuild the frontend, test sign-in and Gmail reconnection.
- Free Supabase projects may pause. Restore the project before troubleshooting app credentials.

## Release acceptance

Run both root and subpath builds. Verify owner login, unauthorized denial, manual income/expense persistence, receipt/CSV import, duplicate detection, microphone permission handling, and AI-off behavior. Test live Gmail and paid AI only after configuring the owner's services. Check provider dashboards for quota/billing behavior.
