import { IBuildService, BuildResult } from '../../domain/services/IBuildService';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { FileSystemHelper } from '../../shared/utils/FileSystemHelper';
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

export class BuildService implements IBuildService {
  private readonly execAsync = promisify(exec);
  private readonly fileSystemHelper: FileSystemHelper;

  constructor(private buildRepository: IBuildRepository) {
    this.fileSystemHelper = FileSystemHelper.getInstance();
  }

  async saveFileTreeToDisk(fileTree: Record<string, string>, projectId: string, version: number): Promise<string> {
    // Use new single working directory structure
    const appDir = this.fileSystemHelper.getProjectWebDir(projectId);

    // Create project web directory if it doesn't exist
    this.fileSystemHelper.ensureDirectoryExists(appDir);

    // Write all files to disk (excluding node_modules and package-lock.json which are handled separately)
    for (const [filePath, content] of Object.entries(fileTree)) {
      if (filePath === 'node_modules' || filePath === 'package-lock.json') {
        continue; // Skip, these are handled separately
      }

      const fullFilePath = path.join(appDir, filePath);
      this.fileSystemHelper.writeFile(fullFilePath, content);
    }

    console.log("All files written to disk in directory:", appDir);
    return appDir;
  }

  private async findSourceDirectory(projectId: string): Promise<string | null> {
    // First, try the web working directory
    const webDir = this.fileSystemHelper.getProjectWebDir(projectId);
    if (this.fileSystemHelper.directoryExists(webDir)) {
      console.log(`Using source from web working directory`);
      return webDir;
    }

    // Fallback to template directory
    const templateDir = this.fileSystemHelper.getTemplateDir();
    if (this.fileSystemHelper.directoryExists(templateDir)) {
      console.log("Using source from template directory");
      return templateDir;
    }

    return null;
  }

  async cleanWorkingDirectory(projectId: string): Promise<void> {
    try {
      const webDir = this.fileSystemHelper.getProjectWebDir(projectId);

      // Check if working directory exists and has been used before
      if (!this.fileSystemHelper.directoryExists(webDir)) {
        console.log(`Working directory doesn't exist yet for project ${projectId}, skipping cleanup`);
        return;
      }

      console.log(`Cleaning working directory for project ${projectId}...`);
      await this.fileSystemHelper.cleanWorkingDirectory(webDir, ['node_modules', 'package-lock.json']);

    } catch (error) {
      console.warn("Failed to clean working directory:", error instanceof Error ? error.message : 'Unknown error');
      // Don't throw error - just log warning and continue
    }
  }

  async copyPackageLockJson(targetDirectory: string, projectId: string): Promise<void> {
    try {
      console.log(`Copying package-lock.json for project ${projectId}...`);

      const sourceDir = await this.findSourceDirectory(projectId);
      if (!sourceDir) {
        console.log("No source directory found for package-lock.json");
        return;
      }

      const sourcePackageLock = path.join(sourceDir, 'package-lock.json');
      if (!fs.existsSync(sourcePackageLock)) {
        console.log(`No package-lock.json found in ${sourceDir}`);
        return;
      }

      const targetPackageLock = path.join(targetDirectory, 'package-lock.json');
      fs.copyFileSync(sourcePackageLock, targetPackageLock);
      console.log(`package-lock.json copied from ${sourceDir}`);

    } catch (error) {
      console.warn("Failed to copy package-lock.json:", error instanceof Error ? error.message : 'Unknown error');
      // Don't throw error - just log warning and continue
    }
  }

