# Variant pricing — implemented migration, staged deployment

The Phase 1 proposal has been implemented from the authoritative October 21 export
in `migrations/20261021_001_secure_variant_checkout.sql`.

- Existing checkout/order snapshots gain nullable variant ID/name. Historical rows
  are preserved; selected SKUs and prices are frozen; no variant FK rewrites history.
- Partial unique indexes allow one base line and distinct selected variants per
  parent product. Both explicit base and selected-variant lines are supported.
- Parent/item/variant locks and one validated JSONB projection keep prices and
  snapshot totals consistent. Exact numeric SQL prices are authoritative.
- Required token proof is checked in the transaction; old signatures cannot bypass
  guest authorization. UUID request serialization prevents cross-cart idempotency
  disclosure. Authenticated ownership/staff authorization remains privileged.
- Order finalization copies the frozen configuration; all other exported logic is
  unchanged. No payment or finalization call is added or executed.

See README.md for source provenance, isolated test limits and the approval-gated
activation procedure. The migration has not been applied to OddGrid. The Edge
adapter has not been deployed; both checkout gates remain false.
