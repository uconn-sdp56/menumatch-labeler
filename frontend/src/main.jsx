import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ApiTokenProvider } from './components/ApiTokenProvider.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <ApiTokenProvider>
        <App />
      </ApiTokenProvider>
    </BrowserRouter>
  </StrictMode>,
)
