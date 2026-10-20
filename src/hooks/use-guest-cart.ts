import { useEffect, useSyncExternalStore } from "react";
import {
  getGuestCartSnapshot,
  getServerCartSnapshot,
  guestCartCount,
  refreshGuestCart,
  subscribeGuestCart,
} from "@/lib/guest-cart";

export function useGuestCart() {
  const cart = useSyncExternalStore(
    subscribeGuestCart,
    getGuestCartSnapshot,
    getServerCartSnapshot,
  );
  useEffect(() => {
    void refreshGuestCart();
  }, []);
  return { ...cart, count: guestCartCount(cart) };
}
