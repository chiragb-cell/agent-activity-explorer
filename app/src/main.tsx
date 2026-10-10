import { QueryClientProvider } from '@tanstack/react-query'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { createQueryClient } from './api/queryClient'
import { Button } from './components/Button'
import { ErrorBoundary } from './components/ErrorBoundary'
import { StateMessage } from './components/StateMessage'
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
      <ErrorBoundary
        fallback={(reset) => (
          <StateMessage
            title="Something went wrong"
            tone="error"
            role="alert"
            actions={
              <>
                <Button variant="primary" onClick={reset}>
                  Try again
                </Button>
                <Button onClick={() => window.location.reload()}>Reload page</Button>
              </>
            }
          >
            The page hit an unexpected error. Your filters are saved in the URL, so reloading brings
            you back to the same view.
          </StateMessage>
        )}
      >
        <App />
      </ErrorBoundary>
    </QueryClientProvider>
  </StrictMode>,
)
