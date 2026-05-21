import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import { setupPwaUpdater } from './lib/pwaUpdater';
import { initializeTheme } from './lib/theme';

initializeTheme();

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

setupPwaUpdater();
