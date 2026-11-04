import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarClock,
  Clock3,
  Compass,
  Info,
  MapPin,
  Navigation,
  RefreshCw,
  Route as RouteIcon,
  Sunrise,
  Sunset,
  TreePine,
} from 'lucide-react';
import Result from '../Components/Result';
import SunDiagram from '../Components/SunDiagram';
import SunPathChart from '../Components/SunPathChart';
import { useTrip } from '../state/useTrip';
import { getBearing, getSunPath, getSunPosition } from '../Components/SunCalc';
import { explainRecommendation, sunnierSide } from '../lib/exposure';
import {
  compassPoint,
  formatClock,
  formatDateTime,
  formatDistance,
  formatDuration,
  formatPct,
  sideKey,
} from '../lib/format';
import './TripDetails.css';

const SIDE_COLORS = {
  Left: 'var(--blue)',
  Right: 'var(--orange)',
  Either: 'var(--accent)',
};

export default function TripDetails() {
  const { trip, reset } = useTrip();
  const navigate = useNavigate();

  const { route, exposure, sunTimes, query } = trip;

  const sunAtDeparture = useMemo(
    () => getSunPosition(route.coords, new Date(query.time), 0),
    [route.coords, query.time],
  );

  const heading = useMemo(() => {
    if (route.coords.length < 2) return 0;
    const [a, b] = route.coords;
    return getBearing(a[0], a[1], b[0], b[1]);
  }, [route.coords]);

  const sunPath = useMemo(
    () => getSunPath(route.coords, new Date(query.time), exposure?.durationSeconds ?? 0, 12, 15),
    [route.coords, query.time, exposure?.durationSeconds],
  );

  const preferred = exposure?.preferred ?? 'Either side';
  const key = sideKey(preferred);
  const color = SIDE_COLORS[key];
  const sunnier = sunnierSide(exposure);

  const lateral = sunAtDeparture
    ? ((sunAtDeparture.azimuthDeg - heading + 540) % 360) - 180
    : 0;

  const handlePlanAnother = () => {
    reset();
    navigate('/');
  };

  return (
    <div className="page details">
      <header className="topnav">
        <button
          type="button"
          className="brand"
          onClick={() => navigate('/')}
          aria-label="Sit In Shade — back to trip planner"
        >
          <span className="brand-mark" aria-hidden="true">
            <Compass size={17} />
          </span>
          <span className="brand-name">Sit In Shade</span>
        </button>

        <div className="topnav-title">
          <button type="button" className="back-btn" onClick={() => navigate('/route')}>
            <ArrowLeft size={16} aria-hidden="true" /> Back to Route Overview
          </button>
          <h1>Sun &amp; Seating Analysis</h1>
        </div>
      </header>

      <main className="details-wrap">
        {/* ---------- Section 1 · Sun position ---------- */}
        <section className="details-section" aria-labelledby="sec-sun">
          <div className="section-head">
            <h2 id="sec-sun">Sun position</h2>
            <p>Where the sun actually was at departure, and how it moved while you drove.</p>
          </div>

          <div className="sun-grid">
            <div className="card sun-card">
              <div className="sun-metrics">
                <Metric
                  icon={Sunrise}
                  label="Sun altitude"
                  value={
                    sunAtDeparture
                      ? `${sunAtDeparture.altitudeDeg.toFixed(1)}°`
                      : '—'
                  }
                  note={
                    sunAtDeparture
                      ? sunAtDeparture.altitudeDeg > 0
                        ? 'Above the horizon'
                        : 'Below the horizon'
                      : ''
                  }
                />
                <Metric
                  icon={Compass}
                  label="Sun azimuth"
                  value={
                    sunAtDeparture
                      ? `${sunAtDeparture.azimuthDeg.toFixed(0)}° ${compassPoint(sunAtDeparture.azimuthDeg)}`
                      : '—'
                  }
                  note="Clockwise from north"
                />
                <Metric
                  icon={Navigation}
                  label="Travel heading"
                  value={`${heading.toFixed(0)}° ${compassPoint(heading)}`}
                  note="Along the route"
                />
                <Metric
                  icon={Sunset}
                  label="Sun off to the side"
                  value={`${Math.abs(lateral).toFixed(0)}°`}
                  note={
                    Math.abs(lateral) <= 45
                      ? 'Ahead of the vehicle'
                      : lateral > 0
                        ? 'Towards the right'
                        : 'Towards the left'
                  }
                />
              </div>

              <div className="sun-times">
                <TimeChip icon={Sunrise} label="Sunrise" value={formatClock(sunTimes?.sunrise)} />
                <TimeChip icon={Sunset} label="Sunset" value={formatClock(sunTimes?.sunset)} />
                <TimeChip icon={Clock3} label="Solar noon" value={formatClock(sunTimes?.solarNoon)} />
                <TimeChip icon={CalendarClock} label="Departure" value={formatClock(query.time)} />
              </div>
              <p className="card-hint">Clock times are shown in {timeZoneLabel()}.</p>
            </div>

            <div className="card diagram-card">
              <p className="card-label">Vehicle, route &amp; sun</p>
              <SunDiagram
                headingDeg={heading}
                azimuthDeg={sunAtDeparture?.azimuthDeg ?? 0}
                altitudeDeg={sunAtDeparture?.altitudeDeg ?? 0}
                preferred={preferred}
              />
              <ul className="diagram-legend">
                <li><span className="swatch left" /> Left seat</li>
                <li><span className="swatch right" /> Right seat</li>
                <li><span className="swatch sun" /> Sun</li>
                <li><span className="swatch heading" /> Heading</li>
              </ul>
            </div>

            <div className="card chart-card">
              <p className="card-label">Sun path across the trip</p>
              <SunPathChart path={sunPath} />
              <p className="card-hint">
                Altitude is sampled every few minutes along the route, at the place the
                vehicle actually is.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Section 2 · Preferred seating side ---------- */}
        <section className="details-section" aria-labelledby="sec-side">
          <div className="section-head">
            <h2 id="sec-side">Preferred seating side</h2>
            <p>The side the sun maths recommends for this route and departure time.</p>
          </div>

          <div className="side-card card" style={{ '--side-color': color }}>
            <div className="side-main">
              <p className="side-label">Recommended side</p>
              <p className="side-value">
                {key === 'Either' ? 'Either side works' : `${key} side`}
              </p>
              <p className="side-why">{explainRecommendation(exposure)}</p>
            </div>

            <div className="side-stats">
              <div className="side-stat">
                <span className="side-stat-label">
                  <span className="swatch left" /> Sun on the left
                </span>
                <strong>{formatPct(exposure?.left)}</strong>
              </div>
              <div className="side-stat">
                <span className="side-stat-label">
                  <span className="swatch right" /> Sun on the right
                </span>
                <strong>{formatPct(exposure?.right)}</strong>
              </div>
              <div className="side-stat">
                <span className="side-stat-label">
                  <Sunset size={14} aria-hidden="true" /> Slower side
                </span>
                <strong>{sunnier.side}</strong>
              </div>
              <div className="side-stat">
                <span className="side-stat-label">
                  <Sunset size={14} aria-hidden="true" /> Sun below horizon
                </span>
                <strong>{formatPct(exposure?.dark)}</strong>
              </div>
            </div>

            <p className="side-alternative">
              {key === 'Either' ? (
                <>Both sides are equally comfortable for this trip — either works.</>
              ) : (
                <>
                  The alternative, the {key === 'Left' ? 'right' : 'left'} side, carries{' '}
                  <strong>{formatPct(sunnier.pct)}</strong> of the route&apos;s sunlight.
                </>
              )}
            </p>
          </div>
        </section>

        {/* ---------- Section 3 · Route shade insights ---------- */}
        <section className="details-section" aria-labelledby="sec-insights">
          <div className="section-head">
            <h2 id="sec-insights">Route shade insights</h2>
            <p>How the sun is distributed across the route, measured by distance.</p>
          </div>

          <div className="insights-grid">
            <div className="card insights-card">
              <Result results={exposure} />
            </div>

            <div className="card notes-card">
              <p className="card-label">
                <TreePine size={15} aria-hidden="true" /> About shade
              </p>
              <ul className="notes-list">
                <li>
                  <strong>Sun direction is modelled, shadows are not.</strong> Buildings,
                  trees and terrain are not part of the calculation, so a tree-lined
                  street still reads as full sun.
                </li>
                <li>
                  <strong>Percentages are weighted by distance.</strong> Every share is the
                  metres of road in that bucket over the total route length, so the five
                  numbers always add up to 100%.
                </li>
                <li>
                  <strong>The sun moves while you drive.</strong> Each point of the route
                  is sampled at the moment you reach it, using the real trip duration.
                </li>
              </ul>
              <p className="notes-footnote">
                <Info size={14} aria-hidden="true" />
                No shadow or obstruction data is available for the route, so no shaded-route
                percentage is shown.
              </p>
            </div>
          </div>
        </section>

        {/* ---------- Section 4 · Trip summary ---------- */}
        <section className="details-section" aria-labelledby="sec-summary">
          <div className="section-head">
            <h2 id="sec-summary">Trip summary</h2>
          </div>

          <div className="summary-card card">
            <dl className="summary-list">
              <SummaryRow icon={MapPin} label="Starting point" value={query.startPoint} />
              <SummaryRow icon={Navigation} label="Destination" value={query.endPoint} />
              <SummaryRow
                icon={CalendarClock}
                label="Departure"
                value={formatDateTime(query.time)}
              />
              <SummaryRow
                icon={RouteIcon}
                label="Distance"
                value={formatDistance(exposure?.distanceMeters)}
              />
              <SummaryRow
                icon={Clock3}
                label="Duration"
                value={formatDuration(exposure?.durationSeconds)}
              />
              <SummaryRow
                icon={Compass}
                label="Recommended side"
                value={key === 'Either' ? 'Either side' : `${key} side`}
                accent={color}
              />
            </dl>

            <div className="summary-actions">
              <button
                type="button"
                className="primary-btn"
                onClick={() => navigate('/route')}
              >
                <ArrowLeft size={17} aria-hidden="true" /> Back to Route Overview
              </button>
              <button type="button" className="ghost-btn" onClick={handlePlanAnother}>
                <RefreshCw size={16} aria-hidden="true" /> Plan Another Trip
              </button>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

/** The viewer's timezone — the departure time is entered in local time. */
function timeZoneLabel() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'your local time';
  } catch {
    return 'your local time';
  }
}

function Metric({ icon: Icon, label, value, note }) {
  return (
    <div className="metric">
      <span className="metric-icon">
        <Icon size={16} aria-hidden="true" />
      </span>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {note && <p className="metric-note">{note}</p>}
    </div>
  );
}

function TimeChip({ icon: Icon, label, value }) {
  return (
    <span className="time-chip">
      <Icon size={14} aria-hidden="true" />
      <span className="time-chip-label">{label}</span>
      <strong>{value || '—'}</strong>
    </span>
  );
}

function SummaryRow({ icon: Icon, label, value, accent }) {
  return (
    <div className="summary-row">
      <dt>
        <Icon size={15} aria-hidden="true" /> {label}
      </dt>
      <dd style={accent ? { color: accent } : undefined}>{value}</dd>
    </div>
  );
}
