import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';
import { User } from '../../domain/entities/User';
import { CustomDomainStatus } from '../../domain/entities/Project';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';

export interface VerifyDNSResult {
  verified: boolean;
  error?: string;
  message?: string;
}

export class VerifyCustomDomainDNSUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private dnsVerificationService: IDNSVerificationService,
    private cloudflareSaaSService: CloudflareSaaSService,
    private cloudflareKVService: CloudflareKVService
  ) {}

  async execute(projectId: string, user: User): Promise<VerifyDNSResult> {
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

    // Ensure project has a subdomain for the CNAME target
    if (!project.subdomain) {
      throw new Error('Project does not have a subdomain. Please contact support.');
    }

    // Build expected CNAME target - should point to fallback origin
    const publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';
    const expectedTarget = `fallback.${publishDomain}`;

    // Verify DNS
    const verificationResult = await this.dnsVerificationService.verifyCNAME(
      project.customDomain,
      expectedTarget
    );

    if (verificationResult.verified) {
      console.log(`[VerifyCustomDomainDNSUseCase] DNS verified for ${project.customDomain}`);

      // DNS verified - update status to PENDING_SSL and start SSL provisioning
      await this.projectRepository.update(projectId, {
        customDomainStatus: CustomDomainStatus.PENDING_SSL,
        customDomainError: null,
        customDomainVerifiedAt: new Date()
      });

      // Provision SSL certificate
      // This will either complete immediately (with validation records to show user)
      // or complete in the background (for subdomains)
      try {
        const sslResult = await this.provisionSSL(projectId, project.customDomain);
        return {
          verified: true,
          ...sslResult
        };
      } catch (error) {
        console.error(`[VerifyCustomDomainDNSUseCase] SSL provisioning failed for ${project.customDomain}:`, error);
        // Update status to FAILED
        await this.projectRepository.updateCustomDomainStatus(
          projectId,
          CustomDomainStatus.FAILED,
          error instanceof Error ? error.message : 'SSL provisioning failed'
        );
        throw error;
      }
    } else {
      // DNS not verified - keep as PENDING_DNS and store error
      await this.projectRepository.updateCustomDomainStatus(
        projectId,
        CustomDomainStatus.PENDING_DNS,
        verificationResult.error || 'DNS verification failed'
      );

      console.log(`[VerifyCustomDomainDNSUseCase] DNS verification failed for ${project.customDomain}: ${verificationResult.error}`);

      return {
        verified: false,
        error: verificationResult.error
      };
    }
  }

  /**
   * Provision SSL certificate for custom domain
   * With HTTP validation, SSL is automatically provisioned by Cloudflare
   */
  private async provisionSSL(projectId: string, customDomain: string): Promise<{
    message?: string;
  }> {
    console.log(`[VerifyCustomDomainDNSUseCase] Starting SSL provisioning for ${customDomain}`);

    try {
      // Get project to check if custom domain Cloudflare ID already exists
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Create or reuse Cloudflare custom hostname
      let hostnameId = project.customDomainCloudflareId;

      if (!hostnameId) {
        console.log(`[VerifyCustomDomainDNSUseCase] Creating Cloudflare custom hostname for ${customDomain}`);
        const result = await this.cloudflareSaaSService.createCustomHostname(customDomain);
        hostnameId = result.hostnameId;

        await this.projectRepository.update(projectId, {
          customDomainCloudflareId: hostnameId
        });

        console.log(`[VerifyCustomDomainDNSUseCase] Custom hostname created: ${hostnameId}, SSL status: ${result.sslStatus}`);
      } else {
        console.log(`[VerifyCustomDomainDNSUseCase] Reusing existing custom hostname: ${hostnameId}`);

        // Check current SSL status
        const currentStatus = await this.cloudflareSaaSService.getCustomHostnameStatus(hostnameId);
        console.log(`[VerifyCustomDomainDNSUseCase] Current SSL status: ${currentStatus.sslStatus}`);

        if (currentStatus.sslStatus === 'active') {
          console.log(`[VerifyCustomDomainDNSUseCase] SSL already active for ${customDomain}!`);

          // Create KV mapping
          await this.cloudflareKVService.setSubdomainMapping(customDomain, projectId);

          // Update status to ACTIVE
          await this.projectRepository.updateCustomDomainStatus(
            projectId,
            CustomDomainStatus.ACTIVE,
            null
          );

          return {
            message: 'SSL certificate is now active!'
          };
        }
      }

      // Wait for SSL activation (automatic with HTTP validation method)
      console.log(`[VerifyCustomDomainDNSUseCase] Waiting for automatic SSL activation via HTTP validation...`);
      try {
        await this.cloudflareSaaSService.waitForSSLActivation(hostnameId, 180000, 5000);
        console.log(`[VerifyCustomDomainDNSUseCase] SSL activated for ${customDomain}!`);
      } catch (sslError) {
        console.warn(`[VerifyCustomDomainDNSUseCase] SSL activation timed out, but continuing:`, sslError);
        // Don't fail - SSL might activate later
      }

      // Create KV mapping for custom domain
      console.log(`[VerifyCustomDomainDNSUseCase] Creating KV mapping for ${customDomain}`);
      await this.cloudflareKVService.setSubdomainMapping(customDomain, projectId);

      // Update status to ACTIVE
      await this.projectRepository.updateCustomDomainStatus(
        projectId,
        CustomDomainStatus.ACTIVE,
        null
      );

      console.log(`[VerifyCustomDomainDNSUseCase] SSL provisioning completed for ${customDomain}`);

      return {
        message: 'SSL certificate provisioned automatically via HTTP validation'
      };
    } catch (error) {
      console.error(`[VerifyCustomDomainDNSUseCase] SSL provisioning failed:`, error);
      throw error;
    }
  }
}
