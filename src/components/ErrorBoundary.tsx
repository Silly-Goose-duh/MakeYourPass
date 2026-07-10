import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error?: Error
}

/**
 * App-wide error boundary. Catches render errors so a single broken component
 * doesn't white-screen the entire SPA. Styled to match the zine design system.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface for logging/monitoring; swap for Sentry etc. in production.
    console.error('Uncaught render error:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children

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
            maxWidth: 460,
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
            Something broke
          </h1>
          <p style={{ color: '#4A4640', fontWeight: 600, margin: '0 0 1.5rem' }}>
            An unexpected error occurred. Try reloading the page.
          </p>
          <button onClick={() => window.location.reload()} className="zine-btn zine-btn-accent" style={{ textTransform: 'uppercase' }}>
            Reload
          </button>
        </div>
      </div>
    )
  }
}
