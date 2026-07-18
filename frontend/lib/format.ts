/**
 * Display-only formatting helpers.
 *
 * These normalize how values look on screen without mutating stored data.
 */

/**
 * Strip a spurious trailing ".0" from a SKU.
 *
 * Legacy Excel imports read numeric SKU cells as floats (e.g. 230901 →
 * "230901.0"), so some stored SKUs carry a trailing ".0". This cleans the
 * display only — the underlying value in the database is left untouched.
 */
export function formatSku(sku: string | null | undefined): string {
  if (!sku) return sku ?? "";
  return sku.replace(/\.0+$/, "");
}
