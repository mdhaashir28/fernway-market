// "Order again" and "Add list to cart": put several products in the cart using
// today's prices and stock.
import { router } from 'expo-router';
import { useState } from 'react';
import { api } from '@/api/client';
import type { Paginated, Product } from '@/api/types';
import { useCart } from '@/context/CartContext';
import { useToast } from '@/context/ToastContext';
import { useT } from '@/i18n';
import { useErrorText } from '@/i18n/errors';

export function useAddToCart() {
  const cart = useCart();
  const toast = useToast();
  const { t } = useT();
  const errorText = useErrorText();
  const [busy, setBusy] = useState(false);

  /** Adds the lines that are in stock, tells the customer what was skipped, and opens the cart. */
  async function addLines(lines: { productId: number; quantity: number }[]) {
    if (!lines.length) return;
    setBusy(true);
    try {
      const ids = [...new Set(lines.map((l) => l.productId))];
      const { items } = await api.get<Paginated<Product>>(`/api/products?ids=${ids.join(',')}&pageSize=100`);
      const byId = new Map(items.map((p) => [p.id, p]));
      const usable: { product: Product; quantity: number }[] = [];
      let missing = 0;
      for (const line of lines) {
        const product = byId.get(line.productId);
        if (product) usable.push({ product, quantity: line.quantity });
        else missing++;
      }
      const { added, skipped } = cart.addMany(usable);
      const notAdded = skipped + missing;
      if (added === 0) toast(t('None of these products are in stock right now.'), 'error');
      else {
        toast(
          notAdded
            ? t('{added} products added to your cart. {skipped} are out of stock.', { added, skipped: notAdded })
            : t('{added} products added to your cart.', { added }),
        );
        router.navigate('/cart');
      }
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  /** "Order again" for a past order. */
  async function reorder(orderId: number) {
    setBusy(true);
    try {
      const { items } = await api.get<{ items: { productId: number; requestedQuantity: number }[] }>(`/api/orders/${orderId}/reorder`);
      await addLines(items.map((i) => ({ productId: i.productId, quantity: i.requestedQuantity })));
    } catch (err) {
      toast(errorText(err), 'error');
    } finally {
      setBusy(false);
    }
  }

  return { addLines, reorder, busy };
}
