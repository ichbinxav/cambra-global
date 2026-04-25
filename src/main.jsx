import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const rootEl = document.getElementById('root');
// Remove static fallback once React is ready
const prerender = rootEl && rootEl.querySelector('#prerender-hero');
if (prerender) {
  // Defer removal to next tick so crawlers can still read it if JS barely starts
  setTimeout(() => prerender.remove(), 0);
}
ReactDOM.createRoot(rootEl).render(<App />)