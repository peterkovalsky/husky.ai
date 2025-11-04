import posthog from 'posthog-js';

/**
 * Frontend Error Tracking Service
 *
 * Wrapper around PostHog for capturing errors and exceptions with context.
 * Provides comprehensive error tracking for React components, API calls, and user interactions.
 */

export interface ErrorContext {
  userId?: string;
  projectId?: string;
  workspaceId?: string;
  component?: string;
  page?: string;
  action?: string;
  requestId?: string;
  endpoint?: string;
  method?: string;
  statusCode?: number;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  [key: string]: any;
}

class ErrorTrackingService {
  /**
   * Captures an error with context
   * @param error - The error object
   * @param context - Additional context about the error
   */
  captureError(error: Error, context: ErrorContext = {}): void {
    try {
      // Always log to console for development
      console.error('[ErrorTracking]', error.message, {
        error,
        context,
      });

      // Capture in PostHog if available
      if (posthog) {
        const properties: Record<string, any> = {
          // Error details
          $exception_type: error.name,
          $exception_message: error.message,
          $exception_stack: error.stack,

          // Page context
          $current_url: window.location.href,
          $pathname: window.location.pathname,
          $referrer: document.referrer,

          // Browser context
          $browser: navigator.userAgent,
          $viewport_width: window.innerWidth,
          $viewport_height: window.innerHeight,

          // Timestamp
          $timestamp: new Date().toISOString(),

          // User-provided context
          ...context,
        };

        posthog.capture('$exception', properties);
      }
    } catch (captureError) {
      // Never let error tracking crash the app
      console.error('[ErrorTracking] Failed to capture error:', captureError);
    }
  }

  /**
   * Captures an API error with request details
   * @param error - The error object
   * @param endpoint - API endpoint that failed
   * @param method - HTTP method
   * @param statusCode - HTTP status code
   * @param context - Additional context
   */
  captureApiError(
    error: Error,
    endpoint: string,
    method: string,
    statusCode?: number,
    context: ErrorContext = {}
  ): void {
    this.captureError(error, {
      ...context,
      endpoint,
      method,
      statusCode,
      errorType: 'api_error',
    });
  }

  /**
   * Captures a component error (typically from Error Boundary)
   * @param error - The error object
   * @param errorInfo - React error info with component stack
   * @param componentName - Name of the component that errored
   * @param context - Additional context
   */
  captureComponentError(
    error: Error,
    errorInfo: React.ErrorInfo,
    componentName: string,
    context: ErrorContext = {}
  ): void {
    this.captureError(error, {
      ...context,
      component: componentName,
      componentStack: errorInfo.componentStack,
      errorType: 'component_error',
      severity: 'high',
    });
  }

  /**
   * Captures a user action error
   * @param error - The error object
   * @param action - The action that failed (e.g., "submit_form", "delete_project")
   * @param context - Additional context
   */
  captureUserActionError(
    error: Error,
    action: string,
    context: ErrorContext = {}
  ): void {
    this.captureError(error, {
      ...context,
      action,
      errorType: 'user_action_error',
    });
  }

  /**
   * Sets user identification for error tracking
   * Call this when user logs in
   */
  identifyUser(userId: string, properties?: Record<string, any>): void {
    try {
      if (posthog) {
        posthog.identify(userId, properties);
      }
    } catch (error) {
      console.error('[ErrorTracking] Failed to identify user:', error);
    }
  }

  /**
   * Clears user identification
   * Call this when user logs out
   */
  resetUser(): void {
    try {
      if (posthog) {
        posthog.reset();
      }
    } catch (error) {
      console.error('[ErrorTracking] Failed to reset user:', error);
    }
  }

  /**
   * Sets a context property that will be included in all subsequent errors
   * Useful for setting current project, workspace, etc.
   */
  setContext(key: string, value: any): void {
    try {
      if (posthog) {
        posthog.register({ [key]: value });
      }
    } catch (error) {
      console.error('[ErrorTracking] Failed to set context:', error);
    }
  }

  /**
   * Clears a context property
   */
  clearContext(key: string): void {
    try {
      if (posthog) {
        posthog.unregister(key);
      }
    } catch (error) {
      console.error('[ErrorTracking] Failed to clear context:', error);
    }
  }
}

// Export singleton instance
export const errorTracking = new ErrorTrackingService();

// Also export class for testing
export default ErrorTrackingService;
