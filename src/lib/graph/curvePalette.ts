/**
 * Default colours for plotted curves.
 *
 * Chosen in a muted register rather than saturated primaries: several curves
 * often share one set of axes, and projected at lecture scale a vivid palette
 * vibrates against the grid and against ink drawn over the top. These stay
 * distinguishable from each other and from black annotation ink, and remain
 * legible when a slide is printed in greyscale because their lightness values
 * are spread apart.
 */
export const CURVE_PALETTE: readonly string[] = [
  '#2f4f6f', // deep slate blue
  '#b4544a', // muted brick
  '#3f7d6a', // pine
  '#8a6bab', // dusty violet
  '#c08a3e', // ochre
  '#4a7fb5', // steel blue
  '#a05579', // plum
  '#5c7a3f', // olive
];

/**
 * Next colour for a curve being added to a graph that already uses `existing`.
 *
 * Prefers the first palette entry not already in use so a new curve is always
 * visually distinct; once every entry is taken it cycles by position.
 */
export function nextCurveColor(existing: readonly string[]): string {
  const used = new Set(existing.map((color) => color.toLowerCase()));
  const free = CURVE_PALETTE.find((color) => !used.has(color.toLowerCase()));
  return free ?? CURVE_PALETTE[existing.length % CURVE_PALETTE.length];
}
