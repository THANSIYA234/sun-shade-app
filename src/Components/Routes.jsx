const API_KEY=import.meta.env.VITE_OPENROUTESERVICE_API_KEY;



export const geocode=async(location)=>{
  const res=await fetch( `https://api.openrouteservice.org/geocode/search?api_key=${API_KEY}&text=${encodeURIComponent(location)}`)
  const data=await res.json();
  return  data.features[0].geometry.coordinates;
  
}




export async function getRoutes(startPoint, endPoint) {
  
    const startCoords = await geocode(startPoint);
    const endCoords = await geocode(endPoint);
    console.log("Start Coords:", startCoords);
    console.log("End Coords:", endCoords);
   
    const response = await fetch(`https://api.openrouteservice.org/v2/directions/driving-car/geojson`
, {
      method: 'POST',
      headers: {
        'Authorization': API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [startCoords, endCoords],
      }),
    });

   

    const data = await response.json();

   

    const coords = data.features[0].geometry.coordinates.map(([long, lat]) => [lat, long]);

    return coords;
  
};
