import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { startSegmented } from './utils/segmented.js';

// Gleitende Pille für alle Segmented Controls (Mods, Shader, Store Tabs etc.) starten
startSegmented();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
