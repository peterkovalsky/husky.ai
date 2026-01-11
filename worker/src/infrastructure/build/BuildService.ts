import { IBuildService, BuildResult, NodeModulesCopyResult } from '../../domain/services/IBuildService';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { FileSystemHelper } from '../../shared/utils/FileSystemHelper';
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

export class BuildService implements IBuildService {
  private readonly execAsync = promisify(exec);
  private readonly fileSystemHelper: FileSystemHelper;
  private readonly viteCacheDir = '/app/.vite-cache';

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
      await this.fileSystemHelper.cleanWorkingDirectory(webDir, ['node_modules', 'package-lock.json', '.package-hash']);

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

  async copyNodeModulesAsync(targetDirectory: string, projectId: string): Promise<NodeModulesCopyResult> {
    try {
      console.log(`Checking node_modules for project ${projectId}...`);

      const targetNodeModules = path.join(targetDirectory, 'node_modules');

      // First, check if node_modules already exists in the web working directory
      if (this.fileSystemHelper.directoryExists(targetNodeModules)) {
        console.log(`node_modules already exists in web directory: ${targetDirectory}`);
        console.log(`Skipping copy - will use existing node_modules`);
        return { copied: false, copyTime: 0 };
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
        return { copied: true, copyTime };
      }

      console.log(`No node_modules found in template directory: ${templateDir}, will install from scratch`);
      return { copied: false, copyTime: 0 };

    } catch (error) {
      console.warn("Failed to copy node_modules, will install from scratch:", error instanceof Error ? error.message : 'Unknown error');
      // Don't throw error - just log warning and continue
      return { copied: false, copyTime: 0 };
    }
  }

