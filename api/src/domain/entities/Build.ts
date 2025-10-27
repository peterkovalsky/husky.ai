export type BuildStatus = 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';

export interface BuildMetrics {
  aiGenerationTimeMs?: number;
  environmentPrepTimeMs?: number; // Time to prepare environment (node_modules + package-lock) - runs in parallel with AI
  nodeModulesCopyTimeMs?: number; // Time to copy node_modules from template (part of environmentPrepTimeMs)
  publicS3UploadTimeMs?: number; // Time to upload images to public S3 bucket
  dependencyInstallTimeMs?: number; // Time for npm install (only when package.json changed)
  buildTimeMs?: number; // Time to build preview version
  s3UploadTimeMs?: number; // Time to upload preview to preview bucket
  versionSourceUploadTimeMs?: number; // Time to upload source code to projects bucket
  versionPreviewUploadTimeMs?: number; // Time to upload preview build to projects bucket
  productionBuildTimeMs?: number; // Time to build production version with root path
  versionProductionUploadTimeMs?: number; // Time to upload production build to projects bucket
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