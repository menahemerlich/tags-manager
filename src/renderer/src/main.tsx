import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

/** נקודת כניסה ל־React — רינדור האפליקציה ל־#root */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
