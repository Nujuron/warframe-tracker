# Warframe Tracker

Private mastery tracking with SvelteKit 5, TypeScript, Supabase and an authenticated MCP endpoint. This is an independent application. Our Recipes and the original ChatGPT Site are not dependencies and remain unchanged.

## Run locally

Use Node 24 and pnpm 11.6.0.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Without Supabase configuration, the catalogue is available as a read-only local preview. Account data is never simulated. The committed snapshot contains 817 masterable equipment records and 173 Prime recipes. Users start with an empty tracker.

See [deployment instructions](docs/DEPLOYMENT.md) to connect the separate tracker project, apply its migration and publish catalogue data.

## Application

- `/tracker`: your list, search/category/status/priority filters, notes, manual equipment, imports, export and confirmed reset.
- `/tracker?view=farm`: Farm focus uses the same saved priority stars. It separates farming, collected Prime components, building and levelling; lists missing component copies; and groups relics by target coverage. Completed components and mastered targets leave the active plan automatically. Non-Prime/custom entries keep notes and acquisition wiki links without assumed recipes.
- `/catalogue`: searchable masterable equipment. Browsing never adds entries.
- `/account`: display name and password settings.
- `/connections`: MCP instructions and revocation.
- `/oauth/consent`: explicit approval or denial of connected-app access.
- `/mcp`: authenticated streamable HTTP MCP transport.

Progress is private to the authenticated account and saved in Supabase. Saves require connectivity. Failed saves remain visible. Item updates require their last read revision; imports and resets use a tracker revision. A conflicting edit is rejected and must be reviewed after refreshing. There is no offline write queue.

## Import and migration

Export a JSON backup from the existing website, sign in here, select **Load equipment**, preview the result, then apply it. Browser storage on the old domain cannot be read from this application. No automatic migration or shared initial list is shipped.

Supported formats:

- Original `warframe-mastery-v2` JSON (`items` and `progress`), including component quantities.
- Legacy `warframe-mastery-v1` progress: only the entries actually in that file are retained.
- Arrays of `{name, category, status?, priority?, notes?, parts?, rank?}`.
- Markdown with `## Category` headings and `- [ ] Name` / `- [x] Name` checkboxes.
- One name per line with a selected default category.

Names match within their category. Duplicate rows are removed; ambiguous and unknown items become custom entries with no guessed Prime mapping. New exports retain stable catalogue identifiers. Explicit custom entries remain custom when reimported. Merge preserves existing progress by default; replacement uses only the supplied values. Previews expire after 15 minutes and cannot apply after another tracker change. Repeating the same applied preview is idempotent.

Exports include equipment, statuses, notes, priorities, rank annotations and owned component quantities. Export before **Start empty**, which requires confirmation and is available only on the website.

## Data maintenance

```sh
pnpm data:refresh
pnpm test
pnpm data:publish
```

Refresh downloads WFCD item data and drop tables, validates catalogue completeness, stable IDs, recipes and probabilities, backs up the previous snapshot under `.data-cache`, and atomically replaces the local snapshot only after validation succeeds. Download or validation failures keep the previous file. Publish revalidates and replaces shared database data in one transaction. Existing personal entries are retained, including catalogue entries retired by later snapshots.

`pnpm data:refresh --from-cache` is an explicit development option for local public-source fixtures. It preserves the original drop-source modification timestamp; it does not establish current availability. The initial relic snapshot is the dated snapshot from the earlier tracker. The interface displays its date and source attribution. Intact/Radiant reward odds and mission drop chances are separate. Missing mission sources do not prove a relic is vaulted or unobtainable. Resurgence/vendors may differ from regular mission tables.

`SUPABASE_SECRET_KEY` is needed only for manual publication. It must remain server-side and must never use a `PUBLIC_` prefix. The website and MCP use the publishable key with the acting user's token and RLS, not the secret key.

## Architecture

- `src/lib/server/equipment.ts`: shared personal-progress and import application services.
- `src/lib/imports.ts`, `validation.ts`: transport-independent parsing and validation.
- `src/lib/server/catalogue.ts`: shared read-only catalogue and relic snapshots.
- `src/lib/server/mcpAuth.ts`, `mcp.ts`: token verification and MCP transport.
- `src/routes`: account flow, web pages and JSON APIs.
- `supabase/migrations`: ownership policies, revision checks and transactional imports/publication.
- `scripts`: repeatable manual ingestion and publication.

No MCP tool accepts an account ID. The authenticated token determines the actor. The database also enforces ownership and active OAuth approval, so connection revocation blocks existing access tokens immediately. There is no full-list reset tool.

For farming automation, `list_tracked_equipment` accepts `focus: true`; set an item's `priority` to add/remove it from Farm focus using `update_equipment`. Existing exports/imports preserve these stars and owned component quantities. No additional database migration or account permissions are needed for the farming view.

## Verification

```sh
pnpm check
pnpm test
pnpm test:browser
pnpm build
# Requires the ignored .env file with the tracker project secret; creates/deletes only disposable accounts.
pnpm test:live
# PowerShell: run the same acceptance suite against production.
$env:TRACKER_LIVE_BASE_URL='https://warframe-tracker-sepia.vercel.app'; pnpm test:live
```

Unit/integration tests cover imports, the original 289-entry migration, Prime quantities/probabilities, OAuth action contracts, MCP HTTP tools and token checks. The database suite executes the actual migration in embedded PostgreSQL (PGlite), with two authenticated roles, RLS, conflicts, import rollback, expiry, revocation and anonymous requests. No Docker is needed for these tests. `pnpm db:test` runs additional pgTAP policies against a local Supabase stack if Docker is available.

Browser checks use installed Microsoft Edge for desktop and Chromium mobile emulation; set `PLAYWRIGHT_CHANNEL=chrome` to use installed Chrome, or install Playwright Chromium and set the channel to `chromium`. They validate the unconfigured onboarding/catalogue and unauthenticated endpoints. The separate live suite exercises real cloud persistence, isolated accounts, OAuth/MCP, confirmation/recovery tokens and failed saves against the tracker project. Actual email delivery and Google sign-in still require provider configuration; see [deployment instructions](docs/DEPLOYMENT.md).

The pinned Vercel adapter includes a small pnpm patch to use Windows directory junctions for build output. Linux/Vercel builds retain normal directory symlinks. Dependencies use a hoisted layout to avoid Windows package symlinks. No administrator privileges are required by the patch.

## Scope

One private tracker per account; English only. Scheduled refreshes, screenshot extraction, public profiles and game-inventory synchronization are deferred. No paid Supabase or Vercel upgrade is required by this configuration; provider limits still apply.

Game data attribution: Digital Extremes drop tables via [WFCD drop data](https://github.com/WFCD/warframe-drop-data), recipes/item metadata from [WFCD items](https://github.com/WFCD/warframe-items). The bundled WFCD license is in `static/WFCD-LICENSE.txt`. Independent fan project, not affiliated with Digital Extremes.
