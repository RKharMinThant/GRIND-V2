import { lazy, StrictMode, Suspense } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
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

/** Pretty invite URL: /invite/:code → /app?invite=:code */
function InviteRedirect() {
  const { code } = useParams<{ code: string }>()
  return <Navigate to={`/app?invite=${code ?? ''}`} replace />
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <DocumentMeta />
      <Routes>
        <Route path="/" element={<MarketingPage />} />
        <Route path="/invite/:code" element={<InviteRedirect />} />
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
