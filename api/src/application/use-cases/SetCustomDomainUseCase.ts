import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { User } from '../../domain/entities/User';
import { CustomDomainStatus } from '../../domain/entities/Project';
import { DNSProvider, IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';

export interface DNSInstructions {
  type: 'CNAME';
  name: string;  // Part before the domain (e.g., "www" for "www.example.com")
  value: string; // CNAME target - fallback origin (e.g., "fallback.huskystudio.app")
}

export interface SetCustomDomainResult {
  domain: string;
  dnsInstructions: DNSInstructions;
  /**
   * Detected DNS provider for the customer's zone (cloudflare, godaddy, ...).
   * Purely a UX hint so the frontend can default-expand the right setup
   * accordion. 'unknown' if we couldn't identify the provider — the user
   * still gets the generic instructions.
   */
  detectedProvider: DNSProvider;
}

export class SetCustomDomainUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private dnsVerificationService: IDNSVerificationService
  ) {}

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

    // Require at least one successful publish before connecting a custom
    // domain. Otherwise verification can succeed but visiting the URL serves
    // a Worker 404 because there's no R2 content for the project — confusing.
    if (!project.publishedVersion || project.publishedVersion === 0) {
      throw new Error(
        'Publish your project at least once before connecting a custom domain. ' +
        'Click Publish first, then come back to add your domain.'
      );
    }

    // Validate domain format
    const normalizedDomain = this.normalizeDomain(customDomain);
    if (!this.isValidDomain(normalizedDomain)) {
      throw new Error('Invalid domain format. Please enter a valid domain (e.g., www.example.com)');
    }

    // Apex domains aren't supported. Cloudflare-for-SaaS routing requires an
    // unproxied CNAME on the customer's zone, but RFC 1034 forbids CNAME at
    // the zone apex — DNS providers either reject it or "flatten" it to A
    // records, both of which break our DNS verification and SSL provisioning.
    // Customers should connect a subdomain (typically www) and set up an apex
    // → www redirect at their registrar/DNS if they want bare-domain access.
    if (this.isApexDomain(normalizedDomain)) {
      throw new Error(
        `Apex domains (${normalizedDomain}) aren't supported because DNS doesn't allow CNAME records at the zone root. ` +
        `Please connect a subdomain instead, e.g. www.${normalizedDomain}, and configure a redirect from ${normalizedDomain} → www.${normalizedDomain} in your DNS provider.`
      );
    }

    // Check if domain is already taken by another project
    const isTaken = await this.projectRepository.isCustomDomainTaken(normalizedDomain);
    if (isTaken) {
      throw new Error('This domain is already in use by another project');
    }

    // Extract the DNS record name from the domain
    const dnsRecordName = this.extractDNSRecordName(normalizedDomain);
    const publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';
    // Point to fallback origin for Cloudflare for SaaS
    const cnameTarget = `fallback.${publishDomain}`;

    // Save custom domain with PENDING_DNS status
    await this.projectRepository.update(projectId, {
      customDomain: normalizedDomain,
      customDomainStatus: CustomDomainStatus.PENDING_DNS,
      customDomainError: null
    });

    console.log(`[SetCustomDomainUseCase] Set custom domain ${normalizedDomain} for project ${projectId}`);

    // Best-effort detection — never blocks. Used to default-expand the right
    // provider accordion in the UI's DNS instructions modal.
    const detectedProvider = await this.dnsVerificationService.detectProvider(normalizedDomain);

    return {
      domain: normalizedDomain,
      dnsInstructions: {
        type: 'CNAME',
        name: dnsRecordName,
        value: cnameTarget
      },
      detectedProvider
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
   * Extracts the DNS record name from a full domain.
   * "www.example.com" -> "www"
   *
   * Apex domains are rejected before reaching this method — see isApexDomain().
   */
  private extractDNSRecordName(domain: string): string {
    return domain.split('.')[0];
  }

  /**
   * Returns true if the domain is at the zone apex (e.g. "example.com",
   * "example.co.uk"). Uses a label-count heuristic: 2 labels for typical
   * single-label TLDs, 3 labels when the second-from-last label is one of the
   * common multi-label country code suffixes. Not a full Public Suffix List
   * implementation, but covers the cases customers actually hit.
   */
  private isApexDomain(domain: string): boolean {
    const parts = domain.split('.');
    if (parts.length === 2) return true;

    if (parts.length === 3) {
      const ccTlds = new Set([
        'co', 'com', 'net', 'org', 'gov', 'edu', 'ac',
      ]);
      const countryTlds = new Set([
        'uk', 'au', 'nz', 'jp', 'kr', 'in', 'br', 'mx', 'za',
      ]);
      const [, second, last] = parts;
      if (ccTlds.has(second) && countryTlds.has(last)) {
        return true;
      }
    }

    return false;
  }
}
