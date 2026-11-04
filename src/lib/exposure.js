/**
 * Why the recommended side was picked. Shared by the results panel and the
 * route-analysis page so both always say the same thing.
 */
export function explainRecommendation(exposure) {
  if (!exposure) return '';
  if (exposure.isDark) {
    return 'The sun stays below the horizon for this whole trip.';
  }
  if (exposure.preferred === 'Either side') {
    return 'Both sides get about the same amount of sun.';
  }
  const sunnySide = exposure.right > exposure.left ? 'right' : 'left';
  return `The sun spends more time on your ${sunnySide}, so the ${exposure.preferred.toLowerCase()} stays shadier.`;
}

/** The side that gets the most sun, and how much of the route it covers. */
export function sunnierSide(exposure) {
  if (!exposure) return { side: 'Either side', pct: 0 };
  if (exposure.left === exposure.right) {
    return { side: 'Both sides', pct: exposure.left };
  }
  return exposure.right > exposure.left
    ? { side: 'Right side', pct: exposure.right }
    : { side: 'Left side', pct: exposure.left };
}
