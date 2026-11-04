import { classifyLateral } from './SunCalc';
import './SunDiagram.css';

const CX = 170;
const CY = 168;
const R = 132;

/** Point on a compass circle. `deg` is clockwise from north. */
function polar(radius, deg) {
  const rad = (deg * Math.PI) / 180;
  return [CX + radius * Math.sin(rad), CY - radius * Math.cos(rad)];
}

/** Arc path between two compass angles at a given radius. */
function arcPath(radius, fromDeg, toDeg) {
  const [x1, y1] = polar(radius, fromDeg);
  const [x2, y2] = polar(radius, toDeg);
  let delta = toDeg - fromDeg;
  while (delta > 180) delta -= 360;
  while (delta < -180) delta += 360;
  const largeArc = Math.abs(delta) > 180 ? 1 : 0;
  const sweep = delta >= 0 ? 1 : 0;
  return `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} ${sweep} ${x2} ${y2}`;
}

const COMPASS = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

/**
 * Top-down diagram of the vehicle, the direction of travel and the sun.
 *
 * headingDeg — travel bearing, clockwise from north.
 * azimuthDeg — sun azimuth, clockwise from north (same convention).
 * altitudeDeg — sun height above the horizon; negative means night.
 */
export default function SunDiagram({
  headingDeg = 0,
  azimuthDeg = 0,
  altitudeDeg = 0,
  preferred = 'Either side',
}) {
  const isDark = altitudeDeg <= 0;
  const lateral = ((azimuthDeg - headingDeg + 540) % 360) - 180;
  const bucket = classifyLateral(lateral);
  const sunSide = bucket === 'left' ? 'left' : bucket === 'right' ? 'right' : bucket;

  const [sunX, sunY] = polar(R - 26, azimuthDeg);
  const [headX, headY] = polar(R - 26, headingDeg);
  const [arcX, arcY] = polar(R - 52, azimuthDeg);

  const recommendLeft = preferred === 'Left side';
  const recommendRight = preferred === 'Right side';

  return (
    <svg
      className={`sun-diagram${isDark ? ' is-dark' : ''}`}
      viewBox="0 0 340 340"
      role="img"
      aria-label={`Travel heading ${Math.round(headingDeg)} degrees, sun azimuth ${Math.round(azimuthDeg)} degrees, sun altitude ${Math.round(altitudeDeg)} degrees`}
    >
      <defs>
        <radialGradient id="sunGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFD27A" stopOpacity="0.95" />
          <stop offset="55%" stopColor="#FF851B" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#FF851B" stopOpacity="0" />
        </radialGradient>
        <marker
          id="arrowHead"
          viewBox="0 0 10 10"
          refX="8"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#FFC46B" />
        </marker>
      </defs>

      {/* Compass ring */}
      <circle cx={CX} cy={CY} r={R} className="sd-ring" />
      <circle cx={CX} cy={CY} r={R - 34} className="sd-ring sd-ring-inner" />
      {COMPASS.map(({ deg, label }) => {
        const [x1, y1] = polar(R, deg);
        const [x2, y2] = polar(R - 9, deg);
        const [lx, ly] = polar(R - 22, deg);
        return (
          <g key={label}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} className="sd-tick" />
            <text x={lx} y={ly} className="sd-compass-label" textAnchor="middle" dy="4">
              {label}
            </text>
          </g>
        );
      })}

      {/* Lateral angle between heading and sun */}
      {!isDark && (
        <path d={arcPath(R - 52, headingDeg, azimuthDeg)} className="sd-arc" />
      )}

      {/* Heading ray */}
      <line
        x1={CX}
        y1={CY}
        x2={headX}
        y2={headY}
        className="sd-heading"
        markerEnd="url(#arrowHead)"
      />

      {/* Sun ray */}
      {!isDark && (
        <>
          <circle cx={sunX} cy={sunY} r="26" fill="url(#sunGlow)" />
          <circle cx={sunX} cy={sunY} r="11" className="sd-sun" />
          <line x1={CX} y1={CY} x2={sunX} y2={sunY} className="sd-sunray" />
        </>
      )}

      {/* Vehicle, pointing along the heading */}
      <g transform={`translate(${CX} ${CY}) rotate(${headingDeg})`}>
        <rect x="-17" y="-31" width="34" height="62" rx="12" className="sd-car" />
        <rect x="-13" y="-27" width="26" height="14" rx="6" className="sd-glass" />

        {/* Left seat (blue) and right seat (orange) */}
        <rect
          x="-13"
          y="-6"
          width="10"
          height="17"
          rx="4"
          className={`sd-seat sd-seat-left${recommendLeft ? ' is-recommended' : ''}`}
        />
        <rect
          x="3"
          y="-6"
          width="10"
          height="17"
          rx="4"
          className={`sd-seat sd-seat-right${recommendRight ? ' is-recommended' : ''}`}
        />

        {/* Front indicator */}
        <path d="M -6 30 L 6 30 L 0 37 Z" className="sd-front" />
      </g>

      {/* Labels */}
      <text x={CX} y={CY + 3} className="sd-centre-dot" textAnchor="middle" dy="4">
        •
      </text>
      {!isDark && (
        <text x={arcX} y={arcY} className="sd-angle-label" textAnchor="middle" dy="-6">
          {Math.round(Math.abs(lateral))}°
        </text>
      )}
      <text x={CX} y={322} className="sd-caption" textAnchor="middle">
        {isDark
          ? 'Sun below the horizon'
          : sunSide === 'front'
            ? 'Sun ahead — windshield'
            : sunSide === 'back'
              ? 'Sun behind — rear window'
              : `Sun on the ${sunSide}`}
      </text>
    </svg>
  );
}
