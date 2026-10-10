import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Rendered instead of the children after a render error; `reset` re-renders them. */
  fallback: (reset: () => void) => ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

/**
 * Catches render errors so a bug in one region (e.g. the detail panel meeting data it
 * didn't expect) shows a recoverable message instead of blanking the whole app.
 * Network errors don't come here: queries render those as states.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  override state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.error('[ui] Render error', error, info.componentStack)
  }

  reset = () => this.setState({ hasError: false })

  override render() {
    return this.state.hasError ? this.props.fallback(this.reset) : this.props.children
  }
}
