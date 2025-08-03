export interface BuildMetrics {
  aiGenerationTimeMs?: number;
  dependencyInstallTimeMs?: number;
  buildTimeMs?: number;
  s3UploadTimeMs?: number;
  versionSourceUploadTimeMs?: number;
  versionProductionUploadTimeMs?: number;
  totalTimeMs?: number;
}

export interface Build {
  id: string;
  fileTree: Record<string, string>;
  projectId: string;
  version: number;
  metrics: BuildMetrics;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateBuildRequest {
  fileTree: Record<string, string>;
  projectId: string;
  metrics?: BuildMetrics;
}