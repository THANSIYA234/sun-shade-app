import { useCallback, useMemo, useState } from 'react';
import { getRoute, DEFAULT_PROFILE } from '../Components/Routes';
import { getSunExposure, getSunTimes } from '../Components/SunCalc';
import {
  TripContext,
  readStoredTrip,
  withDerivedData,
  writeStoredTrip,
} from './tripStore';

/**
 * Holds the single calculated trip for the session and exposes the actions the
 * pages need: plan a trip, reset it, and read the current state.
 */
export function TripProvider({ children }) {
  const [trip, setTrip] = useState(() => withDerivedData(readStoredTrip()));
  const [status, setStatus] = useState(trip ? 'ready' : 'idle'); // idle | loading | error | ready
  const [error, setError] = useState('');

  const planTrip = useCallback(async ({ startPoint, endPoint, time }) => {
    setStatus('loading');
    setError('');

    try {
      const route = await getRoute(startPoint, endPoint, DEFAULT_PROFILE);
      const exposure = getSunExposure(route, time);
      const sunTimes = getSunTimes(route.coords, new Date(time));

      const next = {
        query: { startPoint, endPoint, time, profile: DEFAULT_PROFILE },
        route,
        exposure,
        sunTimes,
      };

      setTrip(next);
      writeStoredTrip(next);
      setStatus('ready');
      return next;
    } catch (err) {
      console.error(err);
      setError(err?.message || 'Something went wrong.');
      setStatus('error');
      throw err;
    }
  }, []);

  const reset = useCallback(() => {
    setTrip(null);
    writeStoredTrip(null);
    setStatus('idle');
    setError('');
  }, []);

  const value = useMemo(
    () => ({
      trip,
      status,
      error,
      planTrip,
      reset,
      hasTrip: !!trip,
    }),
    [trip, status, error, planTrip, reset],
  );

  return <TripContext.Provider value={value}>{children}</TripContext.Provider>;
}
