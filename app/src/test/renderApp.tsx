import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import { App } from '../App'
import { shouldRetry } from '../api/retry'

/**
 * Renders the whole app at `url`, with the real retry policy but no backoff delay, so
 * "retries three times, then shows an error" runs in milliseconds.
 */
export function renderApp(url = '/') {
  window.history.replaceState(null, '', url)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        networkMode: 'always',
        retry: shouldRetry,
        retryDelay: 0,
        refetchOnWindowFocus: false,
      },
    },
  })
  return {
    queryClient,
    ...render(
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>,
    ),
  }
}
