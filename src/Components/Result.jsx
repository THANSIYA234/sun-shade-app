import React from 'react'
import './Result.css';

const Result=({ results,onBack}) =>{
    if (!results) {
        return <div>No results yet</div>;
      }
  return (
    <div className='result'>
      <div>Preferred:  <span style={{ color: 'red',fontSize:'25px' }}>{results.preferred}</span> </div>
         <ul>
        <li id='left'>Sun Left: {results.left.toFixed(2)}%</li>
        <li id='right'>Sun Right: {results.right.toFixed(2)}%</li>
        <li id='none'>No Sun: {results.none.toFixed(2)}%</li>
      </ul>
      <button onClick={onBack}>Edit Search</button>
      <button onClick={onBack}>New Location</button>
    </div>
  )
}

export default Result