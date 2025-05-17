import React from 'react'
import SunCalc from 'suncalc';

export const getBearing=(lat1,long1,lat2,long2)=>{
    const toRad=deg=>deg*Math.PI/180;
    const y= Math.sin(toRad(long2-long1))*Math.cos(toRad(lat2));
    const x=Math.cos(toRad(lat1))*Math.sin(toRad(lat2))-
    Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(long2-long1));
    const brng=Math.atan2(y,x);
    return (brng*180/Math.PI+360)%360;
};
export const getSunExposure=(coords,time)=>{
    let left=0;let right=0;let none=0;
    for (let i = 0; i < coords.length - 1; i++) {
        const [lat1, long1] = coords[i];
        const [lat2, long2] =coords[i + 1];

   const date=new Date(time)
   const bearing=getBearing(lat1,long1,lat2,long2);
   const sunPosition=SunCalc.getPosition(date,lat1,long1);
   const azimuth=(sunPosition.azimuth*180/Math.PI+360)%360;
   const diffrence=(azimuth-bearing+360)%360;
    
   if(diffrence>=45&&diffrence<=135)
   right++;
else if(diffrence>=225&&diffrence<=315)
    left++;
else 
none++;
    };
 const total=left+right+none;   
 return{
    left:(left/total)*100,
    right:(right/total)*100,
    none:(none/total)*100
 };
};

