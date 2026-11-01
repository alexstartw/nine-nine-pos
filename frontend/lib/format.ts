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

/**
 * Format an amount as "$1,080" (negative: "-$1,080"), rounded to whole dollars.
 * One currency style for every screen; display only.
 */
export function formatMoney(value: number | null | undefined): string {
  const n = Math.round(typeof value === "number" && Number.isFinite(value) ? value : 0);
  const digits = Math.abs(n).toLocaleString("zh-TW");
  return n < 0 ? `-$${digits}` : `$${digits}`;
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function toLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Format a date or timestamp as "yyyy/mm/dd" in local time.
 * Date-only strings are read as-is (see formatDateYMD).
 */
export function formatDateLocal(value: string | null | undefined): string {
  if (!value) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDateYMD(value);
  const date = toLocalDate(value);
  if (!date) return "-";
  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())}`;
}

/** Format a timestamp as "HH:mm" (24-hour, local time). */
export function formatTime(value: string | null | undefined): string {
  const date = toLocalDate(value);
  if (!date) return "-";
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Format a timestamp as "yyyy/mm/dd HH:mm" (24-hour, local time). */
export function formatDateTime(value: string | null | undefined): string {
  const date = toLocalDate(value);
  if (!date) return "-";
  return `${formatDateLocal(value)} ${formatTime(value)}`;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "現金",
  transfer: "轉帳",
  mobile: "行動支付",
};

/** Chinese label for a payment method code ("cash" → "現金"); unknown codes are shown as-is. */
export function formatPaymentMethod(method: string | null | undefined): string {
  if (!method) return "-";
  return PAYMENT_METHOD_LABELS[method] ?? method;
}
