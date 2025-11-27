import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'
import { ApiTokenProvider } from './components/ApiTokenProvider.jsx'

const params = new URLSearchParams(window.location.search)
const redirectPath = params.get('redirect')
if (redirectPath) {
  params.delete('redirect')
  const base = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')
  const normalized =
    redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`
  const newUrl = `${base}${normalized}${
    params.toString() ? `?${params.toString()}` : ''
  }`
  window.history.replaceState(null, '', newUrl)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <ApiTokenProvider>
        <App />
      </ApiTokenProvider>
    </BrowserRouter>
  </StrictMode>,
)
