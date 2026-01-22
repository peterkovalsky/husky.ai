import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

const oAuth2Client = new OAuth2Client();

export interface CloudTasksAuthMiddlewareOptions {
  expectedServiceAccount: string;
  skipAuth?: boolean;
}

/**
 * Middleware to validate OIDC tokens from Cloud Tasks
 * Cloud Tasks sends an OIDC token in the Authorization header
 */
export function createCloudTasksAuthMiddleware(options: CloudTasksAuthMiddlewareOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip auth in development or when explicitly disabled
    if (options.skipAuth || process.env.SKIP_CLOUD_TASKS_AUTH === 'true') {
      console.log('[CloudTasksAuth] Skipping authentication (development mode)');
      next();
      return;
    }

    const authHeader = req.headers.authorization;

    if (!authHeader) {
      console.error('[CloudTasksAuth] Missing Authorization header');
      res.status(401).json({ error: 'Missing Authorization header' });
      return;
    }

    // Extract the token from "Bearer <token>"
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      console.error('[CloudTasksAuth] Invalid Authorization header format');
      res.status(401).json({ error: 'Invalid Authorization header format' });
      return;
    }

    const token = parts[1];

    try {
      // Verify the OIDC token
      const ticket = await oAuth2Client.verifyIdToken({
        idToken: token,
        audience: process.env.WORKER_URL, // The audience should match the worker URL
      });

      const payload = ticket.getPayload();

      if (!payload) {
        console.error('[CloudTasksAuth] Empty token payload');
        res.status(401).json({ error: 'Invalid token payload' });
        return;
      }

      // Verify the service account email
      if (payload.email !== options.expectedServiceAccount) {
        console.error('[CloudTasksAuth] Service account mismatch', {
          expected: options.expectedServiceAccount,
          actual: payload.email,
        });
        res.status(403).json({ error: 'Unauthorized service account' });
        return;
      }

      // Verify email is verified
      if (!payload.email_verified) {
        console.error('[CloudTasksAuth] Email not verified');
        res.status(403).json({ error: 'Email not verified' });
        return;
      }

      console.log('[CloudTasksAuth] Token verified successfully', {
        serviceAccount: payload.email,
        audience: payload.aud,
      });

      next();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CloudTasksAuth] Token verification failed', { error: errorMessage });
      res.status(401).json({ error: 'Token verification failed' });
    }
  };
}
