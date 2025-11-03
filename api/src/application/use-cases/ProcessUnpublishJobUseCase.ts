import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { PublishingStatus } from '../../domain/entities/Project';
import { R2PublishedAppsService } from '../../infrastructure/storage/R2PublishedAppsService';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';

export class ProcessUnpublishJobUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private r2PublishedAppsService: R2PublishedAppsService,
    private cloudflareSaaSService: CloudflareSaaSService,
    private cloudflareKVService: CloudflareKVService
  ) {}

  async execute(projectId: string): Promise<void> {
    try {
      console.log(`[ProcessUnpublishJobUseCase] Starting Cloudflare unpublish for project ${projectId}`);

      // Get project details
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Step 1: Delete subdomain mapping from KV (makes site unreachable)
      // This is the key step - removing the KV mapping means the Worker can't find the project
      if (project.subdomain) {
        console.log(`[ProcessUnpublishJobUseCase] Deleting subdomain mapping from KV`);
        await this.cloudflareKVService.deleteSubdomainMapping(project.subdomain);
      }

      // Step 2: Delete published files from R2 (removes content)
      console.log(`[ProcessUnpublishJobUseCase] Deleting published files from R2`);
      const destPath = `${projectId}/web/`;
      try {
        await this.r2PublishedAppsService.deleteFolder(destPath);
      } catch (error) {
        console.warn(
          `[ProcessUnpublishJobUseCase] Failed to delete files from R2 (may not exist):`,
          error
        );
      }

      // Step 3: Update project status
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.UNPUBLISHED);
      await this.projectRepository.setPublishedAt(projectId, null);
      await this.projectRepository.setPublishedVersion(projectId, null);
      await this.projectRepository.updatePublishingError(projectId, null);

      // IMPORTANT: Keep custom hostname and SSL certificate provisioned!
      // This allows instant republishing without waiting for SSL activation again
      // The hostname fields (cloudflareHostnameId, hostnameStatus) remain intact
      // Site is unreachable because KV mapping was deleted, but SSL stays ready

      console.log(`[ProcessUnpublishJobUseCase] Successfully unpublished project ${projectId}`);
      console.log(`[ProcessUnpublishJobUseCase] Custom hostname preserved for instant republishing`);
    } catch (error) {
      console.error(`[ProcessUnpublishJobUseCase] Failed to unpublish project ${projectId}:`, error);

      // Update status to FAILED and store generic error message
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.FAILED);
      await this.projectRepository.updatePublishingError(
        projectId,
        'An error occurred while unpublishing your project. Please try again.'
      );

      throw error;
    }
  }
}
