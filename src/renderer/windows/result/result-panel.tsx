import React from 'react'
import ReactDOM from 'react-dom/client'
import '../../styles/tailwind.css'
import '../../styles/globals.css'
import './result-panel-styles.css'
import { ResultPanel } from './ResultPanel'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ResultPanel />
  </React.StrictMode>
)
