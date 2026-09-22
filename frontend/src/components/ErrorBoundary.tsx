import { Component, ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** Last-resort safety net. Without this, any uncaught render error (e.g. a
 * browser that throws on localStorage access) unmounts the whole tree and
 * leaves the visitor staring at a blank white page with no way to recover. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Unhandled error rendering app:', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-brand-800 to-brand-600 page-pad">
          <div className="card w-full max-w-sm p-6 sm:p-8 text-center space-y-4">
            <div className="text-3xl">⚠️</div>
            <h1 className="text-lg font-bold text-brand-800 dark:text-brand-200">Something went wrong</h1>
            <p className="text-sm text-slate-500">
              Please reload the page. If this keeps happening, try a different browser.
            </p>
            <button className="btn-primary w-full" onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
