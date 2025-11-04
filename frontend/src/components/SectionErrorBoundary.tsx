import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { Alert } from '@heroui/react';
import { errorTracking } from '../services/errorTracking';

/**
 * Section Error Boundary Component
 *
 * Catches errors in a specific section of the page without breaking the entire app.
 * Use this to wrap individual features, widgets, or sections that can fail independently.
 *
 * Example:
 * <SectionErrorBoundary componentName="ChatWidget">
 *   <ChatWidget />
 * </SectionErrorBoundary>
 */

interface Props {
  children: ReactNode;
  componentName: string;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class SectionErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
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
      this.props.componentName,
      {
        severity: 'medium',
        page: window.location.pathname,
      }
    );

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default fallback UI
      return (
        <div className="p-4">
          <Alert
            color="warning"
            variant="flat"
            title={`Error in ${this.props.componentName}`}
            description={
              <div className="flex flex-col gap-2">
                <p>
                  This section encountered an error. You can try reloading it, or
                  continue using other parts of the app.
                </p>
                {this.state.error && (
                  <p className="text-sm font-mono text-warning-700">
                    {this.state.error.message}
                  </p>
                )}
                <button
                  onClick={this.handleRetry}
                  className="text-sm text-primary-600 hover:text-primary-700 underline text-left"
                >
                  Try again
                </button>
              </div>
            }
          />
        </div>
      );
    }

    return this.props.children;
  }
}
