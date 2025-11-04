import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { PublishingStatus, HostnameStatus, CustomDomainStatus } from '../../domain/entities/Project';
import { S3Client } from '@aws-sdk/client-s3';
import { R2PublishedAppsService } from '../../infrastructure/storage/R2PublishedAppsService';
import { CloudflareSaaSService } from '../../infrastructure/cdn/CloudflareSaaSService';
import { CloudflareKVService } from '../../infrastructure/storage/CloudflareKVService';
import { IDNSVerificationService } from '../../infrastructure/dns/DNSVerificationService';

export class ProcessPublishJobUseCase {
  private s3Client: S3Client;
  private projectsBucketName: string;
  private publishDomain: string;

  constructor(
    private projectRepository: IProjectRepository,
    private r2PublishedAppsService: R2PublishedAppsService,
    private cloudflareSaaSService: CloudflareSaaSService,
    private cloudflareKVService: CloudflareKVService,
    private dnsVerificationService: IDNSVerificationService
  ) {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.projectsBucketName = process.env.S3_PROJECTS_BUCKET_NAME!;
    this.publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';

    if (!this.projectsBucketName) {
      throw new Error('Missing S3 projects bucket configuration');
    }

    // S3 client for reading production builds from S3
    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId: accessKeyId!,
        secretAccessKey: secretAccessKey!,
      },
    });
  }

  async execute(projectId: string): Promise<void> {
    try {
      console.log(`[ProcessPublishJobUseCase] Starting Cloudflare publish for project ${projectId}`);

      // Get project details
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      if (!project.subdomain) {
        throw new Error('Project subdomain is not set');
      }

      if (project.currentVersion === 0) {
        throw new Error('No successful builds available for publishing');
      }

      // Step 1: Copy production build from S3 to R2
      console.log(`[ProcessPublishJobUseCase] Copying production build to R2`);
      await this.r2PublishedAppsService.copyProductionBuildFromS3(
        this.s3Client,
        this.projectsBucketName,
        projectId,
        project.currentVersion
      );

      // Step 2: Write subdomain → project ID mapping to KV
      console.log(`[ProcessPublishJobUseCase] Writing subdomain mapping to KV`);
      await this.cloudflareKVService.setSubdomainMapping(project.subdomain, projectId);

      // Step 2.5: Process custom domain if configured
      if (project.customDomain && project.customDomainStatus !== CustomDomainStatus.NONE) {
        console.log(`[ProcessPublishJobUseCase] Processing custom domain: ${project.customDomain}`);

        try {
          // Verify DNS one more time before publishing
          const expectedTarget = `${project.subdomain}.${this.publishDomain}`;
          const dnsCheck = await this.dnsVerificationService.verifyCNAME(
            project.customDomain,
            expectedTarget
          );

          if (dnsCheck.verified) {
            console.log(`[ProcessPublishJobUseCase] DNS verified for custom domain ${project.customDomain}`);

            // Create or reuse Cloudflare custom hostname
            if (!project.customDomainCloudflareId) {
              console.log(`[ProcessPublishJobUseCase] Creating Cloudflare custom hostname for ${project.customDomain}`);
              const result = await this.cloudflareSaaSService.createCustomHostname(project.customDomain);
              await this.projectRepository.update(projectId, {
                customDomainCloudflareId: result.hostnameId,
                customDomainStatus: CustomDomainStatus.PENDING_SSL
              });
              console.log(`[ProcessPublishJobUseCase] Custom domain hostname created: ${result.hostnameId}`);
            } else {
              console.log(`[ProcessPublishJobUseCase] Reusing existing custom domain hostname: ${project.customDomainCloudflareId}`);
            }

            // Write KV mapping for custom domain
            await this.cloudflareKVService.setSubdomainMapping(project.customDomain, projectId);
            console.log(`[ProcessPublishJobUseCase] Custom domain KV mapping created`);

            // Update status to ACTIVE
            await this.projectRepository.updateCustomDomainStatus(
              projectId,
              CustomDomainStatus.ACTIVE,
              null
            );
            console.log(`[ProcessPublishJobUseCase] Custom domain activated: ${project.customDomain}`);

          } else {
            // DNS not configured properly
            console.warn(`[ProcessPublishJobUseCase] DNS verification failed for ${project.customDomain}: ${dnsCheck.error}`);
            await this.projectRepository.updateCustomDomainStatus(
              projectId,
              CustomDomainStatus.PENDING_DNS,
              dnsCheck.error || 'DNS verification failed'
            );
          }
        } catch (error: any) {
          // Custom domain failure doesn't fail the whole publish
          console.error(`[ProcessPublishJobUseCase] Custom domain processing failed:`, error);
          await this.projectRepository.updateCustomDomainStatus(
            projectId,
            CustomDomainStatus.FAILED,
            error.message || 'Failed to configure custom domain'
          );
        }
      }

      const hostname = `${project.subdomain}.${this.publishDomain}`;
      let hostnameId: string;
      let needsSSLWait = false;

      // Step 3: Check hostname provisioning status and handle accordingly
      if (project.hostnameStatus === HostnameStatus.READY && project.cloudflareHostnameId) {
        // PRE-PROVISIONED: Hostname and SSL already ready!
        console.log(`[ProcessPublishJobUseCase] ✨ Hostname pre-provisioned and ready - instant publish!`);
        hostnameId = project.cloudflareHostnameId;
        needsSSLWait = false;

      } else if (project.hostnameStatus === HostnameStatus.PROVISIONING) {
        // PROVISIONING IN PROGRESS: Wait for it to complete
        console.log(`[ProcessPublishJobUseCase] Hostname provisioning in progress, waiting...`);
        hostnameId = project.cloudflareHostnameId || '';

        if (hostnameId) {
          // Wait for provisioning to complete (3 minutes max)
          try {
            await this.waitForProvisioningComplete(project.id, 180000);
            console.log(`[ProcessPublishJobUseCase] Provisioning complete!`);
            needsSSLWait = false;
          } catch (error) {
            console.warn(`[ProcessPublishJobUseCase] Provisioning timeout, will provision now`);
            needsSSLWait = true;
          }
        } else {
          // No hostname ID yet, provision now
          console.log(`[ProcessPublishJobUseCase] No hostname ID, provisioning now`);
          const result = await this.cloudflareSaaSService.createCustomHostname(project.subdomain);
          hostnameId = result.hostnameId;
          needsSSLWait = true;
        }

      } else if (project.cloudflareHostnameId) {
        // REPUBLISH: Custom hostname already exists (but not pre-provisioned)
        console.log(`[ProcessPublishJobUseCase] Republishing - reusing existing custom hostname`);
        try {
          const status = await this.cloudflareSaaSService.getCustomHostnameStatus(project.cloudflareHostnameId);
          console.log(`[ProcessPublishJobUseCase] Existing hostname status: ${status.hostname} (SSL: ${status.sslStatus})`);
          hostnameId = project.cloudflareHostnameId;
          needsSSLWait = false;

          // Quick DNS check to ensure site is still accessible (5 seconds max)
          console.log(`[ProcessPublishJobUseCase] Quick DNS check...`);
          try {
            await this.cloudflareSaaSService.waitForDNSResolution(hostname, 5000, 1000);
            console.log(`[ProcessPublishJobUseCase] Site is accessible`);
          } catch (error) {
            console.warn(`[ProcessPublishJobUseCase] Quick DNS check failed, site may take a moment`);
          }
        } catch (error) {
          // Hostname doesn't exist anymore, create new one
          console.log(`[ProcessPublishJobUseCase] Custom hostname no longer exists, creating new one`);
          const result = await this.cloudflareSaaSService.createCustomHostname(project.subdomain);
          hostnameId = result.hostnameId;
          needsSSLWait = true;
        }

      } else {
        // FALLBACK: No hostname exists, create now (NONE or FAILED status)
        console.log(`[ProcessPublishJobUseCase] No hostname found, provisioning now (status: ${project.hostnameStatus})`);
        const result = await this.cloudflareSaaSService.createCustomHostname(project.subdomain);
        hostnameId = result.hostnameId;
        console.log(`[ProcessPublishJobUseCase] Custom hostname created: ${hostname} (SSL: ${result.sslStatus})`);
        needsSSLWait = true;
      }

      // Step 4: Update project with hostname info
      await this.projectRepository.update(projectId, {
        cloudflareHostnameId: hostnameId,
        cloudflareHostnameStatus: 'pending',
      });

      // Step 5: Wait for DNS resolution and SSL activation (only if needed)
      if (needsSSLWait) {
        console.log(`[ProcessPublishJobUseCase] Waiting for DNS and SSL in parallel...`);

        // Run DNS and SSL checks in parallel to save time
        const results = await Promise.allSettled([
          // DNS check: 45 seconds max, poll every 2 seconds
          this.cloudflareSaaSService.waitForDNSResolution(hostname, 45000, 2000),

          // SSL check: 3 minutes max, poll every 5 seconds
          this.cloudflareSaaSService.waitForSSLActivation(hostnameId, 180000, 5000),
        ]);

        // Check DNS result
        if (results[0].status === 'fulfilled') {
          console.log(`[ProcessPublishJobUseCase] ✓ DNS resolved!`);
        } else {
          console.warn(`[ProcessPublishJobUseCase] DNS check timed out (site may take a moment to be accessible)`);
        }

        // Check SSL result
        if (results[1].status === 'fulfilled') {
          console.log(`[ProcessPublishJobUseCase] ✓ SSL certificate activated!`);
        } else {
          console.warn(`[ProcessPublishJobUseCase] SSL activation timed out (certificate may activate shortly)`);
        }

        console.log(`[ProcessPublishJobUseCase] Site setup complete!`);
      } else {
        console.log(`[ProcessPublishJobUseCase] SSL/DNS already configured, skipping wait ⚡`);
      }

      // Step 6: Update project status to PUBLISHED
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.PUBLISHED);
      await this.projectRepository.setPublishedAt(projectId, new Date());
      await this.projectRepository.setPublishedVersion(projectId, project.currentVersion);
      await this.projectRepository.updatePublishingError(projectId, null);

      const successMessage = needsSSLWait
        ? `Successfully published project ${projectId} version ${project.currentVersion} at https://${hostname}`
        : `Successfully published project ${projectId} version ${project.currentVersion} at https://${hostname} (instant publish!)`;

      console.log(`[ProcessPublishJobUseCase] ${successMessage}`);
      console.log(`[ProcessPublishJobUseCase] Site is live and accessible!`);
    } catch (error) {
      console.error(`[ProcessPublishJobUseCase] Failed to publish project ${projectId}:`, error);

      // Update status to FAILED and store generic error message
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.FAILED);
      await this.projectRepository.updatePublishingError(
        projectId,
        'An error occurred while publishing your project. Please try again.'
      );

      throw error;
    }
  }

  /**
   * Wait for hostname provisioning to complete
   * Polls database for status change from PROVISIONING to READY or FAILED
   * @param projectId - Project ID
   * @param maxWaitTime - Maximum time to wait in milliseconds (default 3 minutes)
   * @returns Promise that resolves when provisioning completes or times out
   */
  private async waitForProvisioningComplete(
    projectId: string,
    maxWaitTime: number = 180000
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 5000; // Check every 5 seconds

    console.log(`[ProcessPublishJobUseCase] Waiting for hostname provisioning to complete...`);

    while (Date.now() - startTime < maxWaitTime) {
      const project = await this.projectRepository.findById(projectId);

      if (!project) {
        throw new Error(`Project ${projectId} not found`);
      }

      if (project.hostnameStatus === HostnameStatus.READY) {
        console.log(`[ProcessPublishJobUseCase] Hostname provisioning complete (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`);
        return;
      }

      if (project.hostnameStatus === HostnameStatus.FAILED) {
        console.warn(`[ProcessPublishJobUseCase] Hostname provisioning failed: ${project.hostnameError}`);
        throw new Error(`Hostname provisioning failed: ${project.hostnameError}`);
      }

      console.log(
        `[ProcessPublishJobUseCase] Hostname status: ${project.hostnameStatus}, waiting... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`
      );

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`Hostname provisioning did not complete within ${maxWaitTime}ms`);
  }

}
