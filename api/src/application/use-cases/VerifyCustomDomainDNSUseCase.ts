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
      const customDomain = project.customDomain;
      await this.projectRepository.update(projectId, {
        customDomainStatus: CustomDomainStatus.PENDING_SSL,
        customDomainError: null,
        customDomainVerifiedAt: new Date()
      });

      // Run SSL provisioning in the background. waitForSSLActivation polls for
      // up to 3 minutes, longer than typical HTTP timeouts (browsers / CDNs /
      // load balancers tend to drop the connection around 100s) — keeping the
      // request open caused users to see "failed to fetch" even though the
      // backend completed successfully. The frontend already polls the
      // project's customDomainStatus, so it picks up PENDING_SSL → ACTIVE
      // transitions on its own.
      this.provisionSSL(projectId, customDomain).catch(async (error) => {
        console.error(
          `[VerifyCustomDomainDNSUseCase] Background SSL provisioning failed for ${customDomain}:`,
          error
        );
        try {
          await this.projectRepository.updateCustomDomainStatus(
            projectId,
            CustomDomainStatus.FAILED,
            error instanceof Error ? error.message : 'SSL provisioning failed'
          );
        } catch (statusError) {
          console.error(
            `[VerifyCustomDomainDNSUseCase] Failed to record SSL provisioning failure for ${customDomain}:`,
            statusError
          );
        }
      });

      return {
        verified: true,
        message: 'DNS verified. SSL certificate is being provisioned — this usually takes under a minute.'
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

          await this.writeRoutingMappings(customDomain, projectId, project.subdomain);
          await this.markActiveAfterSmokeTest(projectId, customDomain);

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

      await this.writeRoutingMappings(customDomain, projectId, project.subdomain);
      await this.markActiveAfterSmokeTest(projectId, customDomain);

      console.log(`[VerifyCustomDomainDNSUseCase] SSL provisioning completed for ${customDomain}`);

      return {
        message: 'SSL certificate provisioned automatically via HTTP validation'
      };
    } catch (error) {
      console.error(`[VerifyCustomDomainDNSUseCase] SSL provisioning failed:`, error);
      throw error;
    }
  }

  /**
   * Write the two KV mappings that make a custom domain serve content:
   *
   *   customDomain → projectId            (forward routing)
   *   __sub:projectId → canonicalSubdomain (cache canonicalization)
   *
   * The Worker reads both: forward to find which project to serve, reverse
   * to build a cache key under the project's canonical subdomain so cache
   * entries are shared with subdomain traffic and a single host purge clears
   * both. Without the reverse mapping, custom-domain cache entries are
   * orphaned and only expire on natural TTL — which is the bug PR #109 fixed
   * for publish; this call closes the gap for first-time activation.
   */
  private async writeRoutingMappings(
    customDomain: string,
    projectId: string,
    subdomain: string | null | undefined
  ): Promise<void> {
    console.log(`[VerifyCustomDomainDNSUseCase] Creating KV mapping for ${customDomain}`);
    await this.cloudflareKVService.setSubdomainMapping(customDomain, projectId);

    if (subdomain) {
      await this.cloudflareKVService.setMapping(`__sub:${projectId}`, subdomain);
    }
  }

  /**
   * After we believe routing/SSL are in place, hit the public URL once to make
   * sure visitors actually get a usable response. Catches the cases SSL/DNS
   * checks miss — most importantly Cloudflare 522 from a customer who left
   * their CNAME proxied (orange cloud), and 525 from a cert that hasn't
   * propagated to all edges yet.
   *
   * The smoke test is a CHECK, not a gate: ambiguous results (timeouts,
   * network errors, 4xx) still mark ACTIVE because they tend to be transient
   * or expected (e.g. 404 if the project hasn't shipped a homepage yet). Only
   * a clear edge-level error (522/525/526) flips to FAILED with a specific
   * message so the user knows what to fix.
   */
  private async markActiveAfterSmokeTest(projectId: string, customDomain: string): Promise<void> {
    const result = await this.smokeTestPublicUrl(customDomain);

    if (result.kind === 'edge_error') {
      console.warn(
        `[VerifyCustomDomainDNSUseCase] Smoke test for ${customDomain} returned edge error ${result.status}; marking FAILED`
      );
      await this.projectRepository.updateCustomDomainStatus(
        projectId,
        CustomDomainStatus.FAILED,
        result.message
      );
      return;
    }

    if (result.kind === 'inconclusive') {
      console.warn(
        `[VerifyCustomDomainDNSUseCase] Smoke test for ${customDomain} inconclusive (${result.reason}); marking ACTIVE anyway`
      );
    }

    await this.projectRepository.updateCustomDomainStatus(
      projectId,
      CustomDomainStatus.ACTIVE,
      null
    );
  }

  private async smokeTestPublicUrl(customDomain: string): Promise<
    | { kind: 'ok'; status: number }
    | { kind: 'inconclusive'; reason: string }
    | { kind: 'edge_error'; status: number; message: string }
  > {
    const url = `https://${customDomain}/`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { 'User-Agent': 'HuskyStudio-CustomDomainSmokeTest/1.0' },
      });

      // Cloudflare-specific edge errors: definitive signals the customer's
      // edge config is wrong, not transient flakiness.
      if (response.status === 522 || response.status === 523 || response.status === 524) {
        return {
          kind: 'edge_error',
          status: response.status,
          message:
            `Cloudflare can't reach Husky from ${customDomain} (HTTP ${response.status}). ` +
            `This usually means your CNAME is set to "Proxied" (orange cloud) at your DNS provider. ` +
            `Open your Cloudflare DNS settings and switch the record to "DNS only" (grey cloud), then try again.`,
        };
      }
      if (response.status === 525 || response.status === 526) {
        return {
          kind: 'edge_error',
          status: response.status,
          message:
            `SSL handshake failed for ${customDomain} (HTTP ${response.status}). ` +
            `The certificate may still be propagating — wait a minute and try again. ` +
            `If the error persists, check that your CNAME points to fallback.huskystudio.app and isn't proxied.`,
        };
      }

      return { kind: 'ok', status: response.status };
    } catch (err: any) {
      const reason = err?.name === 'AbortError' ? 'timeout after 8s' : (err?.message || 'fetch failed');
      return { kind: 'inconclusive', reason };
    } finally {
      clearTimeout(timer);
    }
  }
}
