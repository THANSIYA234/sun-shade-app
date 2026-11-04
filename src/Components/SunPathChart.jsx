import './SunPathChart.css';

const W = 560;
const H = 210;
const PAD = { top: 18, right: 18, bottom: 30, left: 44 };

/**
 * Altitude of the sun across the trip window.
 * `path` comes from getSunPath() in src/Components/SunCalc.js.
 */
export default function SunPathChart({ path = [] }) {
  if (!path.length) {
    return (
      <p className="spc-empty">No sun path could be computed for this trip.</p>
    );
  }

  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const altitudes = path.map((p) => p.altitudeDeg);
  const maxAlt = Math.max(10, ...altitudes);
  const minAlt = Math.min(-10, ...altitudes);

  const x = (progress) => PAD.left + progress * innerW;
  const y = (altitude) =>
    PAD.top + ((maxAlt - altitude) / (maxAlt - minAlt)) * innerH;

  const line = path.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.progress).toFixed(1)} ${y(p.altitudeDeg).toFixed(1)}`).join(' ');
  const horizonY = y(0);

  const areaAbove = `${line} L ${x(1).toFixed(1)} ${horizonY.toFixed(1)} L ${x(0).toFixed(1)} ${horizonY.toFixed(1)} Z`;
  const areaBelow = `${line} L ${x(1).toFixed(1)} ${y(minAlt).toFixed(1)} L ${x(0).toFixed(1)} ${y(minAlt).toFixed(1)} Z`;

  const first = path[0];
  const last = path[path.length - 1];

  const timeLabel = (date) =>
    date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <svg
      className="sun-path-chart"
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="Sun altitude across the trip"
    >
      <defs>
        <linearGradient id="aboveHorizon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FF851B" stopOpacity="0.42" />
          <stop offset="100%" stopColor="#FF851B" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="belowHorizon" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#38A8FF" stopOpacity="0.16" />
          <stop offset="100%" stopColor="#38A8FF" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      <rect
        x={PAD.left}
        y={PAD.top}
        width={innerW}
        height={horizonY - PAD.top}
        fill="url(#aboveHorizon)"
      />
      <rect
        x={PAD.left}
        y={horizonY}
        width={innerW}
        height={y(minAlt) - horizonY}
        fill="url(#belowHorizon)"
      />

      <line
        x1={PAD.left}
        y1={horizonY}
        x2={PAD.left + innerW}
        y2={horizonY}
        className="spc-horizon"
      />
      <text x={PAD.left - 8} y={horizonY + 4} className="spc-axis-label" textAnchor="end">
        0°
      </text>
      <text x={PAD.left - 8} y={y(maxAlt) + 4} className="spc-axis-label" textAnchor="end">
        {Math.round(maxAlt)}°
      </text>
      <text x={PAD.left - 8} y={y(minAlt) + 4} className="spc-axis-label" textAnchor="end">
        {Math.round(minAlt)}°
      </text>

      <path d={areaAbove} className="spc-area spc-area-above" />
      <path d={areaBelow} className="spc-area spc-area-below" />
      <path d={line} className="spc-line" />

      <circle cx={x(first.progress)} cy={y(first.altitudeDeg)} r="4" className="spc-dot" />
      <circle cx={x(last.progress)} cy={y(last.altitudeDeg)} r="4" className="spc-dot" />

      <text x={x(first.progress)} y={H - 8} className="spc-time" textAnchor="start">
        {timeLabel(first.date)}
      </text>
      <text x={x(last.progress)} y={H - 8} className="spc-time" textAnchor="end">
        {timeLabel(last.date)}
      </text>
    </svg>
  );
}