  /**
   * Calculate SHA-256 hash of package.json content
   */
  private calculatePackageJsonHash(packageJsonPath: string): string | null {
    try {
      if (!fs.existsSync(packageJsonPath)) {
        return null;
      }
      const content = fs.readFileSync(packageJsonPath, 'utf8');
      // Parse and stringify to normalize formatting (removes whitespace differences)
      const normalized = JSON.stringify(JSON.parse(content));
      return crypto.createHash('sha256').update(normalized).digest('hex');
    } catch (error) {
      console.warn("Failed to calculate package.json hash:", error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  /**
   * Save package.json hash to a marker file
   */
  private savePackageJsonHash(appDirectory: string, hash: string): void {
    try {
      const hashFilePath = path.join(appDirectory, '.package-hash');
      fs.writeFileSync(hashFilePath, hash, 'utf8');
    } catch (error) {
      console.warn("Failed to save package.json hash:", error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Check if package.json has changed since last install
   */
  private hasPackageJsonChanged(appDirectory: string): boolean {
    try {
      const packageJsonPath = path.join(appDirectory, 'package.json');
      const hashFilePath = path.join(appDirectory, '.package-hash');

      // If hash file doesn't exist, package.json has "changed" (first install)
      if (!fs.existsSync(hashFilePath)) {
        console.log("No previous package.json hash found");
        return true;
      }

      const currentHash = this.calculatePackageJsonHash(packageJsonPath);
      const previousHash = fs.readFileSync(hashFilePath, 'utf8').trim();

      if (!currentHash) {
        console.log("Could not calculate current package.json hash");
        return true;
      }

      const hasChanged = currentHash !== previousHash;
      console.log(`package.json hash comparison: ${hasChanged ? 'CHANGED' : 'UNCHANGED'}`);
      console.log(`Previous: ${previousHash.substring(0, 12)}...`);
      console.log(`Current:  ${currentHash.substring(0, 12)}...`);

      return hasChanged;
    } catch (error) {
      console.warn("Failed to check package.json changes:", error instanceof Error ? error.message : 'Unknown error');
      // If check fails, assume it changed to be safe
      return true;
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

      // Use vite build directly with --minify false for faster preview builds
      // Production builds (via buildAppWithBasePath) still use full minification
      let buildCommand = "npx vite build --minify false";

      // Check if we need to install dependencies
      const nodeModulesPath = path.join(appDirectory, 'node_modules');
      const nodeModulesExists = fs.existsSync(nodeModulesPath);
      const packageJsonChanged = this.hasPackageJsonChanged(appDirectory);

      let dependencyInstallTime = 0;
      const nodeBinPath = path.join(appDirectory, 'node_modules', '.bin');

      // Only install if package.json changed or node_modules doesn't exist
      if (!nodeModulesExists || packageJsonChanged) {
        const reason = !nodeModulesExists
          ? "node_modules doesn't exist"
          : "package.json has changed";
        console.log(`Installing dependencies (${reason})...`);

        const installStartTime = Date.now();
        const installCommand = "npm install --silent --no-audit --no-fund";

        console.log(`Running: ${installCommand}`);

        // Set up environment with proper PATH for npm
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

        // Note: rolldown-vite handles dependency optimization automatically during builds

        // Save the new package.json hash after successful install
        const packageJsonPath = path.join(appDirectory, 'package.json');
        const newHash = this.calculatePackageJsonHash(packageJsonPath);
        if (newHash) {
          this.savePackageJsonHash(appDirectory, newHash);
        }
      } else {
        console.log("Skipping npm install - package.json unchanged and node_modules exists");
        dependencyInstallTime = 0;
      }

      // Note: rolldown-vite handles dependency optimization automatically during builds
      // Log cache status for debugging
      this.logViteCacheStatus();

      // Run build command
      console.log("[BUILD] Starting vite build...");
      console.log(`[BUILD] Command: ${buildCommand}`);
      console.log(`[BUILD] CWD: ${appDirectory}`);
      console.log(`[BUILD] VITE_CACHE_DIR: ${this.viteCacheDir}`);
      if (projectId) console.log(`[BUILD] VITE_BASE_PATH: /projects/${projectId}/`);

      const buildStartTime = Date.now();

      // Set up environment variables for the build
      const buildEnv = {
        ...process.env,
        NODE_ENV: 'production', // Production mode enables optimizations in Vite/React/libraries
        PATH: `${nodeBinPath}:${process.env.PATH}`,
        VITE_CACHE_DIR: this.viteCacheDir, // Use shared Vite cache for faster builds
        ...(projectId ? { VITE_BASE_PATH: `/projects/${projectId}/` } : {}),
      };

      const { stdout, stderr } = await this.execAsync(buildCommand, {
        cwd: appDirectory,
        env: buildEnv,
        timeout: 300000, // 5 minutes timeout
        killSignal: "SIGTERM",
      });
      const buildTime = Date.now() - buildStartTime;

      console.log(`[BUILD] Completed in ${buildTime}ms`);
      if (stdout) {
        // Extract key info from vite output (e.g., "built in Xms")
        const builtInMatch = stdout.match(/built in (\d+)ms/);
        if (builtInMatch) {
          console.log(`[BUILD] Vite reported: built in ${builtInMatch[1]}ms`);
        }
      }

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

  async buildAppWithBasePath(appDirectory: string, basePath: string): Promise<BuildResult> {
    try {
      const buildCommand = "npm run build";
      const nodeBinPath = path.join(appDirectory, 'node_modules', '.bin');

      // Note: rolldown-vite handles dependency optimization automatically
      // Log cache status for debugging
      this.logViteCacheStatus();

      console.log(`[BUILD] Starting production build with base path: ${basePath}`);
      const buildStartTime = Date.now();

      // Set up environment variables for the build with custom base path
      const buildEnv = {
        ...process.env,
        NODE_ENV: 'production',
        PATH: `${nodeBinPath}:${process.env.PATH}`,
        VITE_CACHE_DIR: this.viteCacheDir, // Use shared Vite cache for faster builds
        VITE_BASE_PATH: basePath,
      };

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
        dependencyInstallTime: 0,
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

  /**
   * Log detailed Vite cache status for debugging
   */
  private logViteCacheStatus(): void {
    console.log(`[VITE CACHE] === Cache Status ===`);
    console.log(`[VITE CACHE] Directory: ${this.viteCacheDir}`);

    try {
      if (!fs.existsSync(this.viteCacheDir)) {
        console.log(`[VITE CACHE] Status: MISSING (directory does not exist)`);
        return;
      }

      const items = fs.readdirSync(this.viteCacheDir);
      console.log(`[VITE CACHE] Contents: ${items.length} items - ${items.slice(0, 5).join(', ')}${items.length > 5 ? '...' : ''}`);

      // Check for deps directory specifically
      const depsDir = path.join(this.viteCacheDir, 'deps');
      if (fs.existsSync(depsDir)) {
        const depsFiles = fs.readdirSync(depsDir);
        console.log(`[VITE CACHE] deps/ contains: ${depsFiles.length} files`);
      }

      // Calculate total cache size
      let totalSize = 0;
      const countFiles = (dir: string): void => {
        try {
          const dirItems = fs.readdirSync(dir);
          for (const item of dirItems) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            if (stat.isDirectory()) {
              countFiles(fullPath);
            } else {
              totalSize += stat.size;
            }
          }
        } catch {
          // Ignore errors when counting
        }
      };
      countFiles(this.viteCacheDir);
      console.log(`[VITE CACHE] Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`);
      console.log(`[VITE CACHE] Status: READY`);
    } catch (error) {
      console.log(`[VITE CACHE] Status: ERROR - ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}