/**
 * Small, pure utility functions.
 *
 * Rationale:
 * - Any math/util used by multiple components should live outside components.
 * - This keeps components focused on rendering and event wiring.
 */

export function clampGrid(rect: { x: number; y: number; w: number; h: number }, cols: number) {
  let { x, y, w, h } = rect;
  w = Math.max(1, Math.min(w, cols));
  x = Math.max(0, Math.min(x, cols - w));
  y = Math.max(0, y);
  h = Math.max(1, h);
  return { x, y, w, h };
}
