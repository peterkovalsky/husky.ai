import { IProjectEnvironmentService, ProjectEnvironmentResult } from '../../domain/services/IProjectEnvironmentService';
import { FileSystemHelper } from '../../shared/utils/FileSystemHelper';
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import crypto from "crypto";

export class ProjectEnvironmentService implements IProjectEnvironmentService {
  private readonly execAsync = promisify(exec);
  private readonly fileSystemHelper: FileSystemHelper;
  private readonly viteCacheDir = '/tmp/.vite-cache';

  constructor() {
    this.fileSystemHelper = FileSystemHelper.getInstance();
  }

  /**
   * Initialize the shared Vite cache on worker startup.
   * This pre-warms the cache so first builds don't have to wait for dependency pre-bundling.
   */
  async initializeViteCache(): Promise<void> {
    const depsDir = path.join(this.viteCacheDir, 'deps');

    // Check if cache is already initialized
    if (fs.existsSync(depsDir)) {
      console.log('[VITE CACHE] Already initialized, skipping');
      return;
    }

    console.log('[VITE CACHE] Pre-warming from template...');
    const templateDir = this.fileSystemHelper.getTemplateDir();
    const templateNodeModules = path.join(templateDir, 'node_modules');

    // Only initialize if template has node_modules
    if (!fs.existsSync(templateNodeModules)) {
      console.log('[VITE CACHE] Template node_modules not found, skipping initialization');
      return;
    }

    try {
      const nodeBinPath = path.join(templateDir, 'node_modules', '.bin');

      await this.execAsync('npx vite optimize', {
        cwd: templateDir,
        env: {
          ...process.env,
          PATH: `${nodeBinPath}:${process.env.PATH}`,
          VITE_CACHE_DIR: this.viteCacheDir,
        },
        timeout: 180000, // 3 minutes timeout
        killSignal: "SIGTERM",
      });

      console.log('[VITE CACHE] Initialized successfully');
    } catch (error) {
      console.warn('[VITE CACHE] Initialization failed (non-fatal):', error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async prepareEnvironmentAsync(projectId: string): Promise<ProjectEnvironmentResult> {
    const prepStartTime = Date.now();

    console.log(`[ENV PREP] Starting environment preparation for project ${projectId}...`);

    // Get project web directory (create if needed)
    const webDir = this.fileSystemHelper.getProjectWebDir(projectId);
    this.fileSystemHelper.ensureDirectoryExists(webDir);

    // Prepare node_modules
    const nodeModulesResult = await this.copyNodeModulesIfNeeded(webDir, projectId);

    // Prepare package-lock.json
    const packageLockResult = await this.copyPackageLockIfNeeded(webDir, projectId);

    const totalPrepTime = Date.now() - prepStartTime;

    console.log(`[ENV PREP] Environment preparation completed in ${totalPrepTime}ms`);
    console.log(`[ENV PREP] - node_modules copied: ${nodeModulesResult.copied}`);
    console.log(`[ENV PREP] - package-lock copied: ${packageLockResult}`);

    return {
      nodeModulesCopied: nodeModulesResult.copied,
      nodeModulesCopyTime: nodeModulesResult.copyTime,
      packageLockCopied: packageLockResult,
      totalPrepTime
    };
  }

  private async copyNodeModulesIfNeeded(webDir: string, projectId: string): Promise<{ copied: boolean; copyTime: number }> {
    try {
      const targetNodeModules = path.join(webDir, 'node_modules');

      // Check if node_modules already exists
      if (this.fileSystemHelper.directoryExists(targetNodeModules)) {
        console.log(`[ENV PREP] node_modules already exists, skipping copy`);
        return { copied: false, copyTime: 0 };
      }

      console.log(`[ENV PREP] No node_modules found, checking template...`);

      // Try to copy from template directory
      const templateDir = this.fileSystemHelper.getTemplateDir();
      const templateNodeModules = path.join(templateDir, 'node_modules');

      if (this.fileSystemHelper.directoryExists(templateNodeModules)) {
        console.log(`[ENV PREP] Copying node_modules from template...`);

        const copyCommand = process.platform === 'win32'
          ? `robocopy "${templateNodeModules}" "${targetNodeModules}" /E /NFL /NDL /NJH /NJS /NC /NS /NP`
          : `cp -R "${templateNodeModules}" "${targetNodeModules}"`;

        const copyStartTime = Date.now();
        await this.execAsync(copyCommand, {
          timeout: 120000, // 2 minutes timeout for copying
          killSignal: "SIGTERM",
        });

        const copyTime = Date.now() - copyStartTime;
        console.log(`[ENV PREP] node_modules copy completed in ${copyTime}ms`);

        // Copy or create .package-hash to prevent unnecessary npm install
        // This tells BuildService that deps are already installed from template
        await this.copyOrCreatePackageHash(webDir, templateDir);

        return { copied: true, copyTime };
      }

      console.log(`[ENV PREP] No node_modules in template, will install from scratch later`);
      return { copied: false, copyTime: 0 };

    } catch (error) {
      console.warn("[ENV PREP] Failed to copy node_modules:", error instanceof Error ? error.message : 'Unknown error');
      return { copied: false, copyTime: 0 };
    }
  }

  private async copyPackageLockIfNeeded(webDir: string, projectId: string): Promise<boolean> {
    try {
      const targetPackageLock = path.join(webDir, 'package-lock.json');

      // Check if package-lock.json already exists
      if (fs.existsSync(targetPackageLock)) {
        console.log(`[ENV PREP] package-lock.json already exists, skipping copy`);
        return false;
      }

      console.log(`[ENV PREP] No package-lock.json found, checking template...`);

      // Try to copy from template directory
      const templateDir = this.fileSystemHelper.getTemplateDir();
      const templatePackageLock = path.join(templateDir, 'package-lock.json');

      if (fs.existsSync(templatePackageLock)) {
        fs.copyFileSync(templatePackageLock, targetPackageLock);
        console.log(`[ENV PREP] package-lock.json copied from template`);
        return true;
      }

      console.log(`[ENV PREP] No package-lock.json in template`);
      return false;

    } catch (error) {
      console.warn("[ENV PREP] Failed to copy package-lock.json:", error instanceof Error ? error.message : 'Unknown error');
      return false;
    }
  }

  /**
   * Copy or create .package-hash file after copying node_modules from template.
   * This prevents unnecessary npm install when package.json matches template.
   */
  private async copyOrCreatePackageHash(webDir: string, templateDir: string): Promise<void> {
    try {
      const targetHashFile = path.join(webDir, '.package-hash');
      const templateHashFile = path.join(templateDir, '.package-hash');

      // First, try to copy existing hash file from template
      if (fs.existsSync(templateHashFile)) {
        fs.copyFileSync(templateHashFile, targetHashFile);
        console.log(`[ENV PREP] .package-hash copied from template`);
        return;
      }

      // If no hash file in template, create one from template's package.json
      const templatePackageJson = path.join(templateDir, 'package.json');
      if (fs.existsSync(templatePackageJson)) {
        const content = fs.readFileSync(templatePackageJson, 'utf8');
        const normalized = JSON.stringify(JSON.parse(content));
        const hash = crypto.createHash('sha256').update(normalized).digest('hex');
        fs.writeFileSync(targetHashFile, hash, 'utf8');
        console.log(`[ENV PREP] .package-hash created from template package.json`);
      }
    } catch (error) {
      console.warn("[ENV PREP] Failed to copy/create .package-hash:", error instanceof Error ? error.message : 'Unknown error');
      // Non-fatal - npm install will run if hash is missing
    }
  }
}
