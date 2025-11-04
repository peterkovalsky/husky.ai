import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { User } from '../../domain/entities/User';
import { CustomDomainStatus } from '../../domain/entities/Project';

export interface DNSInstructions {
  type: 'CNAME';
  name: string;  // Part before the domain (e.g., "www" for "www.example.com")
  value: string; // CNAME target (e.g., "happy-cloud-42.huskystudio.ai")
}

export interface SetCustomDomainResult {
  domain: string;
  dnsInstructions: DNSInstructions;
}

export class SetCustomDomainUseCase {
  constructor(private projectRepository: IProjectRepository) {}

  async execute(projectId: string, customDomain: string, user: User): Promise<SetCustomDomainResult> {
    if (!projectId) {
      throw new Error('projectId is required');
    }

    if (!customDomain) {
      throw new Error('customDomain is required');
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

    // Ensure project has a subdomain
    if (!project.subdomain) {
      throw new Error('Project does not have a subdomain. Please contact support.');
    }

    // Validate domain format
    const normalizedDomain = this.normalizeDomain(customDomain);
    if (!this.isValidDomain(normalizedDomain)) {
      throw new Error('Invalid domain format. Please enter a valid domain (e.g., www.example.com)');
    }

    // Check if domain is already taken by another project
    const isTaken = await this.projectRepository.isCustomDomainTaken(normalizedDomain);
    if (isTaken) {
      throw new Error('This domain is already in use by another project');
    }

    // Extract the DNS record name from the domain
    const dnsRecordName = this.extractDNSRecordName(normalizedDomain);
    const publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';
    const cnameTarget = `${project.subdomain}.${publishDomain}`;

    // Save custom domain with PENDING_DNS status
    await this.projectRepository.update(projectId, {
      customDomain: normalizedDomain,
      customDomainStatus: CustomDomainStatus.PENDING_DNS,
      customDomainError: null
    });

    console.log(`[SetCustomDomainUseCase] Set custom domain ${normalizedDomain} for project ${projectId}`);

    return {
      domain: normalizedDomain,
      dnsInstructions: {
        type: 'CNAME',
        name: dnsRecordName,
        value: cnameTarget
      }
    };
  }

  /**
   * Normalizes a domain by removing protocol, www subdomain (if desired), and trailing slashes
   */
  private normalizeDomain(domain: string): string {
    let normalized = domain.toLowerCase().trim();

    // Remove protocol if present
    normalized = normalized.replace(/^https?:\/\//, '');

    // Remove trailing slash
    normalized = normalized.replace(/\/$/, '');

    // Remove any path
    normalized = normalized.split('/')[0];

    return normalized;
  }

  /**
   * Validates domain format
   */
  private isValidDomain(domain: string): boolean {
    // Basic domain validation regex
    // Allows: example.com, www.example.com, subdomain.example.com
    // Does not allow: http://, spaces, special characters except dots and hyphens
    const domainRegex = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/i;
    return domainRegex.test(domain);
  }

  /**
   * Extracts the DNS record name from a full domain
   * Example: "www.example.com" -> "www"
   * Example: "example.com" -> "@" (root domain)
   */
  private extractDNSRecordName(domain: string): string {
    const parts = domain.split('.');

    // If only 2 parts (e.g., "example.com"), it's a root domain
    if (parts.length === 2) {
      return '@';
    }

    // Return first part (e.g., "www" from "www.example.com")
    return parts[0];
  }
}
