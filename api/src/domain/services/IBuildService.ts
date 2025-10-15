export interface BuildResult {
  success: boolean;
  output?: string;
  error?: string;
  nodeModulesCopyTime?: number; // Time to copy node_modules from template
  dependencyInstallTime?: number; // Time for npm install
  buildTime?: number;
}

export interface NodeModulesCopyResult {
  copied: boolean; // true if copied from template, false if already existed
  copyTime: number; // time in ms, 0 if not copied
}

export interface IBuildService {
  buildApp(appDirectory: string, projectId?: string): Promise<BuildResult>;
  saveFileTreeToDisk(fileTree: Record<string, string>, projectId: string, version: number): Promise<string>;
  cleanWorkingDirectory(projectId: string): Promise<void>;
  copyPackageLockJson(targetDirectory: string, projectId: string): Promise<void>;
  copyNodeModulesAsync(targetDirectory: string, projectId: string): Promise<NodeModulesCopyResult>;
}