import { useState } from 'react';
import { Button, Card, CardBody, CardHeader, Code, Divider, Alert } from '@heroui/react';
import { SectionErrorBoundary } from './SectionErrorBoundary';
import { errorTracking } from '../services/errorTracking';

/**
 * Test Error Page - DEVELOPMENT ONLY
 *
 * This page provides buttons to test all error tracking scenarios:
 * - Frontend component errors (Error Boundary)
 * - Frontend error tracking service
 * - Backend API errors (all error types)
 * - Request ID correlation
 */

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3333';

/**
 * Component that crashes after a delay to test async errors
 */
function AsyncCrashingComponent() {
  const [shouldCrash, setShouldCrash] = useState(false);

  if (shouldCrash) {
    throw new Error('Test async component crash after state update');
  }

  return (
    <div>
      <Button
        color="danger"
        variant="flat"
        onPress={() => setShouldCrash(true)}
      >
        Crash This Component
      </Button>
    </div>
  );
}

export function TestErrorPage() {
  const [status, setStatus] = useState<string>('');
  const [loading, setLoading] = useState(false);

  /**
   * Test frontend error tracking service
   */
  const testFrontendError = (severity: 'low' | 'medium' | 'high' | 'critical') => {
    const error = new Error(`Test frontend error - severity: ${severity}`);
    errorTracking.captureError(error, {
      component: 'TestErrorPage',
      action: 'test_frontend_error',
      severity,
      testData: 'This is a test error',
    });
    setStatus(`✅ Frontend error captured (${severity} severity)`);
  };

  /**
   * Test user action error tracking
   */
  const testUserActionError = () => {
    const error = new Error('Test user action error - failed to submit form');
    errorTracking.captureUserActionError(error, 'submit_test_form', {
      formData: { field1: 'value1', field2: 'value2' },
      severity: 'medium',
    });
    setStatus('✅ User action error captured');
  };

  /**
   * Test backend API error by calling test endpoints
   */
  const testBackendError = async (errorType: string) => {
    setLoading(true);
    setStatus(`Testing ${errorType} error...`);

    try {
      const response = await fetch(`${API_BASE_URL}/api/test/error/${errorType}`);

      if (!response.ok) {
        const requestId = response.headers.get('x-request-id');
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));

        // Capture the error through our error tracking service
        const apiError = new Error(error.error || `HTTP ${response.status}`);
        errorTracking.captureApiError(
          apiError,
          `/api/test/error/${errorType}`,
          'GET',
          response.status,
          { requestId: requestId || undefined }
        );

        setStatus(`✅ ${errorType} error captured from backend API (${response.status})`);
      } else {
        setStatus(`❌ Expected error but got success for ${errorType}`);
      }
    } catch (error) {
      setStatus(`✅ ${errorType} error captured (network error)`);
    } finally {
      setLoading(false);
    }
  };

  /**
   * Test successful API call (control test)
   */
  const testSuccess = async () => {
    setLoading(true);
    setStatus('Testing success endpoint...');

    try {
      const response = await fetch(`${API_BASE_URL}/api/test/success`);
      const data = await response.json();
      setStatus(`✅ Success: ${JSON.stringify(data)}`);
    } catch (error) {
      setStatus(`❌ Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold mb-2">Error Tracking Test Page</h1>
          <p className="text-muted-foreground">
            Development tool to test comprehensive error tracking with PostHog
          </p>
        </div>

        {/* Status Display */}
        {status && (
          <Alert
            color={status.startsWith('✅') ? 'success' : status.startsWith('❌') ? 'danger' : 'primary'}
            variant="flat"
          >
            <Code>{status}</Code>
          </Alert>
        )}

        {/* Frontend Error Tests */}
        <Card>
          <CardHeader className="flex flex-col items-start">
            <h2 className="text-xl font-semibold">Frontend Error Tracking</h2>
            <p className="text-sm text-muted-foreground">
              Test frontend error tracking service (manual capture)
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button
                color="default"
                variant="flat"
                onPress={() => testFrontendError('low')}
              >
                Low Severity Error
              </Button>
              <Button
                color="primary"
                variant="flat"
                onPress={() => testFrontendError('medium')}
              >
                Medium Severity Error
              </Button>
              <Button
                color="warning"
                variant="flat"
                onPress={() => testFrontendError('high')}
              >
                High Severity Error
              </Button>
              <Button
                color="danger"
                variant="flat"
                onPress={() => testFrontendError('critical')}
              >
                Critical Severity Error
              </Button>
            </div>
            <Divider />
            <Button
              color="secondary"
              variant="flat"
              onPress={testUserActionError}
            >
              User Action Error
            </Button>
          </CardBody>
        </Card>

        {/* Error Boundary Tests */}
        <Card>
          <CardHeader className="flex flex-col items-start">
            <h2 className="text-xl font-semibold">Error Boundary Tests</h2>
            <p className="text-sm text-muted-foreground">
              Test React Error Boundaries (component crashes)
            </p>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <p className="text-sm mb-2 font-medium">Section Error Boundary (Isolated)</p>
              <SectionErrorBoundary componentName="TestAsyncCrash">
                <AsyncCrashingComponent />
              </SectionErrorBoundary>
            </div>
            <Divider />
            <div>
              <p className="text-sm mb-2 font-medium text-danger">
                Root Error Boundary (Full Page Crash)
              </p>
              <Alert color="warning" variant="flat" className="mb-2">
                ⚠️ This will crash the entire page. You'll need to reload.
              </Alert>
              <Button
                color="danger"
                variant="solid"
                onPress={() => {
                  // Render a crashing component after button click
                  const root = document.getElementById('root');
                  if (root) {
                    throw new Error('Test root error boundary - full page crash');
                  }
                }}
              >
                Trigger Full Page Crash
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Backend API Error Tests */}
        <Card>
          <CardHeader className="flex flex-col items-start">
            <h2 className="text-xl font-semibold">Backend API Error Tests</h2>
            <p className="text-sm text-muted-foreground">
              Test backend error tracking by calling test endpoints
            </p>
          </CardHeader>
          <CardBody className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('validation')}
                isLoading={loading}
              >
                Validation (400)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('auth')}
                isLoading={loading}
              >
                Auth (401)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('authorization')}
                isLoading={loading}
              >
                Authorization (403)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('not-found')}
                isLoading={loading}
              >
                Not Found (404)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('conflict')}
                isLoading={loading}
              >
                Conflict (409)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('database')}
                isLoading={loading}
              >
                Database (500)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('queue')}
                isLoading={loading}
              >
                Queue (500)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('build')}
                isLoading={loading}
              >
                Build (500)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('external-service')}
                isLoading={loading}
              >
                External Service (502)
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('generic')}
                isLoading={loading}
              >
                Generic Error
              </Button>
              <Button
                color="default"
                variant="flat"
                onPress={() => testBackendError('async')}
                isLoading={loading}
              >
                Async Error
              </Button>
              <Button
                color="success"
                variant="flat"
                onPress={testSuccess}
                isLoading={loading}
              >
                Success (Control)
              </Button>
            </div>
          </CardBody>
        </Card>

        {/* Instructions */}
        <Card>
          <CardHeader>
            <h2 className="text-xl font-semibold">How to Verify</h2>
          </CardHeader>
          <CardBody className="space-y-3">
            <div>
              <p className="font-medium mb-1">1. Check Browser Console</p>
              <p className="text-sm text-muted-foreground">
                Open DevTools and look for [ErrorTracking] logs with error details
              </p>
            </div>
            <Divider />
            <div>
              <p className="font-medium mb-1">2. Check Network Tab</p>
              <p className="text-sm text-muted-foreground">
                Look for requests to PostHog with event name <Code>$exception</Code>
              </p>
            </div>
            <Divider />
            <div>
              <p className="font-medium mb-1">3. Check PostHog Dashboard</p>
              <p className="text-sm text-muted-foreground">
                Go to PostHog → Events → Search for <Code>$exception</Code> events
              </p>
            </div>
            <Divider />
            <div>
              <p className="font-medium mb-1">4. Verify Request ID Correlation</p>
              <p className="text-sm text-muted-foreground">
                Backend errors should include <Code>request_id</Code> property for correlation
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
