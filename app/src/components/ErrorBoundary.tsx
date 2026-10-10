import { Component, type ComponentType, type ErrorInfo, type ReactNode } from 'react'

export interface FallbackProps {
  /** Re-renders the children, e.g. from a "Try again" button. */
  reset: () => void
}

interface ErrorBoundaryProps {
  children: ReactNode
  /** Shown instead of the children after a render error. A component, so it is stable. */
  fallback: ComponentType<FallbackProps>
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
    const { fallback: Fallback, children } = this.props
    return this.state.hasError ? <Fallback reset={this.reset} /> : children
  }
}
