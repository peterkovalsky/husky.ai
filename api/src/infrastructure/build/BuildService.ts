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

  async copyNodeModulesAsync(targetDirectory: string, projectId: string): Promise<void> {
    try {
      console.log(`Starting parallel node_modules copy for project ${projectId}...`);
      
      // Find source node_modules from template or previous version
      let sourceNodeModules: string | null = null;

      // First, try to find node_modules from the latest version of this project
      const projectDir = this.fileSystemHelper.getProjectDir(projectId);
      if (this.fileSystemHelper.directoryExists(projectDir)) {
        const versions = fs.readdirSync(projectDir)
          .filter(name => name.startsWith('v'))
          .sort((a, b) => {
            const numA = parseInt(a.substring(1));
            const numB = parseInt(b.substring(1));
            return numB - numA; // Sort descending to get latest first
          });

        for (const version of versions) {
          const versionNodeModules = path.join(projectDir, version, 'node_modules');
          if (this.fileSystemHelper.directoryExists(versionNodeModules)) {
            sourceNodeModules = versionNodeModules;
            console.log(`Using node_modules from previous version: ${version}`);
            break;
          }
        }
      }

      // Fallback to template node_modules if no previous version exists
      if (!sourceNodeModules) {
        const templateNodeModules = path.join(this.fileSystemHelper.getTemplateDir(), 'node_modules');
        if (this.fileSystemHelper.directoryExists(templateNodeModules)) {
          sourceNodeModules = templateNodeModules;
          console.log("Using node_modules from template");
        }
      }

      if (!sourceNodeModules) {
        console.log("No existing node_modules found to copy, will install from scratch");
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
      console.log(`node_modules copy completed in ${copyTime}ms`);
      
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

      // Check if package.json exists to determine the build command
      const packageJsonPath = path.join(appDirectory, "package.json");
      let buildCommand = "npm run build";

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
          // Check if vite is available, prefer vite build over npm run build
          if (packageJson.devDependencies?.vite || packageJson.dependencies?.vite) {
            buildCommand = "npx vite build";
          }
        } catch (error) {
          console.warn("Failed to parse package.json, using default build command:", error);
        }
      }

      // Check if node_modules already exists (from parallel copy)
      const nodeModulesPath = path.join(appDirectory, "node_modules");
      let dependencyInstallTime = 0;
      
      if (fs.existsSync(nodeModulesPath)) {
        console.log("node_modules already exists, running npm ci for any missing packages...");
        const installStartTime = Date.now();
        
        // Use npm ci for faster, more reliable installs when package-lock.json exists
        const installCommand = fs.existsSync(path.join(appDirectory, "package-lock.json"))
          ? "npm ci --silent --no-audit --no-fund"
          : "npm install --silent --no-audit --no-fund";
        
        await this.execAsync(installCommand, {
          cwd: appDirectory,
          timeout: 90000, // Reduced timeout since we already have most dependencies
          killSignal: "SIGTERM",
        });
        dependencyInstallTime = Date.now() - installStartTime;
      } else {
        // Install dependencies from scratch
        console.log("Installing dependencies from scratch...");
        const installCommand = "npm install --silent --no-audit --no-fund";

        const installStartTime = Date.now();
        await this.execAsync(installCommand, {
          cwd: appDirectory,
          timeout: 600000, // 10 minutes timeout
          killSignal: "SIGTERM",
        });
        dependencyInstallTime = Date.now() - installStartTime;
      }

      // Run build command
      console.log("Running build...");
      const buildStartTime = Date.now();

      // Set up build command with inline environment variables if projectId exists
      let finalBuildCommand = buildCommand;
      if (projectId) {
        finalBuildCommand = `VITE_BASE_PATH=/projects/${projectId}/ ${buildCommand}`;
      }
      console.log(`Running: ${finalBuildCommand}`);

      const { stdout, stderr } = await this.execAsync(finalBuildCommand, {
        cwd: appDirectory,
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