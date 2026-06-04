import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';
import { applyTheme } from './utils/theme';

// Theme so früh wie möglich anwenden (#93), damit es kein helles Aufblitzen
// vor dem ersten Render gibt.
applyTheme();

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

reportWebVitals();