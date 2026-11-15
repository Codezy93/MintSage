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
docs/                        Implementation roadmap and project documentation
experiments/forecasting/      Offline Python experiments, models, and sample data
```

The web app is independent of the Python experiments. See the
[experiment notes](experiments/forecasting/README.md) for their entry points
and limitations. The SQL files are existing schema definitions, not an ordered
migration system; they define policies but do not explicitly enable RLS.

## Web development

```sh
cd app
npm ci
npm run dev
```

Live functionality requires external service configuration. This structural
cleanup does not resolve the authentication, secret handling, dependency,
or forecasting issues identified in the audit. In particular, `app/proxy.ts`
is retained in its existing location pending the session-handling repair;
it should not be relied on for route protection.

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
