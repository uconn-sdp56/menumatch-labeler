import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import ApiTokenModal from './components/ApiTokenModal.jsx'
import DatasetPage from './pages/DatasetPage.jsx'
import SampleDetailPage from './pages/SampleDetailPage.jsx'
import UploadPage from './pages/UploadPage.jsx'

const navLinks = [
  { to: '/', label: 'Upload' },
  { to: '/dataset', label: 'Dataset' },
]

function App() {
  return (
    <div className="min-h-screen bg-slate-50">
      <ApiTokenModal />
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <span className="text-lg font-semibold text-slate-900">
            MenuMatch Labeler
          </span>

          <nav className="flex items-center gap-2 text-sm font-medium">
            {navLinks.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                className={({ isActive }) =>
                  [
                    'rounded-md px-3 py-2 transition-colors',
                    isActive
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                  ].join(' ')
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <Routes>
          <Route index element={<UploadPage />} />
          <Route path="/dataset/:objectKey" element={<SampleDetailPage />} />
          <Route path="/dataset" element={<DatasetPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

export default App
