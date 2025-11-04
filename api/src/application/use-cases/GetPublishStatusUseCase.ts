import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { User } from '../../domain/entities/User';
import { PublishingStatus, HostnameStatus, CustomDomainStatus } from '../../domain/entities/Project';

export interface DNSInstructions {
  type: 'CNAME';
  name: string;  // Part before the domain (e.g., "www" for "www.example.com")
  value: string; // CNAME target (e.g., "happy-cloud-42.huskystudio.ai")
}

export interface CustomDomainInfo {
  domain: string;
  status: CustomDomainStatus;
  url?: string;  // Only when ACTIVE
  error?: string;
  dnsInstructions?: DNSInstructions;
}

export interface PublishStatusDto {
  status: PublishingStatus;
  publishedAt?: Date;
  publishedUrl?: string;
  publishedVersion?: number;
  currentVersion: number;
  error?: string;
  subdomain?: string;
  sslStatus?: string; // Cloudflare SSL status (pending, active, failed)
  hostnameStatus?: HostnameStatus; // Hostname provisioning status (NONE, PROVISIONING, READY, FAILED)
  hostnameError?: string; // Hostname provisioning error message
  canPublish?: boolean; // Whether site is ready to be published
  customDomain?: CustomDomainInfo; // Custom domain information
}

export class GetPublishStatusUseCase {
  constructor(private projectRepository: IProjectRepository) {}

  async execute(projectId: string, user: User): Promise<PublishStatusDto> {
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

    const publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';
    const publishedUrl =
      project.publishedStatus === 'PUBLISHED' && project.subdomain
        ? `https://${project.subdomain}.${publishDomain}`
        : undefined;

    // Return generic error message if there's a publishing error
    let errorMessage: string | undefined;
    if (project.publishingError) {
      errorMessage = project.publishedStatus === PublishingStatus.FAILED
        ? 'An error occurred while publishing your project. Please try again.'
        : project.publishingError;
    }

    // Determine if project can be published
    // Can publish if: hostname is ready OR hostname provisioning hasn't started (will provision on-the-spot)
    const canPublish =
      project.hostnameStatus === HostnameStatus.READY ||
      project.hostnameStatus === HostnameStatus.NONE ||
      project.hostnameStatus === HostnameStatus.FAILED ||
      !project.hostnameStatus; // Legacy projects without status

    // Build custom domain info if custom domain is set
    let customDomainInfo: CustomDomainInfo | undefined;
    if (project.customDomain) {
      const subdomain = project.subdomain || 'unknown';
      const domainParts = project.customDomain.split('.');
      const dnsRecordName = domainParts.length === 2 ? '@' : domainParts[0];

      customDomainInfo = {
        domain: project.customDomain,
        status: project.customDomainStatus || CustomDomainStatus.NONE,
        url: project.customDomainStatus === CustomDomainStatus.ACTIVE
          ? `https://${project.customDomain}`
          : undefined,
        error: project.customDomainError ?? undefined,
        dnsInstructions: {
          type: 'CNAME',
          name: dnsRecordName,
          value: `${subdomain}.${publishDomain}`
        }
      };
    }

    return {
      status: project.publishedStatus,
      publishedAt: project.publishedAt,
      publishedUrl,
      publishedVersion: project.publishedVersion,
      currentVersion: project.currentVersion,
      error: errorMessage,
      subdomain: project.subdomain,
      sslStatus: project.cloudflareHostnameStatus ?? undefined,
      hostnameStatus: project.hostnameStatus,
      hostnameError: project.hostnameError ?? undefined,
      canPublish,
      customDomain: customDomainInfo,
    };
  }
}
