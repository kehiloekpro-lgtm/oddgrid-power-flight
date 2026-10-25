# Development cart-api v1 startup failure — 2026-10-25

Scope: read-only hosted diagnosis and local packaging correction. No deployment
or hosted purchasing requests were performed during this investigation.

## Executed evidence

- Development function `d2059138-07d7-4a4d-a26f-61551be55862`, version 1,
  remained ACTIVE with `verify_jwt=false`; checkout-prepare remains absent.
- Freshly retrieved deployed JavaScript is 788384 bytes; SHA-256
  `da101b38b2962d55f38c2b993ba6aea8fbc8de13ae26290a3a40a9221faee976`
  matches the reviewed bundle from commit
  `1d41114942b1a60ace338ea8b376f09a810d564a`.
- Function logs at 09:14:16 and 09:16:05 UTC report the same exception at
  index.js:625: `Cannot destructure property '__extends' of
  'import_tslib.default' as it is undefined.` The 09:16 invocation and exception
  share execution ID `7349190a-3fa5-44f9-98fe-75f2b75dbef5`; invocation metadata
  reports HTTP 500 and `WORKER_ERROR`. Runtime: edge-runtime 1.77.8,
  compatible with Deno 2.1.4.
- The original artifact reproduces that exact exception in offline Deno 2.5.4
  and a Node VM before handler registration. No configuration or database
  access is needed to reproduce it.

## Cause and header attribution

Deno 2.5.4's dependency-inlining output converts tslib's CommonJS export to
ESM incorrectly: tslib marks its exports `__esModule` without a default export;
the generated `__toESM` wrapper consequently does not supply `default`, but the
following generated module destructures it. This happens during module
evaluation, outside the request handler's try/catch and before Deno.serve.
The previous compile-only preflight did not execute the resulting artifact.

This is a packaging/startup defect, not an established defect in OddGrid's CORS
or guest authorization code. The wildcard header belongs to the platform error
response path, not the application handler (which never registered and does not
return this 500). Available evidence does not identify the precise internal
managed runtime/gateway function that injects that header. No CORS widening or
configuration changes are proposed.

## Smallest correction

`bundle-cart.sh` explicitly excludes the pinned
`npm:@supabase/supabase-js@2.108.0` import from dependency inlining. Application
modules are bundled while the SDK is resolved natively by Deno. No SDK version,
business logic, permissions, secrets or application source files change.

Do not use `--packages external` alone: the executed experiment still inlined
this npm: URL (769.72 KiB) and the script correctly rejected that output.
The explicit `--external npm:@supabase/supabase-js@2.108.0` produces a 16.48 KiB
application bundle and preserves the native npm import.

The script refuses an existing output directory, checks the retained import,
rejects the known bad interop marker, caches dependencies, executes the real
entrypoint/SDK offline, and records the bundle checksum. It contains no deploy
command and does not read hosted credentials. Invoke with an installed cloud
Deno 2.5.4 toolchain (no Windows installation):

```bash
bash backend/development/bundle-cart.sh /absolute/private/new-output-directory
```

Native transitive dependencies must be reviewed/pinned in the eventual deployment
package; this local script does not certify a future hosted dependency graph.

## Regression results

Executed in isolated official denoland/deno containers: 2.5.4 and 2.1.4.
The real generated bundle imports the real pinned SDK. Deno.serve is captured
instead of opening a listener; environment values are synthetic; fetch throws
and is asserted unused. Test execution has no network permission. Dependency
download/cache preparation uses the public npm registry only.

All 11 checks passed in both versions:

1. Approved localhost OPTIONS: 204, exact origin, POST/apikey allowed, empty body.
2. Production-origin preflight rejected: 403, no allowed origin.
3. Missing application key: 401.
4. Wrong application key: 401.
5. Unsupported method: 405.
6. Non-JSON media type: 415.
7. Malformed JSON: 400.
8. Invalid action: 400.
9. Oversized request: 413.
10. Unapproved origin: 403.
11. Missing privileged configuration: 503 (fails closed).

Origin/no-wildcard and no-store assertions apply to all 10 configured request
cases. No network calls occurred. Shell syntax, JavaScript syntax and Git
whitespace checks also passed. Full frontend build was not rerun: no frontend
files changed. These tests do not prove hosted runtime integration, native
dependency packaging on Supabase, guest purchasing or database concurrency.

## Preservation and next checkpoint

Read-only Development inventory remained: 1 synthetic product, 2 variants,
0 carts, 0 checkout sessions, 0 orders, 0 Auth users. Authenticated UPDATE of
profiles.role remains false. No Production operations were performed. Existing
private deployment STOP records and original Phase 5 evidence were not edited.
Local logs/artifacts reside under the existing private purchasing directory,
`cart-startup-fix-validation/`, outside Git.

Review this packaging change before authorizing a replacement cart-api version.
A future approval must bind the new reviewed commit and generated artifact,
retain the exact localhost origin/app-key/guest-token controls, and authorize
only one Development cart-api deployment plus non-purchasing checks. Stop on
failure/ambiguity. Do not deploy checkout-prepare until cart-api passes hosted
verification. No purchasing records, payments or frontend publication are part
of this correction.
