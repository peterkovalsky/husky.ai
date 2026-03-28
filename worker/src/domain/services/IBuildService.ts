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

import { ProjectTemplate } from '../entities/Project';

export interface IBuildService {
  buildApp(appDirectory: string, projectId?: string, template?: ProjectTemplate): Promise<BuildResult>;
  buildAppWithBasePath(appDirectory: string, basePath: string, template?: ProjectTemplate): Promise<BuildResult>;
  saveFileTreeToDisk(fileTree: Record<string, string>, projectId: string, version: number): Promise<string>;
  cleanWorkingDirectory(projectId: string): Promise<void>;
  copyPackageLockJson(targetDirectory: string, projectId: string, template?: ProjectTemplate): Promise<void>;
  copyNodeModulesAsync(targetDirectory: string, projectId: string, template?: ProjectTemplate): Promise<NodeModulesCopyResult>;
}