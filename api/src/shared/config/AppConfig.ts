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
}

export function loadAppConfig(): AppConfig {
  return {
    port: parseInt(process.env.PORT || '3333', 10),
    corsOrigins: [
      'http://localhost:5173',
      'http://localhost:5174', 
      'http://localhost:3000'
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
    }
  };
}