import { Component, type ReactNode, type ErrorInfo } from 'react';

/* ================================================================== */
/*  Types                                                               */
/* ================================================================== */

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/* ================================================================== */
/*  ErrorBoundary                                                       */
/* ================================================================== */

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  reset = (): void => this.setState({ hasError: false, error: null });

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error, this.reset);
      }
      if (this.props.fallback) return this.props.fallback;
      return (
        <div role="alert" style={{ padding: 20, borderRadius: 12, border: '1.5px solid #fca5a5', background: '#fef2f2', margin: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 18, color: '#ef4444' }}>&#9888;</span>
            <strong style={{ fontSize: 13, color: '#ef4444', fontFamily: 'Inter,ui-sans-serif,system-ui,sans-serif' }}>
              Something went wrong{this.props.name ? ` in ${this.props.name}` : ''}
            </strong>
          </div>
          <p style={{ margin: '0 0 8px', fontSize: 12, color: '#991b1b', fontFamily: 'Inter,ui-sans-serif,system-ui,sans-serif', lineHeight: 1.4 }}>
            {this.state.error.message}
          </p>
          <button
            onClick={this.reset}
            style={{ padding: '5px 14px', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'Inter,ui-sans-serif,system-ui,sans-serif' }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ================================================================== */
/*  withErrorBoundary HOC                                               */
/* ================================================================== */

export function withErrorBoundary<P extends Record<string, unknown>>(
  WrappedComponent: React.ComponentType<P>,
  errorBoundaryProps?: Omit<ErrorBoundaryProps, 'children'>,
) {
  const displayName = WrappedComponent.displayName || WrappedComponent.name || 'Component';
  const ComponentWithBoundary = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps} name={displayName}>
      <WrappedComponent {...props} />
    </ErrorBoundary>
  );
  ComponentWithBoundary.displayName = `withErrorBoundary(${displayName})`;
  return ComponentWithBoundary;
}

/* ================================================================== */
/*  useErrorRecovery Hook                                               */
/* ================================================================== */

import { useCallback, useState as useState_ } from 'react';

export function useErrorRecovery() {
  const [error, setError] = useState_<Error | null>(null);
  const reset = useCallback(() => setError(null), []);
  const capture = useCallback((e: unknown) => {
    setError(e instanceof Error ? e : new Error(String(e)));
  }, []);
  return { error, reset, capture };
}
