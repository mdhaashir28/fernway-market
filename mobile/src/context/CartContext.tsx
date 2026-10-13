// The shopping cart lives on the phone (saved between app launches).
// Prices here are only for display — the server re-checks every price and
// stock level when the order is placed.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product } from '@/api/types';
import { localStore } from '@/lib/storage';

const CART_KEY = 'fernway.cart.v1';
export const MAX_PER_ITEM = 50;

export interface CartItem {
  productId: number;
  quantity: number;
  name: string;
  priceCents: number;
  unitLabel: string;
  imageUrl: string | null;
  icon: string | null;
  categoryIcon: string;
  availableQuantity: number;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  loaded: boolean;
  quantityOf: (productId: number) => number;
  add: (product: Product, quantity?: number) => void;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
  /** Updates names, prices and stock from fresh product data. */
  refreshFrom: (products: Product[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const toItem = (product: Product, quantity: number): CartItem => ({
  productId: product.id,
  quantity,
  name: product.name,
  priceCents: product.priceCents,
  unitLabel: product.unitLabel,
  imageUrl: product.imageUrl,
  icon: product.icon,
  categoryIcon: product.categoryIcon,
  availableQuantity: product.availableQuantity,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    localStore.getJson<CartItem[]>(CART_KEY).then((saved) => {
      if (Array.isArray(saved)) setItems(saved);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    if (loaded) localStore.setJson(CART_KEY, items);
  }, [items, loaded]);

  const add = useCallback((product: Product, quantity = 1) => {
    setItems((current) => {
      const existing = current.find((i) => i.productId === product.id);
      const limit = Math.min(MAX_PER_ITEM, product.availableQuantity);
      if (existing) {
        return current.map((i) =>
          i.productId === product.id ? { ...toItem(product, 0), quantity: Math.min(limit, i.quantity + quantity) } : i,
        );
      }
      return [...current, toItem(product, Math.min(limit, quantity))];
    });
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((i) => i.productId !== productId)
        : current.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(MAX_PER_ITEM, quantity) } : i)),
    );
  }, []);

  const remove = useCallback((productId: number) => {
    setItems((current) => current.filter((i) => i.productId !== productId));
  }, []);

  const clear = useCallback(() => setItems([]), []);

  const refreshFrom = useCallback((products: Product[]) => {
    const byId = new Map(products.map((p) => [p.id, p]));
    setItems((current) =>
      current.map((item) => {
        const fresh = byId.get(item.productId);
        // Not returned = no longer sold; keep it so the customer sees why, with 0 available.
        return fresh ? { ...toItem(fresh, item.quantity) } : { ...item, availableQuantity: 0 };
      }),
    );
  }, []);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      loaded,
      count: items.reduce((sum, i) => sum + i.quantity, 0),
      subtotalCents: items.reduce((sum, i) => sum + i.priceCents * i.quantity, 0),
      quantityOf: (productId) => items.find((i) => i.productId === productId)?.quantity ?? 0,
      add,
      setQuantity,
      remove,
      clear,
      refreshFrom,
    }),
    [items, loaded, add, setQuantity, remove, clear, refreshFrom],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
