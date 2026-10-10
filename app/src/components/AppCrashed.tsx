import { Button } from './Button'
import type { FallbackProps } from './ErrorBoundary'
import { StateMessage } from './StateMessage'

/** Last-resort screen for a render error anywhere in the app. */
export function AppCrashed({ reset }: FallbackProps) {
  return (
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
      The page hit an unexpected error. Your filters are saved in the URL, so reloading brings you
      back to the same view.
    </StateMessage>
  )
}
