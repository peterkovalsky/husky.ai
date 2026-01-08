import fs from 'fs';
import path from 'path';

export class FileSystemHelper {
  private static instance: FileSystemHelper;
  private readonly projectsDir: string;
  private readonly templatesDir: string;

  private constructor() {
    // Use /tmp/projects in production environments (like AWS App Runner) where /projects is not writable
    // Use relative path in development
    this.projectsDir = process.env.NODE_ENV === 'production'
      ? '/tmp/projects'
      : path.join(__dirname, '../../../projects');

    // Templates directory is at the project root level
    // In production: /app/templates, in development: api/../templates
    this.templatesDir = process.env.NODE_ENV === 'production'
      ? '/app/templates/react18-ts'
      : path.join(__dirname, '../../../../templates/react18-ts');
  }

  public static getInstance(): FileSystemHelper {
    if (!FileSystemHelper.instance) {
      FileSystemHelper.instance = new FileSystemHelper();
    }
    return FileSystemHelper.instance;
  }

  /**
   * Get the base projects directory path
   */
  public getProjectsDir(): string {
    return this.projectsDir;
  }

  /**
   * Get the path to a specific project directory
   */
  public getProjectDir(projectId: string): string {
    return path.join(this.projectsDir, projectId);
  }

  /**
   * Get the path to the project's web working directory
   * Structure: /projects/{projectId}/web/
   */
  public getProjectWebDir(projectId: string): string {
    return path.join(this.projectsDir, projectId, 'web');
  }

  /**
   * Get the template directory path
   */
  public getTemplateDir(): string {
    return this.templatesDir;
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

  /**
   * Clean working directory by deleting all files except preserved paths
   * Used when iterating on existing projects to ensure old files are removed
   */
  public async cleanWorkingDirectory(dirPath: string, preservePaths: string[] = ['node_modules', 'package-lock.json']): Promise<void> {
    if (!this.directoryExists(dirPath)) {
      console.log(`Directory ${dirPath} does not exist, skipping cleanup`);
      return;
    }

    const items = await fs.promises.readdir(dirPath);

    for (const item of items) {
      if (!preservePaths.includes(item)) {
        const fullPath = path.join(dirPath, item);
        await fs.promises.rm(fullPath, { recursive: true, force: true });
        console.log(`Deleted: ${fullPath}`);
      }
    }

    console.log(`Cleaned working directory: ${dirPath}, preserved: ${preservePaths.join(', ')}`);
  }
}