  async copyNodeModulesAsync(targetDirectory: string, projectId: string): Promise<void> {
    try {
      console.log(`Checking node_modules for project ${projectId}...`);

      const targetNodeModules = path.join(targetDirectory, 'node_modules');

      // First, check if node_modules already exists in the web working directory
      if (this.fileSystemHelper.directoryExists(targetNodeModules)) {
        console.log(`node_modules already exists in web directory: ${targetDirectory}`);
        console.log(`Skipping copy - will use existing node_modules`);
        return;
      }

      console.log(`No node_modules found in web directory: ${targetDirectory}`);

      // Try to copy from template directory
      const templateDir = this.fileSystemHelper.getTemplateDir();
      const templateNodeModules = path.join(templateDir, 'node_modules');

      if (this.fileSystemHelper.directoryExists(templateNodeModules)) {
        console.log(`node_modules found in template directory: ${templateDir}`);
        console.log(`Copying node_modules from template...`);

        const copyCommand = process.platform === 'win32'
          ? `robocopy "${templateNodeModules}" "${targetNodeModules}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`
          : `cp -R "${templateNodeModules}" "${targetNodeModules}"`;

        const copyStartTime = Date.now();
        await this.execAsync(copyCommand, {
          timeout: 120000, // 2 minutes timeout for copying
          killSignal: "SIGTERM",
        });

        const copyTime = Date.now() - copyStartTime;
        console.log(`node_modules copy completed in ${copyTime}ms from template directory`);
        return;
      }

      console.log(`No node_modules found in template directory: ${templateDir}, will install from scratch`);

    } catch (error) {
      console.warn("Failed to copy node_modules, will install from scratch:", error instanceof Error ? error.message : 'Unknown error');
      // Don't throw error - just log warning and continue
    }
  }

  async buildApp(appDirectory: string, projectId?: string): Promise<BuildResult> {
    try {
      // Check if build already exists
      const distPath = path.join(appDirectory, "dist");
      if (fs.existsSync(distPath)) {
        console.log(`Build successful - dist folder already exists`);
        return {
          success: true,
          dependencyInstallTime: 0,
          buildTime: 0,
        };
      }

      // Always use npm run build for better dependency resolution
      // This ensures that locally installed dependencies are used instead of npx downloading them
      let buildCommand = "npm run build";

      // Always ensure dependencies are properly installed
      console.log("Installing/updating dependencies...");
      const installStartTime = Date.now();

      const installCommand = "npm install --silent --no-audit --no-fund";

      let dependencyInstallTime = 0;

      console.log(`Running: ${installCommand}`);

      // Set up environment with proper PATH for npm
      // Add node_modules/.bin to PATH to ensure npm scripts can find binaries
      const nodeBinPath = path.join(appDirectory, 'node_modules', '.bin');
      const installEnv = {
        ...process.env,
        NODE_ENV: 'development', // Ensure devDependencies are installed
        PATH: `${nodeBinPath}:${process.env.PATH}`,
      };

      await this.execAsync(installCommand, {
        cwd: appDirectory,
        env: installEnv,
        timeout: 600000, // 10 minutes timeout
        killSignal: "SIGTERM",
      });
      dependencyInstallTime = Date.now() - installStartTime;
      console.log(`Dependencies installed in ${dependencyInstallTime}ms`);

      // Run build command
      console.log("Running build...");
      const buildStartTime = Date.now();

      // Set up environment variables for the build
      const buildEnv = {
        ...process.env,
        NODE_ENV: 'development', // Ensure TypeScript can find all type definitions
        PATH: `${nodeBinPath}:${process.env.PATH}`,
        ...(projectId ? { VITE_BASE_PATH: `/projects/${projectId}/` } : {}),
      };
      console.log(`Running: ${buildCommand}` + (projectId ? ` with VITE_BASE_PATH=/projects/${projectId}/` : ''));

      const { stdout, stderr } = await this.execAsync(buildCommand, {
        cwd: appDirectory,
        env: buildEnv,
        timeout: 300000, // 5 minutes timeout
        killSignal: "SIGTERM",
      });
      const buildTime = Date.now() - buildStartTime;

      return {
        success: true,
        output: stdout,
        error: stderr || undefined,
        dependencyInstallTime,
        buildTime,
      };
    } catch (error: any) {
      console.error("Build process error:", error);

      return {
        success: false,
        output: error.stdout || "",
        error: error.stderr || error.message,
      };
    }
  }
}