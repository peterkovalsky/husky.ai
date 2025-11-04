import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { User } from '../../domain/entities/User';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';

export class RemoveCustomDomainUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private cloudflareService: CloudflareSaaSService,
    private kvService: CloudflareKVService
  ) {}

  async execute(projectId: string, user: User): Promise<void> {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    // Verify user has access to the project
    const hasAccess = await this.projectRepository.checkUserAccess(user.id, projectId);
    if (!hasAccess) {
      throw new Error('Access denied to project');
    }

    // Get the project
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if custom domain is set
    if (!project.customDomain) {
      throw new Error('No custom domain configured for this project');
    }

    const customDomain = project.customDomain;

    try {
      // Delete Cloudflare custom hostname if it exists
      if (project.customDomainCloudflareId) {
        try {
          await this.cloudflareService.deleteCustomHostname(project.customDomainCloudflareId);
          console.log(`[RemoveCustomDomainUseCase] Deleted Cloudflare hostname ${project.customDomainCloudflareId}`);
        } catch (error) {
          console.error(`[RemoveCustomDomainUseCase] Failed to delete Cloudflare hostname:`, error);
          // Continue with removal even if Cloudflare deletion fails
        }
      }

      // Delete KV mapping
      try {
        await this.kvService.deleteSubdomainMapping(customDomain);
        console.log(`[RemoveCustomDomainUseCase] Deleted KV mapping for ${customDomain}`);
      } catch (error) {
        console.error(`[RemoveCustomDomainUseCase] Failed to delete KV mapping:`, error);
        // Continue with removal even if KV deletion fails
      }

      // Clear custom domain fields in database
      await this.projectRepository.clearCustomDomain(projectId);

      console.log(`[RemoveCustomDomainUseCase] Successfully removed custom domain ${customDomain} from project ${projectId}`);
    } catch (error) {
      console.error(`[RemoveCustomDomainUseCase] Error removing custom domain:`, error);
      throw new Error('Failed to remove custom domain. Please try again or contact support.');
    }
  }
}
