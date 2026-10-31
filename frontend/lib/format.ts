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

/**
 * Format a date / datetime string as "yyyy/mm/dd".
 *
 * Date-only strings ("1990-03-15") are read as-is instead of going through
 * `new Date()`, which would parse them as UTC midnight and could shift the
 * day in negative-offset time zones.
 */
export function formatDateYMD(value: string | null | undefined): string {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (match) return `${match[1]}/${match[2]}/${match[3]}`;
  return value;
}

/**
 * Format a Taiwan mobile number as "09xx-xxx-xxx".
 *
 * Display only — phones are stored as entered and POS looks members up by
 * exact match, so the stored value must not change. Anything that isn't a
 * 10-digit 09 mobile number (landlines, foreign numbers) is shown as stored.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "-";
  const digits = phone.replace(/\D/g, "");
  if (/^09\d{8}$/.test(digits)) {
    return `${digits.slice(0, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}
