import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Clock3,
  Compass,
  MapPin,
  Navigation,
  Route as RouteIcon,
  Sun,
} from 'lucide-react';
import { MapView } from '../MapView';
import { useTrip } from '../state/useTrip';
import {
  formatDateTime,
  formatDistance,
  formatDuration,
  sideKey,
} from '../lib/format';
import './RouteOverview.css';

const SIDE_COLORS = {
  Left: 'var(--blue)',
  Right: 'var(--orange)',
  Either: 'var(--accent)',
};

export default function RouteOverview() {
  const { trip } = useTrip();
  const navigate = useNavigate();

  const { route, exposure, query } = trip;
  const preferred = exposure?.preferred ?? 'Either side';
  const key = sideKey(preferred);
  const color = SIDE_COLORS[key];

  const departure = formatDateTime(query.time);

  return (
    <div className="page overview">
      <header className="topnav">
        <button
          type="button"
          className="brand"
          onClick={() => navigate('/')}
          aria-label="Sit In Shade — back to trip planner"
        >
          <span className="brand-mark" aria-hidden="true">
            <Sun size={17} />
          </span>
          <span className="brand-name">Sit In Shade</span>
        </button>

        <div className="topnav-title">
          <button
            type="button"
            className="back-btn"
            onClick={() => navigate('/')}
          >
            <ArrowLeft size={16} aria-hidden="true" /> Back
          </button>
          <h1>Route Details</h1>
        </div>

        <div className="topnav-legend" aria-label="Side legend">
          <span className="legend-item">
            <span className="legend-line left" aria-hidden="true" /> Left side
          </span>
          <span className="legend-item">
            <span className="legend-line right" aria-hidden="true" /> Right side
          </span>
        </div>
      </header>

      <div className="overview-route">
        <span className="route-point">
          <MapPin size={14} aria-hidden="true" /> {query.startPoint}
        </span>
        <ArrowRight size={16} className="route-arrow" aria-hidden="true" />
        <span className="route-point">
          <Navigation size={14} aria-hidden="true" /> {query.endPoint}
        </span>
      </div>

      <main className="overview-grid">
        <section className="map-card card" aria-label="Route map">
          <MapView
            coords={route.coords}
            preferred={preferred}
            startLabel={`Start — ${query.startPoint}`}
            endLabel={`Destination — ${query.endPoint}`}
          />

          <div className="map-side-card" style={{ '--side-color': color }}>
            <p className="map-side-label">Recommended Side</p>
            <p className="map-side-value">
              {key === 'Either' ? 'Either side' : `${key} Side`}
            </p>
            <p className="map-side-note">
              {exposure?.isDark
                ? 'Sun below the horizon for the whole trip'
                : key === 'Either'
                  ? 'Both sides get about the same sun'
                  : `${formatPctSafe(exposure?.left)} on the left · ${formatPctSafe(exposure?.right)} on the right`}
            </p>
          </div>

          <div className="map-legend-card" aria-hidden="true">
            <span className="legend-item">
              <span className="legend-line route" /> Route
            </span>
            <span className="legend-item">
              <span className="legend-line left" /> Left side
            </span>
            <span className="legend-item">
              <span className="legend-line right" /> Right side
            </span>
            <span className="legend-item">
              <span className="legend-dot start">A</span> Start
            </span>
            <span className="legend-item">
              <span className="legend-dot end">B</span> Destination
            </span>
          </div>
        </section>

        <aside className="overview-side">
          <div className="stat-grid">
            <div className="stat-card card">
              <span className="stat-icon" style={{ '--side-color': 'var(--blue)' }}>
                <RouteIcon size={17} aria-hidden="true" />
              </span>
              <p className="stat-label">Total distance</p>
              <p className="stat-value">{formatDistance(exposure?.distanceMeters)}</p>
            </div>

            <div className="stat-card card">
              <span className="stat-icon" style={{ '--side-color': 'var(--accent)' }}>
                <Clock3 size={17} aria-hidden="true" />
              </span>
              <p className="stat-label">Estimated travel time</p>
              <p className="stat-value">{formatDuration(exposure?.durationSeconds)}</p>
            </div>

            <div className="stat-card card">
              <span className="stat-icon" style={{ '--side-color': color }}>
                <Compass size={17} aria-hidden="true" />
              </span>
              <p className="stat-label">Recommended seating side</p>
              <p className="stat-value" style={{ color }}>
                {key === 'Either' ? 'Either side' : `${key} side`}
              </p>
            </div>

            <div className="stat-card card">
              <span className="stat-icon" style={{ '--side-color': 'var(--orange)' }}>
                <CalendarClock size={17} aria-hidden="true" />
              </span>
              <p className="stat-label">Departure time</p>
              <p className="stat-value small">{departure}</p>
            </div>
          </div>

          <button
            type="button"
            className="primary-btn view-details"
            onClick={() => navigate('/details')}
          >
            View Details <ArrowRight size={18} aria-hidden="true" />
          </button>
        </aside>
      </main>
    </div>
  );
}

function formatPctSafe(value) {
  const n = Number(value);
  return `${(Number.isFinite(n) ? n : 0).toFixed(1)}%`;
}
