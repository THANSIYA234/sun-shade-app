// Shared display formatters — used by the results panel and the route pages.

export const formatPct = (n) => `${(Number(n) || 0).toFixed(1)}%`;

export const formatDistance = (meters) => {
  const m = Number(meters);
  if (!m || !Number.isFinite(m)) return '';
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(1)} km`;
};

export const formatDuration = (seconds) => {
  const s = Number(seconds);
  if (!s || !Number.isFinite(s)) return '';
  const minutes = Math.round(s / 60);
  if (minutes < 1) return '<1 min';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
};

export const formatClock = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

export const formatDateTime = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

/** "Left side" | "Right side" | "Either side" -> "Left" | "Right" | "Either". */
export const sideKey = (preferred) => {
  if (preferred === 'Right side') return 'Right';
  if (preferred === 'Left side') return 'Left';
  return 'Either';
};

/** A compass name for a north-based bearing. */
export const compassPoint = (deg) => {
  const points = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
  const index = Math.round((((Number(deg) || 0) % 360) + 360) % 360 / 22.5) % 16;
  return points[index];
};
