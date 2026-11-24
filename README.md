# MintSage

Personal-finance prototype built with Next.js, Supabase, Plaid, and Gemini.
The web app includes authentication, bank linking, a transaction dashboard,
and spending analysis. Forecast requests currently depend on an external
service whose implementation is not in this repository.

See the [implementation roadmap](docs/roadmap.md) for the original engineering
upgrade plan, completed cleanup, and planned personal-finance features.

## Repository layout

```text
app/                         Next.js web app and API routes
  src/app/                   Pages, layouts, and API handlers
  src/components/dashboard/  Active dashboard components
  src/components/ui/         Shared shadcn/ui components
  src/lib/                   Supabase, Plaid, and transaction helpers
  src/types/                 Shared transaction type
database/schema/             Original Supabase table and policy definitions
database/migrations/         SQL changes applied after the existing schema
docs/                        Implementation roadmap and project documentation
experiments/forecasting/      Offline Python experiments, models, and sample data
```

The web app is independent of the Python experiments. See the
[experiment notes](experiments/forecasting/README.md) for their entry points
and limitations.

## Web development

```sh
cd app
npm ci
npm run dev
```

Live functionality requires external service configuration. Broader API
authorization, secret handling, dependency, and forecasting work remain
pending. In particular, `app/proxy.ts`
is retained in its existing location pending the session-handling repair;
it should not be relied on for route protection.

### Plaid token storage

Set `SUPABASE_SECRET_KEY` in the Next.js server environment to a Supabase secret
key for the project identified by `NEXT_PUBLIC_SUPABASE_URI`. Keep this key out
of browser configuration and source control.

Apply the [token storage migration](database/migrations/202611220001_secure_plaid_tokens.sql)
to the database that already contains `public.plaid_tokens`. For a fresh
database, load the definitions in `database/schema/` first. Roll out the app
and migration together because the migration revokes the old app's access.
Existing token rows are retained.

In staging, link a Plaid Sandbox account and open the dashboard. Confirm
that the exchange returns only `{ "connected": true }` and that both Plaid
routes return 401 without a session. Confirm that anonymous and signed-in
browser clients cannot read or write token rows, including their own.

Local checks, from `app/`:

```sh
npx tsc --noEmit
npm run lint
npm run build
```

The unused standalone `/chat` route was removed; dashboard chat remains.
Unused deployment ZIPs were removed from the working tree. Previous versions
remain in Git history, which has not been rewritten. Next.js scaffolding and
the components in `app/src/components/ui/` include generated code.
