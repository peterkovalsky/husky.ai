import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { DeleteProjectMessage } from '../../domain/services/IQueueService';
import { R2PublishedAppsService } from '../../infrastructure/storage/R2PublishedAppsService';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';

export class DeleteProjectUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private buildRepository: IBuildRepository,
    private storageService: IStorageService,
    private r2PublishedAppsService: R2PublishedAppsService,
    private cloudflareSaaSService: CloudflareSaaSService,
    private cloudflareKVService: CloudflareKVService
  ) {}

  async execute(message: DeleteProjectMessage): Promise<void> {
    const { projectId, userId } = message;

    console.log(`Starting physical deletion of project ${projectId} for user ${userId}`);

    try {
      // Get project details for cleanup
      const project = await this.projectRepository.findByIdForOperations(projectId);
      if (!project) {
        console.warn(`Project ${projectId} not found during deletion`);
        return;
      }

      // Get all builds associated with the project
      const builds = await this.buildRepository.findByProjectId(projectId);

      // Step 1: Delete Cloudflare resources (custom hostname, SSL, KV mapping, R2 files)
      await this.deleteCloudflareResources(projectId, project);

      // Step 2: Delete S3 resources
      await this.deleteS3Resources(projectId, builds);

      // Step 3: Delete database records in order (foreign key constraints)
      await this.deleteDatabaseRecords(projectId);

      console.log(`Successfully deleted project ${projectId}`);
    } catch (error) {
      console.error(`Failed to delete project ${projectId}:`, error);
      throw error;
    }
  }

  private async deleteS3Resources(projectId: string, builds: any[]): Promise<void> {
    try {
      // Delete app versions for each build
      for (const build of builds) {
        if (build.s3Key) {
          try {
            await this.storageService.deleteFile(build.s3Key);
            console.log(`Deleted S3 file: ${build.s3Key}`);
          } catch (error) {
            console.warn(`Failed to delete S3 file ${build.s3Key}:`, error);
          }
        }
      }

      // Delete project folder in S3 (if any remaining files)
      try {
        await this.storageService.deleteFolder(`projects/${projectId}/`);
        console.log(`Deleted S3 folder: projects/${projectId}/`);
      } catch (error) {
        console.warn(`Failed to delete S3 folder for project ${projectId}:`, error);
      }

      // Delete preview files (if stored separately)
      try {
        await this.storageService.deleteFolder(`previews/${projectId}/`);
        console.log(`Deleted S3 preview folder: previews/${projectId}/`);
      } catch (error) {
        console.warn(`Failed to delete S3 preview folder for project ${projectId}:`, error);
      }
    } catch (error) {
      console.error(`Error during S3 cleanup for project ${projectId}:`, error);
      throw error;
    }
  }

  private async deleteCloudflareResources(projectId: string, project: any): Promise<void> {
    console.log(`[DeleteProjectUseCase] Starting Cloudflare cleanup for project ${projectId}`);

    try {
      // 1. Delete custom hostname and SSL certificate (if exists)
      if (project.cloudflareHostnameId) {
        console.log(`[DeleteProjectUseCase] Deleting custom hostname and SSL certificate: ${project.cloudflareHostnameId}`);
        try {
          await this.cloudflareSaaSService.deleteCustomHostname(project.cloudflareHostnameId);
          console.log(`[DeleteProjectUseCase] Deleted custom hostname (SSL certificate removed)`);
        } catch (error) {
          console.warn(`[DeleteProjectUseCase] Failed to delete custom hostname (may not exist):`, error);
          // Don't fail - continue cleanup
        }
      } else {
        console.log(`[DeleteProjectUseCase] No custom hostname to delete`);
      }

      // 2. Delete subdomain mapping from KV (if exists)
      if (project.subdomain) {
        console.log(`[DeleteProjectUseCase] Deleting KV mapping for subdomain: ${project.subdomain}`);
        try {
          await this.cloudflareKVService.deleteSubdomainMapping(project.subdomain);
          console.log(`[DeleteProjectUseCase] Deleted KV mapping`);
        } catch (error) {
          console.warn(`[DeleteProjectUseCase] Failed to delete KV mapping (may not exist):`, error);
          // Don't fail - continue cleanup
        }
      } else {
        console.log(`[DeleteProjectUseCase] No subdomain mapping to delete`);
      }

      // 3. Delete published files from R2 (if exists)
      console.log(`[DeleteProjectUseCase] Deleting R2 published files for project ${projectId}`);
      const r2Path = `${projectId}/web/`;
      try {
        await this.r2PublishedAppsService.deleteFolder(r2Path);
        console.log(`[DeleteProjectUseCase] Deleted R2 published files: ${r2Path}`);
      } catch (error) {
        console.warn(`[DeleteProjectUseCase] Failed to delete R2 files (may not exist):`, error);
        // Don't fail - continue cleanup
      }

      console.log(`[DeleteProjectUseCase] Completed Cloudflare cleanup for project ${projectId}`);
    } catch (error) {
      console.error(`[DeleteProjectUseCase] Error during Cloudflare cleanup for project ${projectId}:`, error);
      // Don't throw - we want to continue with the rest of the deletion
    }
  }

  private async deleteDatabaseRecords(projectId: string): Promise<void> {
    try {
      // Delete in order of foreign key dependencies

      // 1. Delete builds (references project) - builds now contain user prompts
      await this.buildRepository.deleteByProjectId(projectId);
      console.log(`Deleted builds for project ${projectId}`);

      // 2. Finally delete the project itself
      await this.projectRepository.deleteById(projectId);
      console.log(`Deleted project record ${projectId}`);

    } catch (error) {
      console.error(`Error during database cleanup for project ${projectId}:`, error);
      throw error;
    }
  }
}