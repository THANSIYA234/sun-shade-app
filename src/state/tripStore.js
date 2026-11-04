import { createContext } from 'react';
import { getSunExposure, getSunTimes } from '../Components/SunCalc';

// The trip is calculated once, in the provider, and shared by every page.
// Nothing on the route-overview or details pages re-requests the route.
const STORAGE_KEY = 'sit-in-shade:trip';

export const TripContext = createContext(null);

/** Only a complete, usable route is restored — never a partial or invented one. */
export function isRestorable(trip) {
  return (
    !!trip &&
    Array.isArray(trip.route?.coords) &&
    trip.route.coords.length > 1 &&
    Number(trip.route.distanceMeters) > 0 &&
    !!trip.query?.startPoint &&
    !!trip.query?.endPoint &&
    !!trip.query?.time
  );
}

export function readStoredTrip() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isRestorable(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredTrip(trip) {
  try {
    if (trip) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage full or blocked — the trip still lives in memory */
  }
}

/**
 * Rebuild the derived sun data for a restored trip. The route itself is never
 * re-requested; only the local sun maths is replayed so a refreshed page shows
 * the same numbers it showed before.
 */
export function withDerivedData(trip) {
  if (!isRestorable(trip)) return null;
  const exposure = getSunExposure(trip.route, trip.query.time);
  const sunTimes = getSunTimes(trip.route.coords, new Date(trip.query.time));
  return { ...trip, exposure, sunTimes };
}
