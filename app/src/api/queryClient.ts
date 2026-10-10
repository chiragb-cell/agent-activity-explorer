import { QueryClient } from '@tanstack/react-query'
import { retryDelay, shouldRetry } from './retry'

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The API runs on localhost, so `navigator.onLine` says nothing about whether it
        // is reachable. With the default ('online'), queries would pause indefinitely
        // whenever the browser thinks it's offline; instead, always try and report the
        // real outcome.
        networkMode: 'always',
        retry: shouldRetry,
        retryDelay,
        refetchOnWindowFocus: false,
      },
    },
  })
}
