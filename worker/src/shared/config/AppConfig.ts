export type AIProviderType = 'anthropic' | 'openai' | 'gemini';

export interface AIProviderConfig {
  provider: AIProviderType;
  model: string;
}

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
  ai: {
    // Primary provider for first builds (sonnet-equivalent)
    primary: AIProviderConfig;
    // Fast provider for iterations (haiku-equivalent)
    fast: AIProviderConfig;
    // Auto-fix model (defaults to Claude Sonnet for reliable fixes)
    autofixModel: string;
    // Max auto-fix attempts before giving up (defaults to 3)
    autofixMaxAttempts: number;
    // API keys for all providers
    anthropicApiKey?: string;
    openaiApiKey?: string;
    geminiApiKey?: string;
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
      'https://app.huskystudio.ai'
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
    },
    ai: {
      primary: {
        provider: (process.env.AI_PROVIDER_PRIMARY || 'anthropic') as AIProviderType,
        model: process.env.AI_MODEL_PRIMARY || 'claude-sonnet-4-5-20250929',
      },
      fast: {
        provider: (process.env.AI_PROVIDER_FAST || 'anthropic') as AIProviderType,
        model: process.env.AI_MODEL_FAST || 'claude-haiku-4-5-20251001',
      },
      autofixModel: process.env.AI_MODEL_AUTOFIX || 'claude-sonnet-4-5-20250929',
      autofixMaxAttempts: parseInt(process.env.AI_AUTOFIX_MAX_ATTEMPTS || '3', 10),
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      geminiApiKey: process.env.GEMINI_API_KEY,
    }
  };
}