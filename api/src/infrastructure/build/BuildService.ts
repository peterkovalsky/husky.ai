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
    const appDir = this.fileSystemHelper.getProjectVersionDir(projectId, version);

    // Create project and version directories
    this.fileSystemHelper.ensureDirectoryExists(appDir);

    // Write all files to disk
    for (const [filePath, content] of Object.entries(fileTree)) {
      const fullFilePath = path.join(appDir, filePath);
      this.fileSystemHelper.writeFile(fullFilePath, content);
    }

    console.log("All files written to disk in directory:", appDir);
    return appDir;
  }

  private async findSourceDirectory(projectId: string): Promise<string | null> {
    // First, try to find from the latest successful build
    const successfulBuild = await this.buildRepository.findLatestSuccessfulByProjectId(projectId);
    if (successfulBuild) {
      const buildVersionDir = this.fileSystemHelper.getProjectVersionDir(projectId, successfulBuild.version);
      if (this.fileSystemHelper.directoryExists(buildVersionDir)) {
        console.log(`Using source from successful build version ${successfulBuild.version}`);
        return buildVersionDir;
      }
    }

    // Fallback to template directory
    const templateDir = this.fileSystemHelper.getTemplateDir();
    if (this.fileSystemHelper.directoryExists(templateDir)) {
      console.log("Using source from template directory");
      return templateDir;
    }

    return null;
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
      console.log(`Starting parallel node_modules copy for project ${projectId}...`);

      const sourceDir = await this.findSourceDirectory(projectId);
      if (!sourceDir) {
        console.log("No source directory found for node_modules");
        return;
      }

      const sourceNodeModules = path.join(sourceDir, 'node_modules');
      if (!this.fileSystemHelper.directoryExists(sourceNodeModules)) {
        console.log(`No node_modules found in ${sourceDir}, will install from scratch`);
        return;
      }

      const targetNodeModules = path.join(targetDirectory, 'node_modules');

      // Use cp command for fast copying on Unix systems
      const copyCommand = process.platform === 'win32'
        ? `robocopy "${sourceNodeModules}" "${targetNodeModules}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`
        : `cp -R "${sourceNodeModules}" "${targetNodeModules}"`;

      const copyStartTime = Date.now();
      await this.execAsync(copyCommand, {
        timeout: 120000, // 2 minutes timeout for copying
        killSignal: "SIGTERM",
      });

      const copyTime = Date.now() - copyStartTime;
      console.log(`node_modules copy completed in ${copyTime}ms from ${sourceDir}`);

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

      // Check if node_modules already exists (from parallel copy)
      const nodeModulesPath = path.join(appDirectory, "node_modules");
      let dependencyInstallTime = 0;
      
      // Always ensure dependencies are properly installed
      console.log("Installing/updating dependencies...");
      const installStartTime = Date.now();

      // Use npm ci for faster, more reliable installs when package-lock.json exists
      // Otherwise use npm install
      // IMPORTANT: Don't use --omit=dev or --production - we need devDependencies for TypeScript build
      const installCommand = fs.existsSync(path.join(appDirectory, "package-lock.json"))
        ? "npm ci --silent --no-audit --no-fund"
        : "npm install --silent --no-audit --no-fund";

      console.log(`Running: ${installCommand}`);

      // Set up environment with proper PATH for npm
      // Add node_modules/.bin to PATH to ensure npm scripts can find binaries
      const nodeBinPath = path.join(appDirectory, 'node_modules', '.bin');
      const installEnv = {
        ...process.env,
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
        PATH: `${nodeBinPath}:${process.env.PATH}`,
        ...(projectId ? { VITE_BASE_PATH: `/projects/${projectId}/` } : {}),
      };
      console.log(`Running: ${buildCommand}` + (projectId ? ` with VITE_BASE_PATH=/projects/${projectId}/` : ''));

      const { stdout, stderr } = await this.execAsync(buildCommand, {
        cwd: appDirectory,
        env: buildEnv,
        timeout: 120000, // 2 minutes timeout
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