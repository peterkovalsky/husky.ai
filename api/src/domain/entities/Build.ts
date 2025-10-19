export type BuildStatus = 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';

export interface BuildMetrics {
  aiGenerationTimeMs?: number;
  environmentPrepTimeMs?: number; // Time to prepare environment (node_modules + package-lock) - runs in parallel with AI
  nodeModulesCopyTimeMs?: number; // Time to copy node_modules from template (part of environmentPrepTimeMs)
  dependencyInstallTimeMs?: number; // Time for npm install (only when package.json changed)
  buildTimeMs?: number;
  s3UploadTimeMs?: number;
  versionSourceUploadTimeMs?: number;
  versionProductionUploadTimeMs?: number;
  totalTimeMs?: number; // Total wall-clock time (not sum of components due to parallelization)
}

export interface Build {
  id: string;
  fileTree: Record<string, string>;
  projectId: string;
  version: number;
  status: BuildStatus;
  metrics: BuildMetrics;
  inputTokens?: number;
  outputTokens?: number;
  mediaIds?: string[];
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateBuildRequest {
  fileTree: Record<string, string>;
  projectId: string;
  status?: BuildStatus;
  metrics?: BuildMetrics;
  inputTokens?: number;
  outputTokens?: number;
  mediaIds?: string[];
}