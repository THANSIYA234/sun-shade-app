import React, { useState } from 'react';
import Input from './Components/Input';
import { getRoutes } from './Components/Routes';
import { getSunExposure } from './Components/SunCalc';
import Result from './Components/Result';
import 'leaflet/dist/leaflet.css';


import { MapView } from './MapView';
const App=()=> {

  const[results,setResults]=useState(null);
  const[coords,setCoords]=useState([]);
 

  const HandleCords=async(startPoint,endPoint,time)=>{
    
    const coords = await getRoutes(startPoint,endPoint);
    if (!coords) {
      alert("No route found. Try a different location.");
      return;
    }
    
    
    setCoords(coords);
    const expossureStats=  getSunExposure(coords,time);
    const preferred=expossureStats.left<expossureStats.right ? 'Right side' : 'Left side';
    
    setResults({preferred, ...expossureStats});
    
   
  }
  const HandleSubmit=()=>{
    setResults(null);
    setCoords([]);
  };
  return (
    <div>
     <MapView coords={coords}/>
<div className='input-div'>
{!results&&<Input onSubmit={HandleCords}/>}
{results&&<Result results={results} onBack={HandleSubmit}/>}
</div>
     
    </div>
  )
}

export default App