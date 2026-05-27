import React from 'react'
import ReactDOM from 'react-dom/client'
import '../../styles/tailwind.css'
import '../../styles/globals.css'
import './live-transcript-styles.css'
import { LiveTranscriptPanel } from './LiveTranscriptPanel'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <LiveTranscriptPanel />
  </React.StrictMode>
)
