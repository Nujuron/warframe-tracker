# Separate tracker deployment

Target Supabase project: `ipncpeqkycjoxlthkdmv` ([dashboard](https://supabase.com/dashboard/project/ipncpeqkycjoxlthkdmv)).

Production website: [warframe-tracker-sepia.vercel.app](https://warframe-tracker-sepia.vercel.app). The separate Vercel project is `nuju-s/warframe-tracker`. The three migrations and the 817-item / 173-Prime snapshot are applied to the tracker database.

Do not use the existing Our Recipes project, its environment files, database credentials or Vercel identifiers. When both Supabase connectors are present, use the plugin that accepts an explicit `project_id`; the older fixed-project connection points to Our Recipes. No schema or data was sent to Our Recipes.

## 1. Authenticate and link

Run these from this tracker directory:

```sh
pnpm exec supabase login
pnpm exec supabase projects list
pnpm exec supabase link --project-ref ipncpeqkycjoxlthkdmv
pnpm exec supabase migration list
pnpm exec supabase db push --dry-run
pnpm db:push
```

The login opens a browser. Complete authentication directly; do not paste access tokens into chat. Confirm the project reference before applying anything. The migration is in `supabase/migrations/20261025141724_tracker_foundation.sql`.

Alternatively, reconnect the Supabase plugin specifically to the tracker project, verify its project URL, then apply the migration through that connection. Reinstalling the plugin alone may preserve its old project binding.

Official reference: [Supabase local workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

## 2. Environment and initial data

Copy `.env.example` to `.env`. From the tracker project's API settings fill:

```dotenv
PUBLIC_SUPABASE_URL=https://ipncpeqkycjoxlthkdmv.supabase.co
PUBLIC_SUPABASE_PUBLISHABLE_KEY=<tracker publishable key>
PUBLIC_SITE_URL=http://localhost:5173
PUBLIC_GOOGLE_AUTH_ENABLED=false
SUPABASE_SECRET_KEY=<tracker server-only secret, for publication only>
```

Never commit `.env`. Keep private keys out of chat. Publish the validated bundled data:

```sh
pnpm data:publish
```

The `publish_catalogue` function is executable only by the service role. Its entire change is transactional; failed input leaves the prior database snapshot intact. The website can operate without `SUPABASE_SECRET_KEY` once data is published.

## 3. Authentication settings

In the tracker project, enable email/password sign-in and email confirmation. Set the production Site URL once a domain exists. Allow these exact redirect URLs for local development and the production domain:

- `http://localhost:5173/auth/callback`
- `http://127.0.0.1:5173/auth/callback`
- `https://<tracker-domain>/auth/callback`

Recovery callbacks include `?next=/account/recover`; allow this callback path with its query form if your dashboard's exact-match rules require it. The application also supports token-hash confirmation URLs `/auth/confirm?token_hash={{ .TokenHash }}&type=email` and recovery URLs with `type=recovery`, if email templates are customized. Do not use fragment-only implicit sign-in templates for this server-rendered PKCE application.

Email signup instructs the user to confirm. Configure SMTP if required for external users; default provider email restrictions/rate limits can prevent real-world delivery.

For Google (optional), create credentials in your own Google Cloud project and configure the Supabase Google provider. Google's authorized redirect URI is:

`https://ipncpeqkycjoxlthkdmv.supabase.co/auth/v1/callback`

Keep the Google secret in Supabase provider settings. Set `PUBLIC_GOOGLE_AUTH_ENABLED=true` only after configuration. The app callback remains your tracker domain's `/auth/callback`.

Official references: [SvelteKit SSR authentication](https://supabase.com/docs/guides/auth/server-side/sveltekit), [Google authentication](https://supabase.com/docs/guides/auth/social-login/auth-google).

## 4. OAuth / MCP

The Supabase OAuth 2.1 server uses `/oauth/consent`, with **Allow dynamic client registration** enabled in Authentication → OAuth Server. This publishes a `registration_endpoint` in discovery, allowing compatible MCP assistants to register themselves without an owner-issued client ID. The local `config.toml` mirrors this setting; it does not change the hosted project. Verify the hosted discovery document and unauthenticated registration after changing the dashboard switch. Do not push the entire generated auth configuration to change this one setting.

For ChatGPT, use the production MCP URL and OAuth, then choose dynamic client registration in Advanced OAuth settings if prompted. Leave predefined credentials empty. Close and reopen an older setup dialog to refresh cached discovery. Each user signs in to their tracker and approves the requested access; registering a client does not itself authorize access to any account. Google OAuth credentials and Supabase API keys are unrelated to MCP client credentials.

The authentication challenge must point to the metadata URL below. With `mcp-handler` 2.1.1, the `withMcpAuth` option `resourceUrl` is used as a base and concatenated with `resourceMetadataPath`; pass the canonical site origin there. Including `/mcp` in that base creates an invalid `/mcp/.well-known/...` address. The metadata document itself still identifies the protected resource as the full `/mcp` endpoint. Unit and live acceptance tests follow the challenge URL to guard this discovery path.

For clients that only support pre-registration, manually register a separate OAuth App with that client's exact displayed callback URI. A public PKCE client uses `token_endpoint_auth_method: none` and needs no secret. Confidential clients also need their secret stored in the assistant, never in public application configuration. Do not assume a shared callback URI: ChatGPT connections can use `https://chatgpt.com/connector/oauth/{callback_id}`.

The live OAuth acceptance test discovers `registration_endpoint` and registers a public client with an unauthenticated request, then checks denial, consent, token exchange, account isolation and revocation. Only test-account creation and cleanup use the server-only admin key; no privileged credential participates in the client registration or MCP requests. The disposable client is deleted afterward.

- MCP endpoint: `https://<tracker-domain>/mcp`
- Protected-resource metadata: `https://<tracker-domain>/.well-known/oauth-protected-resource/mcp`
- Authorization issuer: `https://ipncpeqkycjoxlthkdmv.supabase.co/auth/v1`
- Authorization-server discovery: `https://ipncpeqkycjoxlthkdmv.supabase.co/.well-known/oauth-authorization-server/auth/v1`

Do not proxy token exchanges through a privileged key. Tokens are verified with Supabase, checked for issuer/subject/audience/expiry/client identity, and used as the acting user's bearer credential. OAuth approval is also recorded in an ownership-protected table. Revoking it blocks RLS access immediately, then revokes the Supabase grant/refresh sessions.

Tools: `search_catalogue`, `list_tracked_equipment`, `get_equipment`, `add_equipment`, `update_equipment`, `set_component_quantity`, `preview_equipment_import`, `apply_equipment_import`. Read/list tools paginate. Updates require item revisions; import apply requires an unexpired preview. Reset remains website-only.

Official references: [Supabase MCP authentication](https://supabase.com/docs/guides/auth/oauth-server/mcp-authentication), [token security and RLS](https://supabase.com/docs/guides/auth/oauth-server/token-security).

## 5. Vercel

Create a separate Vercel project with this folder/repository as its root and SvelteKit as the framework. Use Node 24, `pnpm install --frozen-lockfile`, and `pnpm build`. The Vercel adapter is already configured. No custom server, cron, analytics or paid setting is added.

Set the four `PUBLIC_` environment variables in Vercel. `PUBLIC_SITE_URL` must be the exact canonical production origin. Do not add `SUPABASE_SECRET_KEY` to Vercel unless implementing an expressly authorized server-only ingestion job later; the current running application never needs it.

Deploy a preview first. Once the production domain is selected, update the Supabase Site URL, redirect allowlist and `PUBLIC_SITE_URL` together, then redeploy. Stable OAuth testing needs a stable domain. Do not reuse the ChatGPT Site's hosting settings.

Official reference: [SvelteKit on Vercel](https://vercel.com/docs/frameworks/full-stack/sveltekit).

## 6. Required live acceptance checks

Local automated tests are not a substitute for these deployment checks:

- Create two email accounts, verify emails, recover a password and sign out/in. Check Google when enabled.
- Account A starts empty; add catalogue/custom/companion equipment. Account B remains empty.
- Import the original 289-entry backup through preview; inspect unknown/ambiguous custom items. Add notes, priorities and two-copy parts; export/reimport and compare.
- Open A in two separate browsers/devices. Save different updates; ensure persistence and conflict rejection. Disconnect networking during a save and check its visible failure.
- Approve an MCP client as A; list/search/read/update/import/parts work. Denial, missing/invalid/expired tokens and B's item IDs must not reveal A's data.
- Revoke the connection from the website; retry with its existing token and confirm immediate denial. Reconnect through a new approval.
- Check desktop/mobile layout, Prime fallbacks, source timestamps and mission versus opening percentages.
- Publish deliberately invalid test data only against a disposable test/local database; verify transaction rollback and retention of the last good snapshot. Do not corrupt the production snapshot to test this.
- Run the Supabase security advisories and address findings before public rollout.

Keep the existing ChatGPT Site available during export/import migration. Do not retire it or change its sharing settings as part of this release.

## Current validation and remaining provider setup

The deployment has been exercised with disposable Supabase accounts. The live suite checks isolated lists, original-list migration, component quantities, repeated browser sessions, stale updates, visible failed saves, exports, OAuth approval/denial, authenticated MCP access and immediate revocation. Confirmation/recovery token flows use real generated tokens without sending email. Test users and the temporary OAuth client are removed afterward.

Google sign-in is enabled with a separate Google Cloud project, `warframe-tracker-512714`, and its own web OAuth client. The authorized origin is the production tracker domain and the provider callback is `https://ipncpeqkycjoxlthkdmv.supabase.co/auth/v1/callback`. The Google secret belongs only in the Supabase provider settings. Privacy and terms pages are published at `/privacy` and `/terms` and linked from the footer.

The Google audience is External and In production, with only OpenID, email and basic profile scopes configured. Google branding points to the public catalogue, privacy and terms pages. The production button and redirect chain were checked, and the owner completed Google's consent flow and reached My tracker on 25 October 2026.

Brand verification was attempted on 25 October 2026. Google reported that the homepage was not yet registered to its owner and instructed waiting 24 hours after ownership verification before retrying. Search Console ownership of `https://warframe-tracker-sepia.vercel.app/` was successfully verified at approximately 18:57 UTC on 25 October using `static/google30494b32261b7c6e.html`. Keep that file deployed to retain verification. Retry brand verification after 19:00 Atlantic/Canary time on 26 October 2026; the display-name change is not yet approved. Existing Google sign-in remains active.

SMTP has not been configured: default Supabase email delivery is restricted and must be tested/configured before inviting outside users who use email/password registration. Google sign-in is a separate authentication path. Actual email delivery still requires SMTP provider setup.

Auth URL settings were saved through the dashboard. Avoid pushing the entire generated Supabase config to change one setting: it can contain unrelated MFA, OTP and SMS settings. Preserve the project's existing security settings. Local `config.toml` is for the development stack.

The final advisor pass has no application RLS/function warnings. Supabase flags disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); this feature requires Pro, so it remains disabled under the no-paid-upgrades requirement. The unused catalogue foreign-key index is retained for relationship checks and later catalogue maintenance.
