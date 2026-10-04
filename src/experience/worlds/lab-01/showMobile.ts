/**
 * Mobile framing for Lab 01 — based on the device window, not the
 * canvas aspect. A short /music hero strip is wide even on phones and
 * must not flip into desktop particle density / camera distance.
 */
export function readShowMobile(): boolean {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth;
  const h = Math.max(window.innerHeight, 1);
  return w / h < 0.75 || w < 520;
}

export function subscribeShowMobile(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("resize", onStoreChange);
  return () => window.removeEventListener("resize", onStoreChange);
}
