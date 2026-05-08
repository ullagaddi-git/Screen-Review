import React from 'react'
import ReactDOM from 'react-dom/client'
import '../../styles/tailwind.css'
import '../../styles/globals.css'
import './region-overlay-styles.css'
import { RegionOverlay } from './RegionOverlay'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <RegionOverlay />
  </React.StrictMode>
)
