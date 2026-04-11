import { memo, useEffect, useState } from "react";
import type { CartItem } from "./types";

const currency = (value: number) => Math.round(value).toLocaleString("zh-TW");

interface CartRowProps {
  item: CartItem;
  quantity: number;
  customPrice: number | null;
  customReason: string;
  onUpdateQuantity: (delta: number) => void;
  onUpdateCustom: (price: number | null, reason: string) => void;
  onRemove: () => void;
  disabled: boolean;
}

function CartRowComponent({
  item,
  quantity,
  customPrice,
  customReason,
  onUpdateQuantity,
  onUpdateCustom,
  onRemove,
  disabled,
}: CartRowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>(
    customPrice !== null ? String(customPrice) : String(item.product.price),
  );
  const [tempReason, setTempReason] = useState(customReason);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTempPrice(
      customPrice !== null ? String(customPrice) : String(item.product.price),
    );
    setTempReason(customReason);
  }, [customPrice, customReason, item.product.price]);

  const displayPrice = customPrice ?? item.product.price;
  const displaySubtotal = displayPrice * quantity;

  function handleConfirmCustom() {
    const numeric = Number(tempPrice);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError("售價需為非負數字");
      return;
    }
    onUpdateCustom(numeric, tempReason.trim() || "大拍賣");
    setDialogOpen(false);
    setError(null);
  }

  function handleClearCustom() {
    onUpdateCustom(null, "");
    setTempPrice(String(item.product.price));
    setTempReason("");
    setError(null);
    setDialogOpen(false);
  }

  return (
    <>
      <tr className="border-t border-sand/40">
        <td className="px-4 py-2">
          <p>{item.product.name}</p>
          {customReason && (
            <p className="text-xs text-moss">出清：{customReason}</p>
          )}
        </td>
        <td className="px-4 py-2">
          <span>{currency(displayPrice)}</span>
          {customPrice !== null && (
            <span className="ml-2 rounded-full bg-moss/10 px-2 py-0.5 text-xs text-moss">
              特價
            </span>
          )}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-sand/60 active:scale-[0.95]"
              onClick={() => onUpdateQuantity(-1)}
              disabled={disabled}
            >
              -
            </button>
            <span className="w-8 text-center">{quantity}</span>
            <button
              type="button"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-sand/60 active:scale-[0.95]"
              onClick={() => onUpdateQuantity(1)}
              disabled={disabled}
            >
              +
            </button>
          </div>
        </td>
        <td className="px-4 py-2">
          <button
            type="button"
            className="rounded-full border border-sand/60 px-3 py-2.5 text-xs text-dusk hover:bg-linen/80 disabled:opacity-50 min-h-[44px] active:scale-[0.98]"
            onClick={() => {
              setDialogOpen(true);
              setError(null);
            }}
            disabled={disabled}
          >
            大拍賣
          </button>
        </td>
        <td className="px-4 py-2 text-right">{currency(displaySubtotal)}</td>
        <td className="px-4 py-2 text-right">
          <button
            className="min-h-[44px] min-w-[44px] px-2 text-sm text-clay hover:underline"
            onClick={onRemove}
            disabled={disabled}
          >
            移除
          </button>
        </td>
      </tr>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-dusk/50"
            onClick={() => setDialogOpen(false)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-sand/60 bg-white p-5 shadow-2xl">
            <h5 className="text-lg font-semibold text-dusk">設定大拍賣價格</h5>
            <p className="mt-1 text-sm text-dusk/70">{item.product.name}</p>
            <label className="mt-3 block text-sm font-medium text-dusk/80">
              特價 (元)
              <input
                type="number"
                min="0"
                inputMode="decimal"
                className="mt-1 w-full rounded-xl border border-sand/60 px-3 py-2"
                value={tempPrice}
                onChange={(e) => setTempPrice(e.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-dusk/80">
              理由
              <input
                type="text"
                className="mt-1 w-full rounded-xl border border-sand/60 px-3 py-2"
                value={tempReason}
                onChange={(e) => setTempReason(e.target.value)}
                placeholder="如：出清、瑕疵等 (選填)"
              />
            </label>
            {error && <p className="mt-2 text-sm text-clay">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              {customPrice !== null && (
                <button
                  type="button"
                  className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk hover:bg-linen/80 min-h-[44px]"
                  onClick={handleClearCustom}
                >
                  取消特價
                </button>
              )}
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-dusk/70 hover:bg-linen min-h-[44px]"
                onClick={() => setDialogOpen(false)}
              >
                關閉
              </button>
              <button
                type="button"
                className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow min-h-[44px]"
                onClick={handleConfirmCustom}
              >
                套用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export const CartRow = memo(CartRowComponent);
