import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Request ID Middleware
 *
 * Generates a unique ID for each request to enable:
 * - Request tracing across logs and error tracking
 * - Correlation between frontend and backend errors
 * - Debugging distributed systems
 *
 * The request ID is:
 * - Generated as a UUID v4
 * - Attached to the request object
 * - Returned in response headers (X-Request-Id)
 * - Included in all error tracking and logging
 */

declare global {
  namespace Express {
    interface Request {
      id?: string;
    }
  }
}

export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Check if request ID was provided by client (for correlation)
  const clientRequestId = req.headers['x-request-id'] as string | undefined;

  // Generate or use existing request ID
  const requestId = clientRequestId || randomUUID();

  // Attach to request object
  req.id = requestId;

  // Return in response headers
  res.setHeader('X-Request-Id', requestId);

  next();
}
