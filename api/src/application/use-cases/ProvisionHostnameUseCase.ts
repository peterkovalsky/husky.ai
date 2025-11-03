import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { HostnameStatus } from '../../domain/entities/Project';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';

/**
 * Background job use case for provisioning Cloudflare custom hostnames + SSL
 * This runs asynchronously during project creation to pre-provision SSL
 * Making publish nearly instant (no SSL wait time)
 */
export class ProvisionHostnameUseCase {
  private publishDomain: string;

  constructor(
    private projectRepository: IProjectRepository,
    private cloudflareSaaSService: CloudflareSaaSService
  ) {
    this.publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';
  }

  async execute(projectId: string, subdomain: string): Promise<void> {
    const hostname = `${subdomain}.${this.publishDomain}`;

    try {
      console.log(`[ProvisionHostnameUseCase] Starting hostname provisioning for project ${projectId}: ${hostname}`);

      // Step 1: Update status to PROVISIONING
      await this.projectRepository.update(projectId, {
        hostnameStatus: HostnameStatus.PROVISIONING,
        hostnameError: null,
      });

      console.log(`[ProvisionHostnameUseCase] Status set to PROVISIONING for project ${projectId}`);

      // Step 2: Create Cloudflare custom hostname (triggers SSL provisioning)
      console.log(`[ProvisionHostnameUseCase] Creating custom hostname: ${hostname}`);
      const result = await this.cloudflareSaaSService.createCustomHostname(subdomain);
      const hostnameId = result.hostnameId;

      console.log(`[ProvisionHostnameUseCase] Custom hostname created: ${hostnameId} (SSL: ${result.sslStatus})`);

      // Step 3: Store hostname ID in database
      await this.projectRepository.update(projectId, {
        cloudflareHostnameId: hostnameId,
        cloudflareHostnameStatus: result.sslStatus,
      });

      // Step 4: Wait for SSL activation (3 minutes max)
      console.log(`[ProvisionHostnameUseCase] Waiting for SSL activation...`);
      try {
        await this.cloudflareSaaSService.waitForSSLActivation(hostnameId, 180000, 5000);
        console.log(`[ProvisionHostnameUseCase] SSL activated for ${hostname}!`);

        // Update SSL status
        await this.projectRepository.update(projectId, {
          cloudflareHostnameStatus: 'active',
        });

      } catch (sslError) {
        console.warn(`[ProvisionHostnameUseCase] SSL activation timed out for ${hostname}, but continuing:`, sslError);
        // Don't fail - SSL might activate later
        // Keep status as PROVISIONING or whatever the current status is
      }

      // Step 5: Wait for DNS resolution (45 seconds max)
      console.log(`[ProvisionHostnameUseCase] Waiting for DNS resolution...`);
      try {
        await this.cloudflareSaaSService.waitForDNSResolution(hostname, 45000, 2000);
        console.log(`[ProvisionHostnameUseCase] DNS resolved for ${hostname}!`);
      } catch (dnsError) {
        console.warn(`[ProvisionHostnameUseCase] DNS resolution check timed out for ${hostname}, but continuing:`, dnsError);
        // Don't fail - DNS might resolve later
      }

      // Step 6: Update status to READY
      await this.projectRepository.update(projectId, {
        hostnameStatus: HostnameStatus.READY,
        hostnameError: null,
      });

      console.log(`[ProvisionHostnameUseCase] Successfully provisioned hostname for project ${projectId} at https://${hostname}`);

    } catch (error) {
      console.error(`[ProvisionHostnameUseCase] Failed to provision hostname for project ${projectId}:`, error);

      // Update status to FAILED with error message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error during hostname provisioning';
      await this.projectRepository.update(projectId, {
        hostnameStatus: HostnameStatus.FAILED,
        hostnameError: errorMessage,
      });

      // Don't throw - let the job complete
      // Publish will fall back to on-the-spot provisioning
      console.log(`[ProvisionHostnameUseCase] Hostname provisioning failed for project ${projectId}, will retry during publish`);
    }
  }
}
