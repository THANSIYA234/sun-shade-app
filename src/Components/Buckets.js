// Shared presentation constants for the five sun-exposure buckets.
// The same palette is used by the result panel and the map.

export const BUCKET_LABELS = {
  left: 'Sun on the left',
  right: 'Sun on the right',
  front: 'Sun ahead (windshield)',
  back: 'Sun behind (rear window)',
  dark: 'Sun below horizon',
};

// Blue vs orange is safe for deuteranopia and protanopia; the remaining
// buckets are neutral greys separated by lightness, and every bucket is also
// named in the legend so colour never carries the decision alone.
export const BUCKET_COLORS = {
  left: '#38A8FF',
  right: '#FF851B',
  front: '#E6EDF5',
  back: '#94A3B8',
  dark: '#3A4553',
};

export const BUCKET_ORDER = ['left', 'right', 'front', 'back', 'dark'];

const CSS_VARS = {
  left: '--bucket-left',
  right: '--bucket-right',
  front: '--bucket-front',
  back: '--bucket-back',
  dark: '--bucket-dark',
};

/**
 * Publish the palette as CSS custom properties so stylesheets and the map
 * share one source of truth (src/Components/Buckets.js).
 */
export function applyBucketPalette(target) {
  const root = target ?? globalThis.document?.documentElement;
  if (!root) return;
  for (const [bucket, color] of Object.entries(BUCKET_COLORS)) {
    root.style.setProperty(CSS_VARS[bucket], color);
  }
}

// Apply on import so the stylesheet's custom properties exist before first paint.
if (typeof document !== 'undefined') applyBucketPalette();
