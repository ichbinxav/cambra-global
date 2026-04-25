import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

const rootEl = document.getElementById('root');
// Remove static prerender once React is ready
const toRemove = rootEl && (rootEl.querySelector('#prerender-landing') || rootEl.querySelector('#prerender-hero'));
if (toRemove) {
  setTimeout(() => toRemove.remove(), 0);
}
ReactDOM.createRoot(rootEl).render(<App />)