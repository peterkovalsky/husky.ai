export type BuildStatus = 'QUEUED' | 'PROCESSING' | 'BUILDING' | 'READY' | 'FAILED';

export type FileTree = Record<string, string>;

export interface BuildMetrics {
  initializationTimeMs?: number; // Time for initialization step
  aiGenerationTimeMs?: number;
  environmentPrepTimeMs?: number; // Time to prepare environment (node_modules + package-lock) - runs in parallel with AI
  nodeModulesCopyTimeMs?: number; // Time to copy node_modules from template (part of environmentPrepTimeMs)
  publicS3UploadTimeMs?: number; // Time to upload images to public S3 bucket
  filePrepTimeMs?: number; // Time for file preparation step
  fileSaveTimeMs?: number; // Time to save files to disk
  dependencyInstallTimeMs?: number; // Time for npm install (only when package.json changed)
  buildTimeMs?: number; // Time to build preview version
  s3UploadTimeMs?: number; // Time to upload preview to preview bucket
  versionSourceUploadTimeMs?: number; // Time to upload source code to projects bucket
  versionPreviewUploadTimeMs?: number; // Time to upload preview build to projects bucket
  productionBuildTimeMs?: number; // Time to build production version with root path
  versionProductionUploadTimeMs?: number; // Time to upload production build to projects bucket
  finalizationTimeMs?: number; // Time for finalization step
  totalTimeMs?: number; // Total wall-clock time (not sum of components due to parallelization)
  autoFixTimeMs?: number; // Time spent attempting to auto-fix build errors
  aiFixTimeMs?: number; // Time spent calling AI for fix generation
  filesFixed?: number; // Number of files modified by auto-fix
}

export interface Build {
  id: string;
  fileTree: Record<string, string>;
  projectId: string;
  version: number;
  status: BuildStatus;
  stepStatus?: string;
  metrics: BuildMetrics;
  mediaIds?: string[];
  errorMessage?: string; // Human-readable error summary when build fails
  errorOutput?: string; // Full build error output (stderr/stdout) for debugging
  autoFixAttempted?: boolean; // Whether automatic fix was attempted for this failed build
  autoFixSuccessful?: boolean; // Whether auto-fix successfully resolved the build error
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateBuildRequest {
  fileTree: Record<string, string>;
  projectId: string;
  status?: BuildStatus;
  stepStatus?: string;
  metrics?: BuildMetrics;
  mediaIds?: string[];
}