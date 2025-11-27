import { PostHog } from 'posthog-node';
import { AppError, isOperationalError, getErrorContext } from '../../shared/errors/AppErrors';

/**
 * PostHog Error Tracking Service
 *
 * Captures errors and exceptions to PostHog for monitoring and debugging.
 * Provides comprehensive error context including stack traces, user info,
 * request details, and custom properties.
 */

export interface ErrorContext {
  userId?: string;
  projectId?: string;
  workspaceId?: string;
  requestId?: string;
  requestMethod?: string;
  requestUrl?: string;
  requestBody?: any;
  statusCode?: number;
  environment?: string;
  [key: string]: any;
}

export interface IPostHogErrorTracker {
  captureError(error: Error, context?: ErrorContext): Promise<void>;
  captureException(error: Error, context?: ErrorContext): Promise<void>;
  captureEvent(eventName: string, properties?: Record<string, any>, distinctId?: string): Promise<void>;
  identify(userId: string, properties?: Record<string, any>): Promise<void>;
  shutdown(): Promise<void>;
  getClient(): PostHog | null;
}

export class PostHogErrorTracker implements IPostHogErrorTracker {
  private client: PostHog | null = null;
  private isEnabled: boolean;

  constructor(apiKey?: string, host?: string) {
    this.isEnabled = !!apiKey;

    if (this.isEnabled && apiKey) {
      this.client = new PostHog(apiKey, {
        host: host || 'https://us.i.posthog.com',
        flushAt: 1, // Send events immediately in development
        flushInterval: 10000, // Flush every 10 seconds

        // Enable exception autocapture for uncaught exceptions and unhandled rejections
        enableExceptionAutocapture: true,

        // Customize exception capture behavior
        before_send: (event: any) => {
          // Add any global context or filtering logic here
          // Return null to drop an event
          return event;
        },
      });

      console.log('[PostHogErrorTracker] Initialized with exception autocapture enabled.');
    } else {
      console.warn('[PostHogErrorTracker] PostHog is not configured. Error tracking disabled.');
    }
  }

  /**
   * Get the underlying PostHog client
   * Used for Express error handler setup
   */
  getClient(): PostHog | null {
    return this.client;
  }

  /**
   * Captures an error with comprehensive context
   * This is the main method for error tracking
   */
  async captureError(error: Error, context: ErrorContext = {}): Promise<void> {
    if (!this.isEnabled || !this.client) {
      return;
    }

    try {
      const distinctId = context.userId || 'anonymous';
      const eventName = '$exception';

      // Build comprehensive error properties
      const properties: Record<string, any> = {
        // Error details
        $exception_type: error.name,
        $exception_message: error.message,
        $exception_stack: error.stack,
        $exception_is_operational: isOperationalError(error),

        // AppError specific properties
        ...(error instanceof AppError && {
          $exception_status_code: error.statusCode,
          $exception_context: error.context,
          $exception_timestamp: error.timestamp,
        }),

        // Request context
        ...(context.requestId && { request_id: context.requestId }),
        ...(context.requestMethod && { request_method: context.requestMethod }),
        ...(context.requestUrl && { request_url: context.requestUrl }),
        ...(context.statusCode && { http_status_code: context.statusCode }),

        // User/Resource context
        ...(context.projectId && { project_id: context.projectId }),
        ...(context.workspaceId && { workspace_id: context.workspaceId }),

        // Environment
        environment: context.environment || process.env.NODE_ENV || 'development',

        // Custom properties from error context
        ...getErrorContext(error),

        // Additional context
        ...context,
      };

      // Remove sensitive data
      delete properties.requestBody; // Could contain passwords/tokens
      delete properties.userId; // Already used as distinctId

      this.client.capture({
        distinctId,
        event: eventName,
        properties,
      });

      // For critical errors, flush immediately
      if (
        error instanceof AppError &&
        !error.isOperational
      ) {
        await this.client.flush();
      }
    } catch (captureError) {
      // Never let error tracking crash the app
      console.error('[PostHogErrorTracker] Failed to capture error:', captureError);
    }
  }

  /**
   * Captures an exception and flushes immediately
   * Use this for critical errors that need immediate tracking
   */
  async captureException(error: Error, context: ErrorContext = {}): Promise<void> {
    if (!this.isEnabled || !this.client) {
      return;
    }

    await this.captureError(error, { ...context, severity: 'critical' });
    await this.client.flush();
  }

  /**
   * Captures a custom event with properties
   * Use this for tracking custom application events (e.g., cleanup jobs, scheduled tasks)
   */
  async captureEvent(
    eventName: string,
    properties: Record<string, any> = {},
    distinctId: string = 'system'
  ): Promise<void> {
    if (!this.isEnabled || !this.client) {
      return;
    }

    try {
      this.client.capture({
        distinctId,
        event: eventName,
        properties: {
          ...properties,
          environment: process.env.NODE_ENV || 'development',
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.error('[PostHogErrorTracker] Failed to capture event:', error);
    }
  }

  /**
   * Identifies a user and sets properties
   * Call this when a user authenticates
   */
  async identify(userId: string, properties: Record<string, any> = {}): Promise<void> {
    if (!this.isEnabled || !this.client) {
      return;
    }

    try {
      this.client.identify({
        distinctId: userId,
        properties: {
          ...properties,
          environment: process.env.NODE_ENV || 'development',
        },
      });
    } catch (error) {
      console.error('[PostHogErrorTracker] Failed to identify user:', error);
    }
  }

  /**
   * Shuts down the client and flushes pending events
   * Call this on application shutdown
   */
  async shutdown(): Promise<void> {
    if (this.client) {
      await this.client.shutdown();
    }
  }

  /**
   * Check if PostHog is enabled
   */
  isConfigured(): boolean {
    return this.isEnabled;
  }
}

/**
 * Singleton instance
 * Initialized in ContainerSetup with configuration
 */
let postHogErrorTrackerInstance: PostHogErrorTracker | null = null;

export function initializePostHogErrorTracker(apiKey?: string, host?: string): PostHogErrorTracker {
  if (!postHogErrorTrackerInstance) {
    postHogErrorTrackerInstance = new PostHogErrorTracker(apiKey, host);
  }
  return postHogErrorTrackerInstance;
}

export function getPostHogErrorTracker(): PostHogErrorTracker {
  if (!postHogErrorTrackerInstance) {
    throw new Error('PostHogErrorTracker not initialized. Call initializePostHogErrorTracker first.');
  }
  return postHogErrorTrackerInstance;
}
