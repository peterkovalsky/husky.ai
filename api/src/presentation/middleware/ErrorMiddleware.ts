import { Request, Response, NextFunction } from 'express';
import { AppError, isOperationalError } from '../../shared/errors/AppErrors';
import { ILogger } from '../../shared/logger/Logger';
import { ErrorContext } from '../../infrastructure/monitoring/PostHogErrorTracker';

/**
 * Global Express Error Handling Middleware
 *
 * This middleware catches all errors thrown in the application and:
 * 1. Logs them to the console and PostHog
 * 2. Returns standardized error responses to the client
 * 3. Distinguishes between operational and programming errors
 *
 * MUST be registered as the last middleware in the Express app.
 */

export class ErrorMiddleware {
  constructor(private logger: ILogger) {}

  /**
   * Express error handling middleware
   * Must have 4 parameters to be recognized as error middleware
   */
  handle() {
    return async (err: Error, req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // Extract request context for error tracking
        const context: ErrorContext = {
          requestMethod: req.method,
          requestUrl: req.originalUrl || req.url,
          requestId: (req as any).id, // Added by RequestIdMiddleware
          userId: (req as any).user?.id,
          workspaceId: req.params.workspaceId || (req as any).workspaceId,
          projectId: req.params.projectId || (req as any).projectId,
          statusCode: err instanceof AppError ? err.statusCode : 500,
          environment: process.env.NODE_ENV || 'development',
        };

        // Determine if this is an operational error
        const operational = isOperationalError(err);

        // Log error to console and PostHog
        if (!operational) {
          // Programming errors should be logged with full details
          console.error('[CRITICAL] Non-operational error:', {
            error: err,
            stack: err.stack,
            context,
          });
        }

        // Capture error in PostHog
        await this.logger.captureError(err, context);

        // Determine status code
        const statusCode = err instanceof AppError ? err.statusCode : 500;

        // Build error response
        const errorResponse: any = {
          error: err instanceof AppError ? err.message : 'Internal server error',
        };

        // Add details in development
        if (process.env.NODE_ENV === 'development') {
          errorResponse.details = err.message;
          errorResponse.stack = err.stack;
          if (err instanceof AppError && err.context) {
            errorResponse.context = err.context;
          }
        }

        // Add request ID if available
        if (context.requestId) {
          errorResponse.requestId = context.requestId;
        }

        // Send error response
        res.status(statusCode).json(errorResponse);

        // For non-operational errors, log for investigation
        if (!operational) {
          console.error('❌ Programming error detected. This should be investigated:', err);
        }
      } catch (handlingError) {
        // If error handling itself fails, use fallback
        console.error('[ERROR MIDDLEWARE] Failed to handle error:', handlingError);
        console.error('[ERROR MIDDLEWARE] Original error:', err);

        res.status(500).json({
          error: 'Internal server error',
          message: 'An error occurred while processing your request',
        });
      }
    };
  }
}

/**
 * Handle unhandled promise rejections
 * Should be registered globally in app.ts
 */
export function handleUnhandledRejection(logger: ILogger) {
  return (reason: any, promise: Promise<any>) => {
    console.error('❌ Unhandled Promise Rejection:', reason);

    const error = reason instanceof Error ? reason : new Error(String(reason));

    logger.captureError(error, {
      environment: process.env.NODE_ENV || 'development',
      type: 'unhandled_rejection',
    });

    // In production, we might want to gracefully shut down
    // For now, just log and continue
  };
}

/**
 * Handle uncaught exceptions
 * Should be registered globally in app.ts
 */
export function handleUncaughtException(logger: ILogger) {
  return (error: Error) => {
    console.error('❌ Uncaught Exception:', error);

    logger.captureError(error, {
      environment: process.env.NODE_ENV || 'development',
      type: 'uncaught_exception',
    });

    // Uncaught exceptions are serious - we should exit
    // Give PostHog time to flush before exiting
    setTimeout(() => {
      console.error('Exiting process due to uncaught exception');
      process.exit(1);
    }, 1000);
  };
}
