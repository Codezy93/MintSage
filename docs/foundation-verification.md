# Engineering foundation verification

## Local evidence

The verification used a clean Git checkout with the candidate changes, a clean
npm install, a separate Python 3.14 CPU environment and placeholder Next.js
build settings. On November 26, 2026 the clean checkout passed 14 pytest cases,
10 Vitest cases, three Node tests, Ruff, mypy, ESLint, TypeScript, the production
build, and both pre-commit hooks. Re-running training and evaluation produced
the same results JSON, including the paired comparisons. Ordinary checks
require no provider credentials.

| Boundary | Local evidence |
| --- | --- |
| Signup | Embedded PostgreSQL applied all migrations against existing fixture data. A new Auth user created its profile immediately. Existing profile data survived. Callback tests exchanged a confirmation code before redirecting. |
| Bank connection | The real exchange handler with fixture providers stored the private token for the verified user and returned only connection status. Anonymous and authenticated SQL roles could neither read nor update tokens for either fixture user. |
| Dashboard | The server loader queried the verified user's connection. Its return value omitted the secret used for Plaid. |
| Forecast and analysis | HTTP service contract tests checked authentication, dates, shapes, and currency. The Next.js tests checked service failures. The analysis handler received a mocked Gemini reply and sent summaries without fixture merchant, account or transaction identifiers. |
| Agent tool | Mocked model calls for two identities returned the correct 30 values and evidence. An extra user ID in tool arguments could not redirect the history lookup. |
| Release checks | Ruff, mypy, pytest, ESLint, TypeScript, Vitest, Node tests and a production build were exercised locally. The workflow files still need a hosted Actions run after push. |

## Hosted acceptance still open

Use two disposable users in a staging Supabase project, Plaid Sandbox,
the deployed forecast service and a configured Gemini credential. Record
the deployment revision, date, expected result and observed result for each
check. Keep credentials and bank details out of the record.

1. Sign up, open the delivered email link in the same browser, and confirm
   arrival at bank linking. Link a Sandbox account and follow the redirect.
2. Inspect the exchange response and dashboard network payloads. Confirm that
   the access token and service secret stay server-side. Verify that anonymous
   and signed-in browser roles cannot read or write either user's token rows.
3. Sync the account, verify the institution timestamp and history coverage, and
   exercise both the dashboard forecast and Gemini analysis. Short or stale
   history should surface its availability state.
4. Log out and verify protected pages redirect and API calls return 401.
5. Run the manual Gemini tool evaluation with synthetic data. Full supervisor
   runs, resume behavior and verifier checks depend on steps 25–27.

No hosted signup email, hosted RLS configuration, live Plaid link, paid Gemini
call or full specialist-agent run was verified in this checkout.
