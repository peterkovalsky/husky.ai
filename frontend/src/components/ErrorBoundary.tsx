import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Button, Card, CardBody, CardHeader } from '@heroui/react';
import { errorTracking } from '../services/errorTracking';

/**
 * Root Error Boundary Component
 *
 * Catches all unhandled React errors and displays a full-page fallback UI.
 * Use this as the outermost error boundary to catch critical errors.
 */

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Capture error to PostHog
    errorTracking.captureComponentError(
      error,
      errorInfo,
      'ErrorBoundary (Root)',
      {
        severity: 'critical',
        page: window.location.pathname,
      }
    );

    // Update state with error info
    this.setState({
      errorInfo,
    });
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleGoHome = (): void => {
    window.location.href = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-danger-50 to-warning-50">
          <Card className="max-w-2xl w-full">
            <CardHeader className="flex-col items-start gap-2 pb-0">
              <div className="flex items-center gap-2">
                <span className="text-4xl">⚠️</span>
                <h1 className="text-2xl font-bold text-danger-600">
                  Something went wrong
                </h1>
              </div>
            </CardHeader>
            <CardBody className="gap-4">
              <p className="text-default-600">
                We're sorry, but something unexpected happened. The error has been
                logged and our team will look into it.
              </p>

              {this.state.error && (
                <div className="bg-danger-50 border border-danger-200 rounded-lg p-4">
                  <p className="font-mono text-sm text-danger-700">
                    {this.state.error.message}
                  </p>
                </div>
              )}

              {import.meta.env.DEV && this.state.errorInfo && (
                <details className="bg-default-100 rounded-lg p-4">
                  <summary className="cursor-pointer font-semibold text-sm mb-2">
                    Stack Trace (Development Only)
                  </summary>
                  <pre className="text-xs overflow-auto max-h-64">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}

              <div className="flex gap-2 mt-4">
                <Button
                  color="primary"
                  onPress={this.handleReload}
                >
                  Reload Page
                </Button>
                <Button
                  color="default"
                  variant="flat"
                  onPress={this.handleGoHome}
                >
                  Go to Home
                </Button>
              </div>

              <p className="text-sm text-default-500 mt-2">
                If this problem persists, please contact support.
              </p>
            </CardBody>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}
