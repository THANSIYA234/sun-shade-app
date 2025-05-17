const API_KEY=`5b3ce3597851110001cf6248d04fb060e9034aee843333fe2fedcf79`



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

   

    const coords = data.features[0].geometry.coordinates.map(coord => coord.reverse());
    return coords;
  
};
