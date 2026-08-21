// build: 20260626-force
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import { preloadInitialLanguage } from '@/lib/i18n.jsx'
import '@/index.css'

const rootEl = document.getElementById('root');

async function bootstrap() {
  // Resolve only the selected locale chunk before React mounts. Any static
  // prerender remains visible during this request instead of being removed and
  // replaced by a blank or wrong-language first frame.
  const initialLanguageState = await preloadInitialLanguage();
  ReactDOM.createRoot(rootEl).render(<App initialLanguageState={initialLanguageState} />);

  // Legacy Base44 snapshots can still contain one of these nodes. React usually
  // replaces it during the initial commit; the deferred cleanup is idempotent.
  const toRemove = rootEl && (rootEl.querySelector('#prerender-landing') || rootEl.querySelector('#prerender-hero'));
  if (toRemove) setTimeout(() => toRemove.remove(), 0);
}

void bootstrap();
