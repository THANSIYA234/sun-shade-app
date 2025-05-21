import React, { useState } from 'react';
import Input from './Components/Input';
import { getRoutes } from './Components/Routes';
import { getSunExposure } from './Components/SunCalc';
import Result from './Components/Result';



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
    <div style={{ position: 'relative', height: '100vh', width: '100vw' }}>
     <MapView coords={coords}/>
<div className='input-div' style={{
          position: 'absolute',
          top: 0,
          left: 0,
          zIndex: 1000,
          padding: '1rem',
          width: '100%',
        }}>
{!results&&<Input onSubmit={HandleCords}/>}
{results&&<Result results={results} onBack={HandleSubmit}/>}
</div>
     
    </div>
  )
}

export default App