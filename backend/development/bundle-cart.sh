#!/usr/bin/env bash
# Local preparation only. No deployment, credentials or hosted requests.
set -euo pipefail
root=$(cd -- "$(dirname -- "$0")/../.." && pwd)
out=${1:?Usage: bundle-cart.sh NEW_OUTPUT_DIRECTORY}
mkdir -m 700 "$out" # refuse to overwrite previously reviewed evidence
out=$(cd -- "$out" && pwd)
umask 077
# Keep npm packages native: Deno 2.5.4 inlining produces invalid tslib CJS/ESM
# interop. Supabase's module resolver must receive the pinned npm import.
deno bundle --no-config --no-lock --platform deno --packages external \
  --output "$out/cart-api.js" "$root/backend/development/cart-index.ts"
grep -F 'npm:@supabase/supabase-js@2.108.0' "$out/cart-api.js" >/dev/null
if grep -q 'import_tslib.default' "$out/cart-api.js"; then
  echo 'Unsafe inlined dependency found' >&2; exit 1
fi
# Cache the native graph, then test it offline with no network permission.
deno cache --no-config --no-lock "$out/cart-api.js"
deno run --no-config --no-lock --cached-only --allow-read="$out" \
  "$root/tests/development-cart-startup.deno.mjs" "$out/cart-api.js"
sha256sum "$out/cart-api.js" > "$out/SHA256SUMS"
