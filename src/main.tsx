import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// The API is optional so the renderer can also run in a regular browser during development.
window.electronApi?.onAppReady((timestamp) => {
  console.log(`Electron renderer ready at ${timestamp}`)
})
