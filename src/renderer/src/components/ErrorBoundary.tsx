import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  children: ReactNode
  /** When any value here changes, the boundary clears its error and retries. */
  resetKeys?: unknown[]
  /** Short label for what failed, e.g. "print view". */
  label?: string
}

interface State {
  error: Error | null
  info: ErrorInfo | null
}

/**
 * Catches render/lifecycle errors in a subtree so one broken view (a print
 * preview, a dashboard) shows a recoverable panel instead of unmounting the
 * whole app to a blank screen. Resets automatically when `resetKeys` change
 * (e.g. the user navigates to another node).
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.setState({ info })
    // Surface the full stack in the DevTools console for diagnosis.
    console.error('E-Estimate render error:', error, info.componentStack)
  }

  componentDidUpdate(prev: Props): void {
    if (!this.state.error) return
    const keys = this.props.resetKeys ?? []
    const prevKeys = prev.resetKeys ?? []
    if (keys.length !== prevKeys.length || keys.some((key, i) => key !== prevKeys[i])) {
      this.setState({ error: null, info: null })
    }
  }

  private reset = (): void => this.setState({ error: null, info: null })

  render(): ReactNode {
    const { error, info } = this.state
    if (!error) return this.props.children

    const label = this.props.label ?? 'this view'
    return (
      <div className="error-boundary" role="alert">
        <div className="error-boundary-card">
          <AlertTriangle size={30} className="error-boundary-icon" />
          <h2>Something went wrong in {label}</h2>
          <p>
            The rest of the app is still running. You can retry, or switch to another view and come
            back.
          </p>
          <pre className="error-boundary-message">{error.message || String(error)}</pre>
          {(error.stack || info?.componentStack) && (
            <details className="error-boundary-details">
              <summary>Technical details</summary>
              <pre>{error.stack}</pre>
              {info?.componentStack && <pre>{info.componentStack}</pre>}
            </details>
          )}
          <div className="error-boundary-actions">
            <button className="btn" type="button" onClick={this.reset}>
              <RotateCcw size={15} /> Try again
            </button>
            <button className="btn ghost" type="button" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
