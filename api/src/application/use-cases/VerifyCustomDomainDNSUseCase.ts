import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';
import { User } from '../../domain/entities/User';
import { CustomDomainStatus } from '../../domain/entities/Project';

export interface VerifyDNSResult {
  verified: boolean;
  error?: string;
}

export class VerifyCustomDomainDNSUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private dnsVerificationService: IDNSVerificationService
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
      // DNS verified - update status to PENDING_SSL
      await this.projectRepository.update(projectId, {
        customDomainStatus: CustomDomainStatus.PENDING_SSL,
        customDomainError: null,
        customDomainVerifiedAt: new Date()
      });

      console.log(`[VerifyCustomDomainDNSUseCase] DNS verified for ${project.customDomain}`);

      return {
        verified: true
      };
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
}
