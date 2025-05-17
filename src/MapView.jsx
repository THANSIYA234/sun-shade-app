import React from 'react';
import { MapContainer, TileLayer, Polyline } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import { useEffect } from 'react';



export const MapView = ({coords}) => {

const center=coords.length>0 ? coords[0]:[15.0, 65.0];
const ZoomToRoute = ({ coords }) => {
  const map = useMap();

  useEffect(() => {
    if (coords.length > 0) {
      map.fitBounds(coords);
    }
  }, [coords, map]);

  return null;
};



  return (
<MapContainer center={center} zoom={6}style={{height:'100vh',width:'100vw',position:'absolute',top:'0',left:'0',zIndex:0}}>
    <TileLayer
    url='https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'
	minZoom={0}
	maxZoom={20}
	attribution='&copy; <a href="https://www.stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'/>
   {coords.length>0 && <Polyline positions={coords}color="cyan"/>}
   <ZoomToRoute coords={coords} />
</MapContainer>


    
  )
}
