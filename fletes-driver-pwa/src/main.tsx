import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import 'maplibre-gl/dist/maplibre-gl.css';
import './index.css';
import { setupPwaUpdater } from './lib/pwaUpdater';

document.documentElement.classList.add('dark');
document.documentElement.style.colorScheme = 'dark';

const themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
if (themeColor) {
  themeColor.content = '#020617';
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);

setupPwaUpdater();
