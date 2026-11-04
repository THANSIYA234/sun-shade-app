import SunCalc from 'suncalc';

// Rough urban average driving speed (m/s). Only used when ORS does not report
// a duration for the route.
export const FALLBACK_SPEED_MPS = 13.4; // ~30 mph

// Minimum left/right percentage gap before a side is recommended.
export const SIDE_DECISION_MARGIN_PCT = 10;

// Half-width of the "sun ahead" / "sun behind" cones, in degrees.
export const SIDE_CONE_DEG = 45;

const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

export const wrap360 = (deg) => ((deg % 360) + 360) % 360;
export const wrap180 = (deg) => {
  const x = wrap360(deg);
  return x > 180 ? x - 360 : x;
};

/**
 * suncalc reports azimuth from SOUTH (0 = due south, positive toward west).
 * Convert to the north-based, clockwise-from-north convention getBearing() uses.
 */
export const toNorthAzimuth = (sunAzimuthRad) => wrap360(toDeg(sunAzimuthRad) + 180);

// Forward bearing from p1 -> p2 in degrees (0 = north, clockwise).
export function getBearing(lat1, lon1, lat2, lon2) {
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const brng = Math.atan2(y, x);
  return wrap360(toDeg(brng));
}

// Great-circle distance between two [lat, lon] points (metres).
function haversineMeters([lat1, lon1], [lat2, lon2]) {
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Classify a signed lateral angle: the sun's azimuth relative to the travel
 * direction. Positive = the sun is clockwise of the heading (traveller's right).
 */
export function classifyLateral(lateralDeg) {
  if (lateralDeg > SIDE_CONE_DEG && lateralDeg <= 180 - SIDE_CONE_DEG) return 'right';
  if (lateralDeg < -SIDE_CONE_DEG && lateralDeg >= -(180 - SIDE_CONE_DEG)) return 'left';
  if (Math.abs(lateralDeg) <= SIDE_CONE_DEG) return 'front';
  return 'back';
}

const emptyExposure = () => ({
  left: 0,
  right: 0,
  front: 0,
  back: 0,
  dark: 100,
  preferred: 'Either side',
  isDark: true,
  distanceMeters: 0,
  durationSeconds: 0,
  segments: [],
});

/**
 * Compute the sun-exposure breakdown for a route at a given start time.
 *
 * route = { coords: [[lat, lon], ...], distanceMeters?: number, durationSeconds?: number }
 *
 * Every route segment is classified by the sun's position at the moment the
 * traveller reaches it, weighted by the segment's length. The returned
 * percentages always sum to 100.
 */
export function getSunExposure(route, startTime) {
  const coords = Array.isArray(route?.coords) ? route.coords : null;
  if (!coords || coords.length < 2) return emptyExposure();

  const startDate = new Date(startTime);
  if (Number.isNaN(startDate.getTime())) return emptyExposure();

  const segmentLengths = [];
  let segmentMetersTotal = 0;
  for (let i = 0; i < coords.length - 1; i += 1) {
    const length = haversineMeters(coords[i], coords[i + 1]);
    segmentLengths.push(length);
    segmentMetersTotal += length;
  }
  if (segmentMetersTotal <= 0) return emptyExposure();

  // Route distance drives the timing model; the summed segment length is the
  // denominator for the percentages so they always total 100%.
  const reportedDistance = Number(route.distanceMeters);
  const routeMeters =
    Number.isFinite(reportedDistance) && reportedDistance > 0
      ? reportedDistance
      : segmentMetersTotal;
  const reportedDuration = Number(route.durationSeconds);
  const durationSeconds =
    Number.isFinite(reportedDuration) && reportedDuration > 0
      ? reportedDuration
      : routeMeters / FALLBACK_SPEED_MPS;

  const bucketMeters = { left: 0, right: 0, front: 0, back: 0, dark: 0 };
  const segments = [];
  let cumulativeMeters = 0;

  for (let i = 0; i < coords.length - 1; i += 1) {
    const p1 = coords[i];
    const p2 = coords[i + 1];
    const length = segmentLengths[i];
    const midpointMeters = cumulativeMeters + length / 2;
    // ORS distance and the polyline length can differ slightly; keep the
    // sampled instant inside the trip.
    const progress = Math.min(1, midpointMeters / routeMeters);
    const tOffsetMs = progress * durationSeconds * 1000;
    const sampleDate = new Date(startDate.getTime() + tOffsetMs);

    const sun = SunCalc.getPosition(sampleDate, p1[0], p1[1]);

    let bucket;
    if (sun.altitude <= 0) {
      bucket = 'dark';
    } else {
      const bearing = getBearing(p1[0], p1[1], p2[0], p2[1]);
      const azimuth = toNorthAzimuth(sun.azimuth);
      const lateral = wrap180(azimuth - bearing);
      bucket = classifyLateral(lateral);
    }

    bucketMeters[bucket] += length;
    segments.push({ bucket, meters: length, fromIndex: i, toIndex: i + 1 });
    cumulativeMeters += length;
  }

  const pct = (meters) => (meters / segmentMetersTotal) * 100;
  const left = pct(bucketMeters.left);
  const right = pct(bucketMeters.right);
  const front = pct(bucketMeters.front);
  const back = pct(bucketMeters.back);
  const dark = pct(bucketMeters.dark);

  const sideGap = Math.abs(left - right);
  let preferred = 'Either side';
  if (sideGap >= SIDE_DECISION_MARGIN_PCT) {
    preferred = left < right ? 'Left side' : 'Right side';
  }

  return {
    left,
    right,
    front,
    back,
    dark,
    preferred,
    isDark: dark === 100,
    distanceMeters: routeMeters,
    durationSeconds,
    segments,
  };
}

/**
 * The point on the polyline at a given progress (0..1) of the route, measured
 * by distance. Used to sample the sun where the traveller actually is.
 */
export function getPointAtProgress(coords, progress) {
  const list = Array.isArray(coords) ? coords : [];
  if (!list.length) return [0, 0];

  const total = list
    .slice(0, -1)
    .reduce((sum, point, i) => sum + haversineMeters(point, list[i + 1]), 0);
  if (total <= 0) return list[0];

  const target = Math.min(1, Math.max(0, progress)) * total;
  let travelled = 0;
  for (let i = 0; i < list.length - 1; i += 1) {
    const length = haversineMeters(list[i], list[i + 1]);
    if (travelled + length >= target) {
      const ratio = length > 0 ? (target - travelled) / length : 0;
      return [
        list[i][0] + (list[i + 1][0] - list[i][0]) * ratio,
        list[i][1] + (list[i + 1][1] - list[i][1]) * ratio,
      ];
    }
    travelled += length;
  }
  return list[list.length - 1];
}

/**
 * The sun's position at a given instant for a point on the route.
 * Returns null when the date or the polyline is unusable.
 */
export function getSunPosition(coords, date, progress = 0) {
  const list = Array.isArray(coords) ? coords : [];
  if (!list.length) return null;

  const when = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(when.getTime())) return null;

  const [lat, lon] = getPointAtProgress(list, progress);
  const position = SunCalc.getPosition(when, lat, lon);

  return {
    date: when,
    lat,
    lon,
    altitude: position.altitude,
    azimuth: position.azimuth,
    altitudeDeg: toDeg(position.altitude),
    azimuthDeg: toNorthAzimuth(position.azimuth),
    declination: position.declination,
  };
}

/**
 * The sun's path across the trip window: the same sampling the exposure
 * breakdown uses, sampled every stepMinutes along the route duration.
 */
export function getSunPath(coords, date, durationSeconds, steps = 12, stepMinutes = 15) {
  const list = Array.isArray(coords) ? coords : [];
  if (!list.length) return [];

  const start = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(start.getTime())) return [];

  const duration = Number(durationSeconds);
  const totalMs = Number.isFinite(duration) && duration > 0
    ? duration * 1000
    : (steps + 1) * stepMinutes * 60 * 1000;

  const path = [];
  for (let i = 0; i <= steps; i += 1) {
    const progress = i / steps;
    const when = new Date(start.getTime() + totalMs * progress);
    const position = getSunPosition(list, when, progress);
    if (!position) continue;
    path.push({
      progress,
      date: when,
      altitudeDeg: position.altitudeDeg,
      azimuthDeg: position.azimuthDeg,
      lat: position.lat,
      lon: position.lon,
    });
  }
  return path;
}

/**
 * Sunrise / sunset / solar noon for the midpoint of a polyline, as absolute
 * Date instants.
 */
export function getSunTimes(coords, date) {
  const list = Array.isArray(coords) ? coords : [];
  const midpoint = list.length ? list[Math.floor((list.length - 1) / 2)] : [0, 0];
  const when = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(when.getTime())) {
    return { sunrise: null, sunset: null, solarNoon: null };
  }

  const times = SunCalc.getTimes(when, midpoint[0], midpoint[1]);
  return {
    sunrise: times.sunrise,
    sunset: times.sunset,
    solarNoon: times.solarNoon,
  };
}
