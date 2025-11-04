export interface AppConfig {
  port: number;
  corsOrigins: string[];
  timeouts: {
    request: number;
    server: number;
    keepAlive: number;
    headers: number;
  };
  jobProcessor: {
    intervalMs: number;
    cleanupIntervalMs: number;
  };
  postHog: {
    apiKey?: string;
    host?: string;
    enabled: boolean;
  };
}

export function loadAppConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3333', 10),
    corsOrigins: [
      'http://localhost:5173',
      'http://localhost:5174',
      'http://localhost:3000',
      'https://huskystudio.co',
      'https://app.huskystudio.co'
    ],
    timeouts: {
      request: 300000, // 5 minutes
      server: 300000, // 5 minutes
      keepAlive: 300000, // 5 minutes
      headers: 310000, // slightly longer than keepAliveTimeout
    },
    jobProcessor: {
      intervalMs: 5000, // 5 seconds
      cleanupIntervalMs: 3600000, // 1 hour
    },
    postHog: {
      apiKey: process.env.POSTHOG_API_KEY,
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
      enabled: !!process.env.POSTHOG_API_KEY,
    }
  };
}