/**
 * ErrorBoundary — catches unhandled JS errors anywhere in the component tree
 * below it and renders a friendly fallback instead of a blank/white screen.
 *
 * WHY A CLASS COMPONENT?
 * React error boundaries must be class components because they rely on two
 * lifecycle methods that have no function-component equivalent:
 *   • componentDidCatch(error, info)  — side-effects (e.g. logging)
 *   • getDerivedStateFromError(error) — update state on error (must be static)
 *
 * You can wrap it with a function component for ergonomics (see usage below),
 * but the boundary logic itself must live in a class.
 *
 * PLACEMENT
 * Wrap the entire app in App.tsx for a global catch-all, and optionally wrap
 * individual page sections for more granular recovery (e.g. only the sidebar
 * crashes, not the whole page).
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomePage />
 *   </ErrorBoundary>
 *
 *   // Custom fallback:
 *   <ErrorBoundary fallback={<p>Something went wrong in this section.</p>}>
 *     <SomePage />
 *   </ErrorBoundary>
 */

import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import styles from './ErrorBoundary.module.scss';

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI. Receives the caught error. */
  fallback?: (error: Error) => ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    // Called synchronously when a child throws. Return value merges into state.
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Good place to send to an error-tracking service (Sentry, etc.).
    // For now we just log to console so developers can see stack traces.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (error) {
      if (fallback) return fallback(error);

      return (
        <div className={styles.container} role="alert">
          <div className={styles.card}>
            <span className={styles.icon} aria-hidden="true">⚡</span>
            <h2 className={styles.title}>Something went wrong</h2>
            <p className={styles.message}>
              An unexpected error occurred. You can try reloading the page or
              going back to where you were.
            </p>
            {import.meta.env.DEV && (
              <pre className={styles.detail}>{error.message}</pre>
            )}
            <div className={styles.actions}>
              <button className={styles.btnPrimary} onClick={this.handleReset}>
                Try again
              </button>
              <button
                className={styles.btnSecondary}
                onClick={() => window.location.assign('/')}
              >
                Go home
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}
