import { useState } from 'react';
import { CalendarClock, MapPin, Navigation, Route, Sparkles } from 'lucide-react';
import './Input.css';

const SUGGESTIONS = [
  'New York',
  'San Francisco',
  'London',
  'Tokyo',
  'Sydney',
  'Berlin',
];

const defaultDateTime = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};

/**
 * The trip-planning card. It owns the form state and the field validation;
 * the route calculation itself stays in the app (see src/state/TripContext.jsx).
 */
export default function Input({ onSubmit, defaults, submitting = false, error = '' }) {
  const [startPoint, setStartPoint] = useState(defaults?.startPoint ?? '');
  const [endPoint, setEndPoint] = useState(defaults?.endPoint ?? '');
  const [time, setTime] = useState(defaults?.time || defaultDateTime());
  const [fieldErrors, setFieldErrors] = useState({});

  const handleSubmit = (e) => {
    e.preventDefault();
    if (submitting) return;

    const nextErrors = {};
    if (!startPoint.trim()) nextErrors.startPoint = 'Enter a starting point.';
    if (!endPoint.trim()) nextErrors.endPoint = 'Enter a destination.';
    if (!time) nextErrors.time = 'Pick a departure date and time.';
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    onSubmit({ startPoint: startPoint.trim(), endPoint: endPoint.trim(), time });
  };

  const fill = (setter) => (place) => () => setter(place);

  return (
    <div className="planner">
      <header className="planner-head">
        <p className="planner-eyebrow">
          <Sparkles size={14} aria-hidden="true" /> Trip planner
        </p>
        <h2 className="planner-title">Plan your trip</h2>
        <p className="planner-sub">
          We trace the route, follow the sun, and tell you which seat stays cool.
        </p>
      </header>

      <form className="planner-form" onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="start-point">Starting point</label>
          <div className={`field-control${fieldErrors.startPoint ? ' has-error' : ''}`}>
            <MapPin size={17} aria-hidden="true" />
            <input
              id="start-point"
              name="start"
              type="text"
              placeholder="e.g. Central Park, New York"
              value={startPoint}
              onChange={(e) => {
                setStartPoint(e.target.value);
                if (fieldErrors.startPoint) {
                  setFieldErrors((prev) => ({ ...prev, startPoint: undefined }));
                }
              }}
              autoComplete="off"
              required
            />
          </div>
          {fieldErrors.startPoint && (
            <p className="field-error" role="alert">{fieldErrors.startPoint}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="end-point">Destination</label>
          <div className={`field-control${fieldErrors.endPoint ? ' has-error' : ''}`}>
            <Navigation size={17} aria-hidden="true" />
            <input
              id="end-point"
              name="destination"
              type="text"
              placeholder="e.g. Times Square, New York"
              value={endPoint}
              onChange={(e) => {
                setEndPoint(e.target.value);
                if (fieldErrors.endPoint) {
                  setFieldErrors((prev) => ({ ...prev, endPoint: undefined }));
                }
              }}
              autoComplete="off"
              required
            />
          </div>
          {fieldErrors.endPoint && (
            <p className="field-error" role="alert">{fieldErrors.endPoint}</p>
          )}
        </div>

        <div className="field">
          <label htmlFor="time">Departure date &amp; time</label>
          <div className={`field-control${fieldErrors.time ? ' has-error' : ''}`}>
            <CalendarClock size={17} aria-hidden="true" />
            <input
              id="time"
              name="time"
              type="datetime-local"
              value={time}
              onChange={(e) => {
                setTime(e.target.value);
                if (fieldErrors.time) {
                  setFieldErrors((prev) => ({ ...prev, time: undefined }));
                }
              }}
              required
            />
          </div>
          {fieldErrors.time && (
            <p className="field-error" role="alert">{fieldErrors.time}</p>
          )}
        </div>

        {error && (
          <p className="planner-error" role="alert">
            {error}
          </p>
        )}

        <button type="submit" id="submit-btn" className="primary-btn" disabled={submitting}>
          {submitting ? (
            <>
              <span className="spinner" aria-hidden="true" />
              Finding your route…
            </>
          ) : (
            <>
              <Route size={18} aria-hidden="true" />
              Plan My Trip
            </>
          )}
        </button>
      </form>

      <div className="suggestions">
        <span className="suggest-label">Popular starts</span>
        <div className="chip-row">
          {SUGGESTIONS.map((city) => (
            <button
              type="button"
              key={city}
              className="chip"
              onClick={fill(setStartPoint)(city)}
              aria-label={`Use ${city} as starting point`}
            >
              {city}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
