import React, { useEffect } from 'react';
import { MapContainer, TileLayer, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const ZoomToRoute = ({ coords }) => {
  const map = useMap();

  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(coords);
    }
  }, [coords, map]);

  return null;
};

export const MapView = ({ coords }) => {
  const center = coords.length > 0 ? coords[0] : [20.5937, 78.9629];

  return (
    <MapContainer center={center} zoom={13} style={{ height: '100vh', width: '100%' }}>
     <TileLayer
  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
  attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors'
/>


      {coords.length > 0 && <Polyline positions={coords} color="cyan" />}
      <ZoomToRoute coords={coords} />
    </MapContainer>
  );
};
