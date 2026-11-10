import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './styles/index.css'
import App from './app/App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {import.meta.env.VITE_GITHUB_PAGES === 'true'
      ? <HashRouter><App /></HashRouter>
      : <BrowserRouter><App /></BrowserRouter>}
  </StrictMode>,
)
