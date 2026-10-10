import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createQueryClient } from './api/queryClient'
import { AppCrashed } from './components/AppCrashed'
import { ErrorBoundary } from './components/ErrorBoundary'
import { canonicalizeUrl } from './url/useView'
import './styles/tokens.css'
import './styles/global.css'

// Before the first render (and outside StrictMode's double-invoked effects), so the
// address bar shows the canonical URL for whatever view the user opened.
canonicalizeUrl()

const container = document.getElementById('root')
if (!container) throw new Error('index.html is missing the #root element')

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={createQueryClient()}>
      <ErrorBoundary fallback={AppCrashed}>
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)
