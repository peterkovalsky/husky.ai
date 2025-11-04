/**
 * Custom Error Classes for Husky AI
 *
 * All application errors should extend AppError to enable proper error handling,
 * logging, and tracking with PostHog.
 */

/**
 * Base Application Error
 *
 * All custom errors should extend this class. It provides:
 * - HTTP status code association
 * - Operational vs programming error distinction
 * - Error context for debugging and monitoring
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;

  constructor(
    message: string,
    statusCode: number = 500,
    isOperational: boolean = true,
    context?: Record<string, any>
  ) {
    super(message);

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }

    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.context = context;
    this.timestamp = new Date();

    // Set the prototype explicitly to maintain instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Serializes error for API responses (excludes stack trace and non-operational details)
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      ...(this.context && { context: this.context }),
    };
  }
}

/**
 * Validation Error (400)
 *
 * Use when user input fails validation or required parameters are missing.
 *
 * @example
 * throw new ValidationError('Project name is required', { field: 'name' });
 */
export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 400, true, context);
  }
}

/**
 * Authentication Error (401)
 *
 * Use when authentication fails (invalid credentials, missing token, expired session).
 *
 * @example
 * throw new AuthenticationError('Invalid or expired token');
 */
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication failed', context?: Record<string, any>) {
    super(message, 401, true, context);
  }
}

/**
 * Authorization Error (403)
 *
 * Use when user lacks permission to perform an action or access a resource.
 *
 * @example
 * throw new AuthorizationError('You do not have access to this workspace', {
 *   userId,
 *   workspaceId
 * });
 */
export class AuthorizationError extends AppError {
  constructor(message: string = 'Access denied', context?: Record<string, any>) {
    super(message, 403, true, context);
  }
}

/**
 * Not Found Error (404)
 *
 * Use when a requested resource does not exist.
 *
 * @example
 * throw new NotFoundError('Project not found', { projectId });
 */
export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 404, true, context);
  }
}

/**
 * Conflict Error (409)
 *
 * Use when a resource already exists or state conflict occurs.
 *
 * @example
 * throw new ConflictError('Domain already in use', { domain });
 */
export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 409, true, context);
  }
}

/**
 * External Service Error (502)
 *
 * Use when a third-party API or external service fails.
 *
 * @example
 * throw new ExternalServiceError('Anthropic API request failed', {
 *   service: 'Anthropic',
 *   statusCode: 500
 * });
 */
export class ExternalServiceError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 502, true, context);
  }
}

/**
 * Database Error (500)
 *
 * Use when database operations fail (query errors, connection issues).
 *
 * @example
 * throw new DatabaseError('Failed to insert project record', {
 *   operation: 'insert',
 *   table: 'projects'
 * });
 */
export class DatabaseError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

/**
 * Queue Error (500)
 *
 * Use when job queue operations fail (SQS send/receive failures).
 *
 * @example
 * throw new QueueError('Failed to enqueue job', {
 *   queueUrl,
 *   jobType: 'BUILD'
 * });
 */
export class QueueError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

/**
 * Build Error (500)
 *
 * Use when app build or deployment fails.
 *
 * @example
 * throw new BuildError('npm build failed', {
 *   projectId,
 *   exitCode: 1,
 *   stderr
 * });
 */
export class BuildError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

/**
 * Storage Error (500)
 *
 * Use when S3 or file storage operations fail.
 *
 * @example
 * throw new StorageError('Failed to upload to S3', {
 *   bucket,
 *   key,
 *   operation: 'upload'
 * });
 */
export class StorageError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, true, context);
  }
}

/**
 * Configuration Error (500)
 *
 * Use when required configuration is missing or invalid.
 * This is a non-operational error (should not happen in production).
 *
 * @example
 * throw new ConfigurationError('ANTHROPIC_API_KEY is not set');
 */
export class ConfigurationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(message, 500, false, context); // Non-operational
  }
}

/**
 * Rate Limit Error (429)
 *
 * Use when rate limits are exceeded.
 *
 * @example
 * throw new RateLimitError('API rate limit exceeded', {
 *   retryAfter: 60
 * });
 */
export class RateLimitError extends AppError {
  constructor(message: string = 'Rate limit exceeded', context?: Record<string, any>) {
    super(message, 429, true, context);
  }
}

/**
 * Helper function to determine if an error is an operational AppError
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof AppError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Helper function to extract error context safely
 */
export function getErrorContext(error: Error): Record<string, any> {
  if (error instanceof AppError && error.context) {
    return error.context;
  }
  return {};
}
