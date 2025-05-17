import React, { useState } from 'react';
import './Input.css';

function Input({onSubmit}) {
const [startPoint,setStartPoint]=useState('');
const [endPoint,setEndPoint]=useState('');
const[time,setTime]=useState('');

const HandleSubmit=(e)=>{
  e.preventDefault();
  onSubmit(startPoint,endPoint,time);
}



  return (
   <div className='container'>
    <h1>Sit In Shade</h1>
    <h4>Find Best Seat to Minimize Sun Exposure While Traveling</h4>
    <form className='form-container' onSubmit={HandleSubmit}>
       <div className='starting-input' >
        <input type='text' placeholder='Enter Starting Point' id='start-point' value={startPoint} onChange={(e)=>{setStartPoint(e.target.value)}}/></div> 
       <div className='ending-point'>
        <input type='text'placeholder='Enter Destination' id='end-point'value={endPoint} onChange={(e)=>{setEndPoint(e.target.value)}}/>
       </div>
       <div><input type='datetime-local' id="time"value={time} onChange={(e)=>{setTime(e.target.value)}} style={{color:'grey'}}/></div>
       
        
        <button type='submit' id='submit-btn'>Submit</button>
      


    </form>
   </div>
  )
}

export default Input