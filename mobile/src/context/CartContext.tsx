// The shopping cart lives on the phone (saved between app launches).
// Prices here are only for display — the server re-checks every price and
// stock level when the order is placed.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Product, SubstitutionPreference } from '@/api/types';
import { localStore } from '@/lib/storage';

const CART_KEY = 'fernway.cart.v1';
export const MAX_PER_ITEM = 50;

/** What the customer wants if the item turns out to be unavailable when the order is picked. */
export interface SubstitutionChoice {
  preference: SubstitutionPreference;
  productId?: number;
  productName?: string;
  productNameTa?: string | null;
}

export interface CartItem {
  productId: number;
  quantity: number;
  name: string;
  nameTa: string | null;
  brand: string | null;
  priceCents: number;
  unitLabel: string;
  imageUrl: string | null;
  categoryId?: number;
  availableQuantity: number;
  substitution: SubstitutionChoice;
}

interface CartContextValue {
  items: CartItem[];
  count: number;
  subtotalCents: number;
  loaded: boolean;
  quantityOf: (productId: number) => number;
  add: (product: Product, quantity?: number) => void;
  /** Adds several products at once (re-order, shopping lists). Returns how many could be added. */
  addMany: (lines: { product: Product; quantity: number }[]) => { added: number; skipped: number };
  setQuantity: (productId: number, quantity: number) => void;
  setSubstitution: (productId: number, choice: SubstitutionChoice) => void;
  remove: (productId: number) => void;
  clear: () => void;
  /** Updates names, prices and stock from fresh product data. */
  refreshFrom: (products: Product[]) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const DEFAULT_SUBSTITUTION: SubstitutionChoice = { preference: 'none' };

const toItem = (product: Product, quantity: number, substitution: SubstitutionChoice = DEFAULT_SUBSTITUTION): CartItem => ({
  productId: product.id,
  quantity,
  name: product.name,
  nameTa: product.nameTa ?? null,
  brand: product.brand ?? null,
  priceCents: product.priceCents,
  unitLabel: product.unitLabel,
  imageUrl: product.imageUrl,
  categoryId: product.categoryId,
  availableQuantity: product.availableQuantity,
  substitution,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    localStore.getJson<CartItem[]>(CART_KEY).then((saved) => {
      // Carts saved by older app versions have no substitution choice yet.
      if (Array.isArray(saved)) {
        setItems(saved.map((i) => ({ ...i, nameTa: i.nameTa ?? null, brand: i.brand ?? null, substitution: i.substitution ?? DEFAULT_SUBSTITUTION })));
      }
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
          i.productId === product.id ? { ...toItem(product, 0, i.substitution), quantity: Math.min(limit, i.quantity + quantity) } : i,
        );
      }
      return [...current, toItem(product, Math.min(limit, quantity))];
    });
  }, []);

  const addMany = useCallback((lines: { product: Product; quantity: number }[]) => {
    let added = 0;
    let skipped = 0;
    const usable = lines.filter((line) => {
      const ok = line.product.availableQuantity > 0 && line.quantity > 0;
      if (ok) added++;
      else skipped++;
      return ok;
    });
    setItems((current) => {
      let next = [...current];
      for (const { product, quantity } of usable) {
        const limit = Math.min(MAX_PER_ITEM, product.availableQuantity);
        const existing = next.find((i) => i.productId === product.id);
        next = existing
          ? next.map((i) => (i.productId === product.id ? { ...toItem(product, 0, i.substitution), quantity: Math.min(limit, i.quantity + quantity) } : i))
          : [...next, toItem(product, Math.min(limit, quantity))];
      }
      return next;
    });
    return { added, skipped };
  }, []);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setItems((current) =>
      quantity <= 0
        ? current.filter((i) => i.productId !== productId)
        : current.map((i) => (i.productId === productId ? { ...i, quantity: Math.min(MAX_PER_ITEM, quantity) } : i)),
    );
  }, []);

  const setSubstitution = useCallback((productId: number, choice: SubstitutionChoice) => {
    setItems((current) => current.map((i) => (i.productId === productId ? { ...i, substitution: choice } : i)));
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
        return fresh ? toItem(fresh, item.quantity, item.substitution) : { ...item, availableQuantity: 0 };
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
      addMany,
      setQuantity,
      setSubstitution,
      remove,
      clear,
      refreshFrom,
    }),
    [items, loaded, add, addMany, setQuantity, setSubstitution, remove, clear, refreshFrom],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside <CartProvider>');
  return ctx;
}
