import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { DeckTrackerOverlayView } from './components/deck_tracker/DeckTrackerOverlayView'
import './index.css'
import 'mana-font/css/mana.css'
import './assets/keyrune/keyrune.css'

const isDeckTrackerOverlay =
  window.location.hash.includes('overlay/deck-tracker') ||
  window.location.pathname.includes('overlay/deck-tracker');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isDeckTrackerOverlay ? <DeckTrackerOverlayView /> : <App />}
  </React.StrictMode>,
)
