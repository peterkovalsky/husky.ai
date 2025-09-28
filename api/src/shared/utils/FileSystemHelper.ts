import fs from 'fs';
import path from 'path';

export class FileSystemHelper {
  private static instance: FileSystemHelper;
  private readonly appsDir: string;

  private constructor() {
    // Use /tmp/apps in production environments (like AWS App Runner) where /apps is not writable
    // Use relative path in development
    this.appsDir = process.env.NODE_ENV === 'production'
      ? '/tmp/apps'
      : path.join(__dirname, '../../../apps');
  }

  public static getInstance(): FileSystemHelper {
    if (!FileSystemHelper.instance) {
      FileSystemHelper.instance = new FileSystemHelper();
    }
    return FileSystemHelper.instance;
  }

  /**
   * Get the base apps directory path
   */
  public getAppsDir(): string {
    return this.appsDir;
  }

  /**
   * Get the path to a specific project directory
   */
  public getProjectDir(projectId: string): string {
    return path.join(this.appsDir, projectId);
  }

  /**
   * Get the path to a specific project version directory
   */
  public getProjectVersionDir(projectId: string, version: number): string {
    return path.join(this.appsDir, projectId, `v${version}`);
  }

  /**
   * Get the template directory path
   */
  public getTemplateDir(): string {
    return path.join(__dirname, '../../../template');
  }

  /**
   * Ensure a directory exists, creating it if necessary
   */
  public ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  /**
   * Check if a directory exists
   */
  public directoryExists(dirPath: string): boolean {
    return fs.existsSync(dirPath);
  }

  /**
   * Delete a directory and all its contents
   */
  public async deleteDirectory(dirPath: string): Promise<void> {
    if (this.directoryExists(dirPath)) {
      await fs.promises.rm(dirPath, { recursive: true, force: true });
      console.log(`Deleted directory: ${dirPath}`);
    } else {
      console.log(`Directory ${dirPath} does not exist, skipping deletion`);
    }
  }

  /**
   * Write a file to the filesystem
   */
  public writeFile(filePath: string, content: string): void {
    const fileDir = path.dirname(filePath);
    this.ensureDirectoryExists(fileDir);
    fs.writeFileSync(filePath, content, 'utf8');
  }
}