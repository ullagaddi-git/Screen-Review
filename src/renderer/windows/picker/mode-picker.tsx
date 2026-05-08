import React from 'react'
import ReactDOM from 'react-dom/client'
import '../../styles/tailwind.css'
import '../../styles/globals.css'
import './mode-picker-styles.css'
import { ModePicker } from './ModePicker'

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ModePicker />
  </React.StrictMode>
)
