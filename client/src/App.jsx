import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UpdateNotification from './components/UpdateNotification';

function App() {
  return (
    <Router>
      <UpdateNotification />
      
      <div className="app-container">
        <Routes>
        </Routes>
      </div>
    </Router>
  );
}

export default App; 