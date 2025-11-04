import { Request, Response } from 'express';
import {
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  DatabaseError,
  QueueError,
  BuildError,
  ExternalServiceError,
} from '../../shared/errors/AppErrors';

/**
 * Test Error Controller
 *
 * DEVELOPMENT/TESTING ONLY
 * Provides endpoints to test different error types and verify PostHog tracking.
 * Remove or secure these endpoints in production!
 */

export class TestErrorController {
  /**
   * Test validation error (400)
   */
  testValidationError = async (req: Request, res: Response) => {
    throw new ValidationError('Test validation error - project name is required', {
      userId: 'test-user-123',
      providedData: { name: '' },
      endpoint: '/api/test/validation-error',
    });
  };

  /**
   * Test authentication error (401)
   */
  testAuthError = async (req: Request, res: Response) => {
    throw new AuthenticationError('Test authentication error - invalid token', {
      endpoint: '/api/test/auth-error',
    });
  };

  /**
   * Test authorization error (403)
   */
  testAuthorizationError = async (req: Request, res: Response) => {
    throw new AuthorizationError('Test authorization error - access denied to workspace', {
      userId: 'test-user-123',
      workspaceId: 'workspace-456',
      endpoint: '/api/test/authorization-error',
    });
  };

  /**
   * Test not found error (404)
   */
  testNotFoundError = async (req: Request, res: Response) => {
    throw new NotFoundError('Test not found error - project not found', {
      projectId: 'non-existent-project',
      requestedBy: 'test-user-123',
      endpoint: '/api/test/not-found-error',
    });
  };

  /**
   * Test conflict error (409)
   */
  testConflictError = async (req: Request, res: Response) => {
    throw new ConflictError('Test conflict error - project name already exists', {
      projectName: 'duplicate-project',
      workspaceId: 'workspace-456',
      endpoint: '/api/test/conflict-error',
    });
  };

  /**
   * Test database error (500)
   */
  testDatabaseError = async (req: Request, res: Response) => {
    throw new DatabaseError('Test database error - failed to query projects table', {
      operation: 'SELECT',
      table: 'projects',
      query: 'SELECT * FROM projects WHERE id = ?',
      endpoint: '/api/test/database-error',
    });
  };

  /**
   * Test queue error (500)
   */
  testQueueError = async (req: Request, res: Response) => {
    throw new QueueError('Test queue error - failed to send message to SQS', {
      queueUrl: 'https://sqs.us-east-1.amazonaws.com/123456789/test-queue',
      messageType: 'BUILD_APP',
      endpoint: '/api/test/queue-error',
    });
  };

  /**
   * Test build error (500)
   */
  testBuildError = async (req: Request, res: Response) => {
    throw new BuildError('Test build error - npm build failed', {
      projectId: 'project-123',
      version: 2,
      exitCode: 1,
      stderr: 'Error: Cannot find module "react"',
      endpoint: '/api/test/build-error',
    });
  };

  /**
   * Test external service error (502)
   */
  testExternalServiceError = async (req: Request, res: Response) => {
    throw new ExternalServiceError('Test external service error - Anthropic API timeout', {
      service: 'Anthropic',
      endpoint: 'https://api.anthropic.com/v1/messages',
      statusCode: 504,
      responseTime: 30000,
    });
  };

  /**
   * Test generic/unexpected error
   */
  testGenericError = async (req: Request, res: Response) => {
    throw new Error('Test generic error - unexpected exception occurred');
  };

  /**
   * Test async error (simulates unhandled promise rejection)
   */
  testAsyncError = async (req: Request, res: Response) => {
    // This will be caught by our try-catch and error middleware
    await Promise.reject(new Error('Test async error - promise rejection'));
  };

  /**
   * Test successful response (control test)
   */
  testSuccess = async (req: Request, res: Response) => {
    res.json({
      message: 'Success! Error tracking system is working.',
      timestamp: new Date().toISOString(),
      requestId: (req as any).id,
    });
  };
}
