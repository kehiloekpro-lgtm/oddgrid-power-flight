# Execution evidence — 24 October 2026 (SAST)

Engineering base: `d953a212f020830fce03a163898db54bb330a736`.
Isolated implementation branch: `implementation/development-purchasing`.
No hosted writes, deployment, payment requests or original Phase 5 reruns.
No private backup, key, schema export or original receipts were modified or committed.
The original Codespace browser tab was not present in this current browser session;
its private catalogue/receipts were not re-materialized for history-plan preparation.

| Component | Status | Executed evidence / limitation |
| --- | --- | --- |
| Selected variant → cart | IMPLEMENTED / TESTED LOCALLY | Public catalogue UUID, eligibility, exact variant_id request, no submitted price; invalid selection fails closed |
| Cart API staging | IMPLEMENTED / TESTED LOCALLY | Actual handler plus isolated SQL; cross-guest read/add/update/remove rejection; JSON/CORS/quantity/eligibility checks |
| Checkout form → adapter → SQL | IMPLEMENTED / TESTED LOCALLY | Real reviewed SQL under PGlite; variant unit price 325.50, quantity 2, total 651.00 ZAR; parent price 100 not substituted |
| SQL integration suite | TESTED LOCALLY | 14 families pass: guest isolation, configuration/quantity bounds, invalid/inactive variants, currency/availability, quantity/readback, price injection, snapshots/SKU, repeat, cross-cart key, changed cart, frozen-vs-new price, expiry, removal/empty, no payment/order |
| Desktop browser | TESTED LOCALLY | Chromium 143, 1280×900; actual React routes + staged handlers + isolated SQL |
| Mobile browser | TESTED LOCALLY | Chromium 143, 390×844; same complete journey; session reload, quantity, no overflow, keyboard focus, disabled-checkout error/retry |
| Frontend/adapter unit regressions | TESTED LOCALLY | 68 Node tests pass, including mock Sandbox verification and Development-origin/config guards |
| Existing Python tooling | TESTED LOCALLY | 73 tests pass |
| History-plan unit tests | TESTED LOCALLY | 2 tests pass; original SQL stored as quoted history data, never replayed; prerequisite rejection |
| Profile security | TESTED LOCALLY / VERIFIED IN DEVELOPMENT | Existing isolated security suite passes denied protected/foreign edits, allowed own fields and trusted provisioning; fresh hosted read-only column matrix confirms restrictions |
| Variant visibility proposal | TESTED LOCALLY | Existing isolated SELECT-policy suite passes, including unavailable/draft/RFQ/mismatched rejection and denied writes; NOT applied to Development |
| Full metadata rehearsal runner | BLOCKED in this local runtime | Existing run-catalog-isolated.mjs rejects because PGlite 0.3.14 connects to template1, while state_guard requires postgres. No assertion weakened; no hosted retry. Targeted actual migration/handler suites pass separately. Full history SQL still needs native PostgreSQL/private expected-catalogue execution before it can be applied |
| Build | TESTED LOCALLY | npm run build passes; no deployment |
| TypeScript | TESTED LOCALLY | Frontend, existing checkout tsconfig and new Development/payment modules pass |
| Targeted lint | TESTED LOCALLY | Changed TS/TSX/MJS files pass |
| Repository-wide lint | FAILED | Existing unrelated formatting debt: 196 errors, 7 warnings in the broad run; no unrelated mass rewrite |
| Hosted functional journey | BLOCKED | Development has no products, variants or deployed cart/checkout Edge Functions; no hosted fixtures/deployments authorized |
| Hosted concurrency | NOT TESTED | Original failed/incomplete Phase 5 evidence preserved. No new multi-session fixtures or old authorization reused |
| Payment integration | IMPLEMENTED boundary / TESTED LOCALLY with mocks | Fixed Sandbox verification URL, fail-closed replies and capture/merchant/currency/amount reconciliation. No real provider call; not a complete payment flow |
| Deno bundling/deployment | NOT TESTED | Node TS checks do not prove Edge bundling; separate Development deployment authorization required |

Browser runtime preparation: the default Playwright CDN download was invalid. A pinned
`@sparticuz/chromium@143.0.4` package supplied a local headless browser. Its Brotli binary
and graphics libraries were extracted into scratch without filesystem owner changes.
The Work process network namespaces require Vite/browser in one shell operation; an
untracked runtime shim supplies loopback interface enumeration. These are cloud-only
test-environment adaptations, not repository production runtime changes. Browser tests
start a fresh process per viewport because this single-process headless build exits
when its context closes. Earlier harness failures were investigated and corrected;
final both-viewport execution passed. No passing hosted result is inferred from this.

Read-only hosted checks: Development empty Auth/product/cart/checkout counts; no Edge
Functions; history has only profile correction; variants RLS enabled without read policy;
13-argument and legacy checkout bridge EXECUTE denied to browser roles. Only inspected
public browser-callable function is the read-only is_oddgrid_admin boolean helper;
its body reads admin_users using auth.uid and has an empty search_path. This is not a
complete review of every private helper/trigger/alternate authorization path.
Production read-only check reconfirmed role UPDATE denied, own first_name column UPDATE
allowed, service_role privileged UPDATE retained and RLS enabled. Its backup/correction
receipts remain separate historical evidence.

Reconciliation, policy, fixtures, Edge deployment and hosted browser tests are separate
approval checkpoints described in README.md. Production purchasing remains disabled.
