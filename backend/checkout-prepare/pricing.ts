/** Staged server-only eligibility policy. Inputs MUST be database records, never request data.
 * This does not replace the required atomic SQL correction or calculate browser totals.
 */
export interface ProductRecord {
  id: string;
  name: string;
  sku: string | null;
  currency: string;
  selling_price: string | number | null;
  status: string;
  sale_type: string;
  availability: string;
}
export interface VariantRecord {
  id: string;
  product_id: string;
  variant_name: string;
  sku: string | null;
  currency: string;
  selling_price: string | number | null;
  availability: string;
  is_active: boolean;
}
export interface CheckoutCartItem {
  product_id: string;
  variant_id: string | null;
  quantity: number;
}
export interface ItemSnapshot {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  product_sku: string | null;
  quantity: number;
  unit_price: string;
  line_total: string;
}
function cents(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number")
    throw new Error("Invalid selling price");
  const match = /^(\d{1,10})(?:\.(\d{1,2}))?$/.exec(String(value));
  if (!match) throw new Error("Invalid selling price");
  const amount = BigInt(match[1]) * 100n + BigInt((match[2] ?? "").padEnd(2, "0"));
  if (amount <= 0n) throw new Error("Invalid selling price");
  return amount;
}
const money = (value: bigint) => `${value / 100n}.${String(value % 100n).padStart(2, "0")}`;
export function snapshotCart(
  items: CheckoutCartItem[],
  products: ProductRecord[],
  variants: VariantRecord[],
  currency: string,
) {
  if (!["USD", "ZAR"].includes(currency) || !items.length)
    throw new Error("Empty cart or unsupported currency");
  let subtotal = 0n;
  const snapshots: ItemSnapshot[] = items.map((item) => {
    const product = products.find((row) => row.id === item.product_id);
    if (
      !product ||
      product.status !== "active" ||
      product.sale_type !== "direct" ||
      product.currency.trim() !== currency ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 100
    )
      throw new Error("Product or quantity is not eligible");
    let selected: ProductRecord | VariantRecord = product;
    let variant: VariantRecord | undefined;
    if (item.variant_id !== null) {
      variant = variants.find((row) => row.id === item.variant_id && row.product_id === product.id);
      if (!variant || variant.is_active !== true)
        throw new Error("Selected variant is invalid or inactive");
      selected = variant;
    } else if (variants.some((row) => row.product_id === product.id))
      throw new Error("Product configuration must be selected");
    if (selected.availability !== "confirmed_available" || selected.currency.trim() !== currency)
      throw new Error("Availability or currency mismatch");
    const unit = cents(selected.selling_price);
    const line = unit * BigInt(item.quantity);
    subtotal += line;
    if (subtotal > 999999999999n) throw new Error("Checkout amount exceeds supported precision");
    return {
      product_id: product.id,
      variant_id: variant?.id ?? null,
      product_name: product.name,
      variant_name: variant?.variant_name ?? null,
      product_sku: variant ? variant.sku : product.sku,
      quantity: item.quantity,
      unit_price: money(unit),
      line_total: money(line),
    };
  });
  return { items: snapshots, subtotal: money(subtotal) };
}
