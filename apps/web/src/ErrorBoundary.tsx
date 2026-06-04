import React from 'react'

// ---------------------------------------------------------------------------
// ErrorBoundary — catches render errors and reports them to the preview host.
//
// React does NOT surface render errors via window.onerror, so the preview's
// runtime error script can't see them. This boundary:
//   1. Catches the error so the app shows a useful fallback instead of a blank screen
//   2. Posts the error to the parent window using the same `preview-error` shape
//      that the host fix-loop already listens for — so the existing recovery flow
//      can diagnose and repair render-time bugs.
// ---------------------------------------------------------------------------

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

// Cold-render race window — if the FIRST crash happens this fast after the
// boundary mounts, it's almost certainly a Vite optimizeDeps race or a
// Zustand-persist hydration race. A single reload after the dep cache is
// warm fixes it. After this window, we trust the error is a real bug and
// show the fallback UI as normal.
const COLD_RACE_WINDOW_MS = 3000

// SessionStorage key — survives the reload but not the tab close, so each
// new dev-server URL (new project) starts with a fresh single-shot budget.
const AUTO_RELOAD_KEY = '__rilo_boundary_reloaded__'

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }
  private mountedAt: number = Date.now()

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Auto-reload-once on cold-render races. Conditions:
    //   1. Crash happened within COLD_RACE_WINDOW_MS of mount
    //   2. We haven't already auto-reloaded in this preview session
    //   3. sessionStorage is available (private mode tolerated)
    // If all three: write the flag, reload, and return WITHOUT posting the
    // error to the host — the reload itself is the fix; surfacing the error
    // would falsely trigger the fix-loop.
    try {
      const elapsed = Date.now() - this.mountedAt
      let alreadyReloaded = false
      try {
        alreadyReloaded = sessionStorage.getItem(AUTO_RELOAD_KEY) === '1'
      } catch {
        /* sessionStorage blocked (e.g. private mode) — skip auto-reload */
      }
      if (elapsed < COLD_RACE_WINDOW_MS && !alreadyReloaded) {
        try {
          sessionStorage.setItem(AUTO_RELOAD_KEY, '1')
        } catch {
          /* best-effort */
        }
        window.location.reload()
        return
      }
    } catch {
      /* fall through to existing error reporting */
    }

    try {
      const componentStack = (info && info.componentStack) || ''
      const message = `${error.name}: ${error.message}\n${componentStack}`
      // Match the shape that the preview host's fix-loop listens for.
      window.parent?.postMessage(
        { type: 'preview-error', error: message, source: 'react-render' },
        '*'
      )
    } catch {
      /* ignore postMessage failures (e.g. cross-origin) */
    }
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children
    const err = this.state.error
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0b0b10',
        color: '#f4f4f5',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        padding: '32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          maxWidth: '640px',
          background: '#17171d',
          border: '1px solid #27272f',
          borderRadius: '12px',
          padding: '24px',
        }}>
          <div style={{ fontSize: '14px', color: '#a1a1aa', marginBottom: '8px' }}>
            Something broke while rendering this screen
          </div>
          <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '12px' }}>
            {err.name}: {err.message}
          </div>
          <pre style={{
            fontSize: '12px',
            color: '#a1a1aa',
            background: '#0b0b10',
            padding: '12px',
            borderRadius: '8px',
            maxHeight: '240px',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
          }}>
            {err.stack || '(no stack)'}
          </pre>
          <button
            onClick={this.reset}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </div>
    )
  }
}

export default ErrorBoundary
