import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { DocumentMeta } from './components/DocumentMeta'
import { MarketingPage } from './marketing/MarketingPage'
import './styles/global.css'

/** Lazy-load the journal so `/` LCP is not blocked by the app bundle. */
const App = lazy(() => import('./App'))

function AppFallback() {
  return (
    <div className="boot-screen" role="status" aria-label="Loading GRIND">
      <div className="logo" style={{ fontSize: '1.4rem' }}>
        GRIND<span>.</span>
      </div>
      <div className="spinner" />
    </div>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DocumentMeta />
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route
          path="/app/*"
          element={
            <Suspense fallback={<AppFallback />}>
              <App />
            </Suspense>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>,
)
