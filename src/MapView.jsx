import { useEffect, useMemo } from "react";
import L from "leaflet";
import {
  MapContainer,
  TileLayer,
  Polyline,
  Marker,
  Popup,
  useMap,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import { BUCKET_COLORS } from "./Components/Buckets";
import "./MapView.css";

const startIcon = new L.DivIcon({
  className: "custom-marker custom-marker-start",
  html: '<span aria-hidden="true">A</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

const endIcon = new L.DivIcon({
  className: "custom-marker custom-marker-end",
  html: '<span aria-hidden="true">B</span>',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

function ZoomToRoute({ coords }) {
  const map = useMap();
  useEffect(() => {
    if (coords.length > 1) {
      map.fitBounds(coords, { padding: [60, 60] });
    }
  }, [coords, map]);
  return null;
}

// Offset every polyline point ~5m perpendicular to the segment direction so the
// recommended side appears slightly outside the main line. Visually highlights
// the recommended seating direction without needing a routing engine.
function offsetForHighlight(coords, recommendedSide, metres = 6) {
  if (
    !coords ||
    coords.length < 2 ||
    !recommendedSide ||
    recommendedSide === "Either side"
  ) {
    return [];
  }
  const R = 6378137; // earth radius (m)
  const out = [];
  for (let i = 0; i < coords.length; i++) {
    const [lat, lon] = coords[i];
    const prev = coords[Math.max(0, i - 1)];
    const next = coords[Math.min(coords.length - 1, i + 1)];
    const dx = ((next[1] - prev[1]) * Math.PI) / 180;
    const meanLat = ((next[0] + prev[0]) * Math.PI) / 360;
    const bearing = Math.atan2(
      dx * Math.cos(meanLat),
      ((next[0] - prev[0]) * Math.PI) / 180,
    );
    // Perpendicular: +90deg = right, -90deg = left in `forward`.
    const sign = recommendedSide === "Right side" ? 1 : -1;
    const perp = bearing + (sign * Math.PI) / 2;
    const dLat = ((metres / R) * Math.cos(perp) * 180) / Math.PI;
    const dLon =
      ((metres / (R * Math.cos(meanLat))) * Math.sin(perp) * 180) / Math.PI;
    out.push([lat + dLat, lon + dLon]);
  }
  return out;
}

/**
 * The dark route map.
 *
 * `preferred` is the side the sun maths recommends ("Left side" / "Right side"
 * / "Either side"). Both seating sides are drawn as parallel lines beside the
 * route — blue for the left, orange for the right — so the legend on the page
 * always matches what is drawn. The recommended side is drawn solid and bright,
 * the other one dimmed.
 */
export const MapView = ({
  coords = [],
  preferred,
  className = "",
  style,
  startLabel = "Start",
  endLabel = "Destination",
}) => {
  const hasRoute = coords.length > 1;
  const center = hasRoute ? coords[0] : [20.5937, 78.9629]; // fallback: India centroid

  const leftCoords = useMemo(
    () => offsetForHighlight(coords, "Left side"),
    [coords],
  );
  const rightCoords = useMemo(
    () => offsetForHighlight(coords, "Right side"),
    [coords],
  );

  const leftIsPreferred = preferred === "Left side";
  const rightIsPreferred = preferred === "Right side";

  return (
    <MapContainer
      center={center}
      zoom={hasRoute ? 13 : 4}
      className={`mapview ${className}`.trim()}
      style={{ height: "100%", width: "100%", ...style }}
      worldCopyJump
    >
      <TileLayer
        url="https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png"
        attribution='&copy; <a href="https://stadiamaps.com/">Stadia Maps</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />

      {hasRoute && (
        <>
          <Polyline
            positions={coords}
            pathOptions={{ color: "#9be7ff", weight: 5, opacity: 0.9 }}
          />

          {/* Left seating side — blue */}
          {leftCoords.length > 0 && (
            <Polyline
              positions={leftCoords}
              pathOptions={{
                color: BUCKET_COLORS.left,
                weight: leftIsPreferred ? 4 : 2,
                opacity: leftIsPreferred ? 0.95 : 0.28,
                dashArray: leftIsPreferred ? undefined : "6 8",
              }}
            />
          )}

          {/* Right seating side — orange */}
          {rightCoords.length > 0 && (
            <Polyline
              positions={rightCoords}
              pathOptions={{
                color: BUCKET_COLORS.right,
                weight: rightIsPreferred ? 4 : 2,
                opacity: rightIsPreferred ? 0.95 : 0.28,
                dashArray: rightIsPreferred ? undefined : "6 8",
              }}
            />
          )}

          <Marker position={coords[0]} icon={startIcon}>
            <Popup>{startLabel}</Popup>
          </Marker>
          <Marker position={coords[coords.length - 1]} icon={endIcon}>
            <Popup>{endLabel}</Popup>
          </Marker>
        </>
      )}

      <ZoomToRoute coords={coords} />
    </MapContainer>
  );
};
