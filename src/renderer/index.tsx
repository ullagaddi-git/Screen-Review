import React from 'react'
import ReactDOM from 'react-dom/client'
import './styles/tailwind.css'
import './styles/globals.css'
import { Settings } from './windows/settings/Settings'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <Settings />
  </React.StrictMode>
)
