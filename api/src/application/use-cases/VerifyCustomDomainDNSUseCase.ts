import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';
import { User } from '../../domain/entities/User';
import { CustomDomainStatus } from '../../domain/entities/Project';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';

export interface TXTValidationRecord {
  txt_name: string;
  txt_value: string;
}

export interface VerifyDNSResult {
  verified: boolean;
  error?: string;
  validationRecords?: TXTValidationRecord[];
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

    // Build expected CNAME target
    const publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';
    const expectedTarget = `${project.subdomain}.${publishDomain}`;

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
   * Returns validation records if user needs to add them to their DNS
   * Returns success message if SSL provisioning completed automatically
   */
  private async provisionSSL(projectId: string, customDomain: string): Promise<{
    validationRecords?: TXTValidationRecord[];
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
      let validationRecords: TXTValidationRecord[] | undefined;

      if (!hostnameId) {
        console.log(`[VerifyCustomDomainDNSUseCase] Creating Cloudflare custom hostname for ${customDomain}`);
        const result = await this.cloudflareSaaSService.createCustomHostname(customDomain);
        hostnameId = result.hostnameId;
        validationRecords = result.validationRecords;

        await this.projectRepository.update(projectId, {
          customDomainCloudflareId: hostnameId
        });

        console.log(`[VerifyCustomDomainDNSUseCase] Custom hostname created: ${hostnameId}, SSL status: ${result.sslStatus}`);

        // If validation records are present, user needs to add them to their DNS
        if (validationRecords && validationRecords.length > 0) {
          console.log(`[VerifyCustomDomainDNSUseCase] Validation records returned - user must add TXT records to their DNS`);
          console.log(`[VerifyCustomDomainDNSUseCase] Validation records:`, validationRecords);

          // Keep status as PENDING_SSL - user needs to add TXT records
          await this.projectRepository.updateCustomDomainStatus(
            projectId,
            CustomDomainStatus.PENDING_SSL,
            'Waiting for DNS TXT validation records to be added'
          );

          return {
            validationRecords,
            message: 'Please add the following TXT records to your DNS to complete SSL validation'
          };
        }
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
        } else if (currentStatus.sslStatus === 'pending_validation') {
          // Still waiting for user to add TXT records
          console.log(`[VerifyCustomDomainDNSUseCase] SSL still pending validation - user needs to add TXT records`);

          // Get validation records from Cloudflare
          const records = await this.cloudflareSaaSService.getValidationRecords(hostnameId);

          if (records.length > 0) {
            return {
              validationRecords: records,
              message: 'Please add the following TXT records to your DNS. SSL validation is still pending.'
            };
          }
        }
      }

      // No validation records - wait for SSL activation (for subdomains)
      console.log(`[VerifyCustomDomainDNSUseCase] Waiting for SSL activation...`);
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
        message: 'SSL certificate provisioned successfully'
      };
    } catch (error) {
      console.error(`[VerifyCustomDomainDNSUseCase] SSL provisioning failed:`, error);
      throw error;
    }
  }
}
