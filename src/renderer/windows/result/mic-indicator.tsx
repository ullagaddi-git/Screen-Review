import React from 'react'
import ReactDOM from 'react-dom/client'
import '../../styles/tailwind.css'
import '../../styles/globals.css'
import './mic-indicator-styles.css'
import { MicIndicator } from './MicIndicator'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <MicIndicator />
  </React.StrictMode>
)
