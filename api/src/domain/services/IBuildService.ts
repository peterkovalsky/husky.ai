export interface BuildResult {
  success: boolean;
  output?: string;
  error?: string;
  dependencyInstallTime?: number;
  buildTime?: number;
}

export interface IBuildService {
  buildApp(appDirectory: string, projectId?: string): Promise<BuildResult>;
  saveFileTreeToDisk(fileTree: Record<string, string>, projectId: string): Promise<string>;
}