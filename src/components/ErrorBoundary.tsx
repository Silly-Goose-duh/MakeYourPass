import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  /** Optional label for logs / UI (e.g. "org portal") */
  name?: string
  /** Soft fallback instead of full-page block (e.g. for a sidebar) */
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
  errorInfo?: string
}

/**
 * Catches render errors so one broken tree doesn't white-screen the SPA.
 * Supports "Try again" (reset state) without forcing a full reload first.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info)
    this.setState({ errorInfo: info.componentStack || undefined })
  }

  private reset = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined })
  }

  private hardReload = () => {
    try {
      // Drop any bad client state that might re-throw on same path
      sessionStorage.removeItem('myp_crash_once')
    } catch {
      /* ignore */
    }
    window.location.assign(window.location.pathname + window.location.search)
  }

  render() {
    if (!this.state.hasError) return this.props.children

    if (this.props.fallback) {
      return (
        <div role="alert">
          {this.props.fallback}
          <button type="button" onClick={this.reset} className="text-xs underline mt-2 block mx-auto">
            Try again
          </button>
        </div>
      )
    }

    const msg = this.state.error?.message || 'Unknown error'
    const isDev = import.meta.env.DEV

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#F4EFE1',
          padding: '1.5rem',
        }}
      >
        <div
          style={{
            maxWidth: 480,
            width: '100%',
            background: '#fff',
            border: '2.5px solid #14110E',
            boxShadow: '7px 7px 0 #14110E',
            padding: '2rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: 64,
              height: 64,
              margin: '0 auto 1rem',
              background: '#FF4D2E',
              border: '2.5px solid #14110E',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 800,
              color: '#fff',
            }}
          >
            !
          </div>
          <h1
            style={{
              fontFamily: 'Syne, sans-serif',
              fontSize: '1.75rem',
              fontWeight: 800,
              textTransform: 'uppercase',
              color: '#14110E',
              margin: '0 0 0.5rem',
            }}
          >
            Something went wrong
          </h1>
          <p style={{ color: '#4A4640', fontWeight: 600, margin: '0 0 1rem' }}>
            Don&apos;t worry — your data is safe. Try again, or go home.
          </p>
          {(isDev || msg) && (
            <p
              style={{
                fontSize: 11,
                fontFamily: 'ui-monospace, monospace',
                color: '#7A756B',
                background: '#F4EFE1',
                border: '1px solid #14110E',
                padding: '8px 10px',
                marginBottom: 16,
                textAlign: 'left',
                wordBreak: 'break-word',
                maxHeight: 120,
                overflow: 'auto',
              }}
            >
              {msg}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
            <button
              type="button"
              onClick={this.reset}
              className="zine-btn zine-btn-accent"
              style={{ textTransform: 'uppercase' }}
            >
              Try again
            </button>
            <button
              type="button"
              onClick={() => {
                window.location.href = '/'
              }}
              className="zine-btn"
              style={{ textTransform: 'uppercase', background: '#fff' }}
            >
              Go home
            </button>
            <button
              type="button"
              onClick={this.hardReload}
              className="zine-btn"
              style={{ textTransform: 'uppercase', background: '#FFD23F' }}
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    )
  }
}
