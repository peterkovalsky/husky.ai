import { ErrorContext } from '../../infrastructure/monitoring/PostHogErrorTracker';

export interface ILogger {
  info(message: string, meta?: any): void;
  warn(message: string, meta?: any): void;
  error(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  captureError(error: Error, context?: ErrorContext): Promise<void>;
}

import { IPostHogErrorTracker } from '../../infrastructure/monitoring/PostHogErrorTracker';

export class ConsoleLogger implements ILogger {
  constructor(private postHogErrorTracker?: IPostHogErrorTracker) {}

  info(message: string, meta?: any): void {
    console.log(`[INFO] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }

  warn(message: string, meta?: any): void {
    console.warn(`[WARN] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }

  error(message: string, meta?: any): void {
    console.error(`[ERROR] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
  }

  debug(message: string, meta?: any): void {
    if (process.env.NODE_ENV === 'development') {
      console.debug(`[DEBUG] ${message}`, meta ? JSON.stringify(meta, null, 2) : '');
    }
  }

  async captureError(error: Error, context?: ErrorContext): Promise<void> {
    // Always log to console
    console.error(`[ERROR] ${error.message}`, {
      name: error.name,
      stack: error.stack,
      context,
    });

    // Track in PostHog if available
    if (this.postHogErrorTracker) {
      await this.postHogErrorTracker.captureError(error, context);
    }
  }
}