import type { PaymentMethod, PosMemberInfo, PosProduct } from '@/lib/api';

export type CartItem = {
  product: PosProduct;
  quantity: number;
};

export type CustomPriceMap = Record<number, { price: number; reason: string }>;

export interface TabState {
  id: string;
  label: string;
  barcode: string;
  cart: CartItem[];
  memberPhone: string;
  member: PosMemberInfo | null;
  memberMatches: PosMemberInfo[];
  showMemberOptions: boolean;
  paymentMethod: PaymentMethod;
  manualDiscountRate: number | null;
  manualDiscountInput: string;
  discountError: string | null;
  roundDown: boolean;
  customPrices: CustomPriceMap;
}

export function createDefaultTab(label: string): TabState {
  return {
    id: crypto.randomUUID(),
    label,
    barcode: '',
    cart: [],
    memberPhone: '',
    member: null,
    memberMatches: [],
    showMemberOptions: false,
    paymentMethod: 'cash',
    manualDiscountRate: null,
    manualDiscountInput: '',
    discountError: null,
    roundDown: false,
    customPrices: {}
  };
}
