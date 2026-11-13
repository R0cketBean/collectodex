import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { applyTheme } from './utils/theme';
import { installErrorReporting } from './utils/errorReporting';

// Fehler ab dem ersten Moment ins Protokoll der App schreiben (#136).
installErrorReporting();

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
