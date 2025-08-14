import fs from 'fs';
import path from 'path';
import { MergeResult } from '../utils/FileTreeMerger';

export class BuildLogger {
  private readonly logsBasePath: string;
  private readonly isDevMode: boolean;

  constructor() {
    this.logsBasePath = path.join(__dirname, '../../../logs');
    this.isDevMode = process.env.NODE_ENV === 'development';
  }

  private ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  private getBuildLogPath(projectId: string, buildId: string): string {
    const projectDir = path.join(this.logsBasePath, `project-${projectId}`);
    const buildDir = path.join(projectDir, `build-${buildId}`);
    return buildDir;
  }

  logAIResponse(projectId: string, buildId: string, rawResponse: string): void {
    if (!this.isDevMode) return;

    try {
      const buildLogPath = this.getBuildLogPath(projectId, buildId);
      this.ensureDirectoryExists(buildLogPath);

      const logFile = path.join(buildLogPath, 'raw_ai_response.txt');
      fs.writeFileSync(logFile, rawResponse, 'utf8');
      console.log(`AI response logged to: ${logFile}`);
    } catch (error) {
      console.error('Failed to log AI response:', error);
    }
  }

  logMergedResult(projectId: string, buildId: string, mergedResult: Record<string, string>): void {
    if (!this.isDevMode) return;

    try {
      const buildLogPath = this.getBuildLogPath(projectId, buildId);
      this.ensureDirectoryExists(buildLogPath);

      const logFile = path.join(buildLogPath, 'merged_result.json');
      fs.writeFileSync(logFile, JSON.stringify(mergedResult, null, 2), 'utf8');
      console.log(`Merged result logged to: ${logFile}`);
    } catch (error) {
      console.error('Failed to log merged result:', error);
    }
  }

  logMergeDetails(projectId: string, buildId: string, mergeResult: MergeResult): void {
    if (!this.isDevMode) return;

    try {
      const buildLogPath = this.getBuildLogPath(projectId, buildId);
      this.ensureDirectoryExists(buildLogPath);

      const logFile = path.join(buildLogPath, 'merge_details.json');
      fs.writeFileSync(logFile, JSON.stringify(mergeResult, null, 2), 'utf8');
      console.log(`Merge details logged to: ${logFile}`);
    } catch (error) {
      console.error('Failed to log merge details:', error);
    }
  }

  logBuildInfo(projectId: string, buildId: string, info: Record<string, any>): void {
    if (!this.isDevMode) return;

    try {
      const buildLogPath = this.getBuildLogPath(projectId, buildId);
      this.ensureDirectoryExists(buildLogPath);

      const logFile = path.join(buildLogPath, 'build_info.json');
      fs.writeFileSync(logFile, JSON.stringify(info, null, 2), 'utf8');
      console.log(`Build info logged to: ${logFile}`);
    } catch (error) {
      console.error('Failed to log build info:', error);
    }
  }
}