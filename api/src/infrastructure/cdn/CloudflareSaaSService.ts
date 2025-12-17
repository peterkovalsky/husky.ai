import Cloudflare from 'cloudflare';

export interface TXTValidationRecord {
  txt_name: string;
  txt_value: string;
}

export interface CustomHostnameResult {
  hostnameId: string;
  hostname: string;
  status: string;
  sslStatus: string;
  validationRecords?: TXTValidationRecord[];
}

/**
 * Service for managing custom hostnames via Cloudflare for SaaS
 * This replaces AWS CloudFront distributions for published sites
 */
export class CloudflareSaaSService {
  private cf: Cloudflare;
  private zoneId: string;
  private publishDomain: string;

  constructor() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.zoneId = process.env.CLOUDFLARE_ZONE_ID!;
    this.publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';

    if (!apiToken || !this.zoneId) {
      throw new Error(
        `Missing Cloudflare configuration: apiToken=${!!apiToken}, zoneId=${!!this.zoneId}`
      );
    }

    this.cf = new Cloudflare({
      apiToken,
    });
  }

  /**
   * Create a custom hostname for a published site or custom domain
   * SSL certificate provisioning happens asynchronously
   * @param hostnameOrSubdomain - Full hostname (e.g., "www.example.com") or subdomain (e.g., "happy-cloud-42")
   * @param projectId - Project ID to store in custom metadata
   * @param environment - Environment (dev/prod) to determine which R2 bucket to use
   * @returns Custom hostname details
   */
  async createCustomHostname(
    hostnameOrSubdomain: string,
    projectId?: string,
    environment: 'dev' | 'prod' = 'dev'
  ): Promise<CustomHostnameResult> {
    // Determine if this is a custom domain or a project subdomain
    // Custom domains have dots and don't end with our publish domain
    // Project subdomains are just the name (e.g., "happy-cloud-42")
    const isCustomDomain = hostnameOrSubdomain.includes('.') &&
                           !hostnameOrSubdomain.endsWith(this.publishDomain);

    const hostname = isCustomDomain
      ? hostnameOrSubdomain
      : hostnameOrSubdomain.includes('.')
        ? hostnameOrSubdomain  // Already has publish domain
        : `${hostnameOrSubdomain}.${this.publishDomain}`;  // Append publish domain

    let response;
    let isDuplicate = false;

    // Determine R2 bucket name based on environment
    const bucketName = environment === 'prod'
      ? process.env.R2_BUCKET_NAME_PROD || 'husky-app-previews'
      : process.env.R2_BUCKET_NAME || 'dev-husky-app-previews';

    try {
      response = await this.cf.customHostnames.create({
        zone_id: this.zoneId,
        hostname: hostname,
        ssl: {
          method: 'http', // HTTP validation - automatic for non-wildcard domains
          type: 'dv', // Domain validated SSL
          settings: {
            http2: 'on',
            min_tls_version: '1.2',
            tls_1_3: 'on',
          },
        },
        // Add custom metadata for the worker to use
        custom_metadata: projectId ? {
          project_id: projectId,
          environment: environment,
          bucket: bucketName,
        } as any : undefined,
      });
    } catch (createError: any) {
      // Handle duplicate hostname - fetch existing one instead
      if (createError.status === 409) {
        try {
          // List custom hostnames to find the existing one
          const listResponse = await this.cf.customHostnames.list({
            zone_id: this.zoneId,
            hostname: hostname,
          });

          if (listResponse.result && listResponse.result.length > 0) {
            response = listResponse.result[0];
            isDuplicate = true;
          } else {
            throw new Error(`Custom hostname exists but could not be found for ${hostname}`);
          }
        } catch (listError) {
          console.error(`[CloudflareSaaSService] Failed to list existing custom hostname:`, listError);
          throw createError;
        }
      } else {
        throw createError;
      }
    }

    try {
      // For our own subdomains (not custom domains), create DNS record to point to fallback origin
      // This allows the subdomain to be proxied through Cloudflare
      if (!isCustomDomain) {
        try {
          await this.createSubdomainDNSRecord(hostname);
        } catch (dnsError) {
          // Don't fail the whole operation if DNS record creation fails
        }
      }

      return {
        hostnameId: response.id,
        hostname: response.hostname,
        status: response.status || 'pending',
        sslStatus: response.ssl?.status || 'pending',
        // No validation records with HTTP method!
      };
    } catch (error) {
      console.error(`[CloudflareSaaSService] Failed to create custom hostname:`, error);
      throw new Error(`Failed to create custom hostname for ${hostname}`);
    }
  }

  /**
   * Create DNS record for subdomain to point to Cloudflare
   * This is required for the custom hostname to resolve
   * @param hostname - Full hostname (e.g., "rich-cove-955.dev.huskystudio.app")
   */
  private async createSubdomainDNSRecord(hostname: string): Promise<void> {
    try {
      // Check if record already exists
      const existingRecords = await this.cf.dns.records.list({
        zone_id: this.zoneId,
        name: hostname,
      });

      if (existingRecords.result && existingRecords.result.length > 0) {
        return;
      }

      // Create proxied CNAME record pointing to fallback origin
      // The proxy status ensures traffic goes through Cloudflare's network
      await this.cf.dns.records.create({
        zone_id: this.zoneId,
        type: 'CNAME',
        name: hostname,
        content: `fallback.${this.publishDomain}`, // Points to fallback origin
        proxied: true, // MUST be proxied for Custom Hostnames to work
        ttl: 1, // Auto when proxied
        comment: `Custom hostname for Cloudflare for SaaS`,
      });
    } catch (error) {
      console.error(`[CloudflareSaaSService] Failed to create DNS record:`, error);
      throw error;
    }
  }

  /**
   * Get status of a custom hostname
   * Useful for polling SSL certificate provisioning status
   * @param hostnameId - Custom hostname ID
   * @returns Hostname status
   */
  async getCustomHostnameStatus(hostnameId: string): Promise<CustomHostnameResult> {
    try {
      const response = await this.cf.customHostnames.get(hostnameId, {
        zone_id: this.zoneId,
      });

      return {
        hostnameId: response.id,
        hostname: response.hostname,
        status: response.status || 'pending',
        sslStatus: response.ssl?.status || 'pending',
      };
    } catch (error) {
      console.error(`[CloudflareSaaSService] Failed to get hostname status:`, error);
      throw new Error(`Failed to get status for hostname ${hostnameId}`);
    }
  }

  /**
   * Delete a custom hostname
   * @param hostnameId - Custom hostname ID
   */
  async deleteCustomHostname(hostnameId: string): Promise<void> {
    try {
      await this.cf.customHostnames.delete(hostnameId, {
        zone_id: this.zoneId,
      });
    } catch (error) {
      console.error(`[CloudflareSaaSService] Failed to delete custom hostname:`, error);
      throw new Error(`Failed to delete hostname ${hostnameId}`);
    }
  }

  /**
   * Check if SSL certificate is active
   * @param hostnameId - Custom hostname ID
   * @returns True if SSL is active, false otherwise
   */
  async isSSLActive(hostnameId: string): Promise<boolean> {
    const status = await this.getCustomHostnameStatus(hostnameId);
    return status.sslStatus === 'active';
  }

  /**
   * Get validation records for a custom hostname
   * @param hostnameId - Custom hostname ID
   * @returns Validation records if available
   */
  async getValidationRecords(hostnameId: string): Promise<TXTValidationRecord[]> {
    try {
      const response = await this.cf.customHostnames.get(hostnameId, {
        zone_id: this.zoneId,
      });

      if (response.ssl?.validation_records && response.ssl.validation_records.length > 0) {
        const records: TXTValidationRecord[] = response.ssl.validation_records
          .filter((r: any) => r.txt_name && r.txt_value)
          .map((r: any) => ({
            txt_name: r.txt_name,
            txt_value: r.txt_value
          }));

        return records;
      }

      return [];
    } catch (error) {
      console.error(`[CloudflareSaaSService] Failed to get validation records:`, error);
      throw new Error(`Failed to get validation records for hostname ${hostnameId}`);
    }
  }

  /**
   * Create a wildcard custom hostname for all subdomains
   * This only needs to be done once per environment
   * Example: *.dev.huskystudio.app
   * @returns Custom hostname details
   */
  async createWildcardHostname(): Promise<CustomHostnameResult> {
    const hostname = `*.${this.publishDomain}`;

    try {
      const response = await this.cf.customHostnames.create({
        zone_id: this.zoneId,
        hostname: hostname,
        ssl: {
          method: 'http',
          type: 'dv',
          settings: {
            http2: 'on',
            min_tls_version: '1.2',
            tls_1_3: 'on',
          },
          wildcard: true, // Enable wildcard SSL
        },
      });

      return {
        hostnameId: response.id,
        hostname: response.hostname,
        status: response.status || 'pending',
        sslStatus: response.ssl?.status || 'pending',
      };
    } catch (error) {
      console.error(`[CloudflareSaaSService] Failed to create wildcard hostname:`, error);
      throw new Error(`Failed to create wildcard hostname for ${hostname}`);
    }
  }

  /**
   * Get or create wildcard custom hostname
   * Checks if wildcard hostname exists, creates it if not
   * @returns Custom hostname details
   */
  async ensureWildcardHostname(): Promise<CustomHostnameResult> {
    const wildcardHostname = `*.${this.publishDomain}`;

    try {
      // List all custom hostnames and find the wildcard one
      const response = await this.cf.customHostnames.list({
        zone_id: this.zoneId,
        hostname: wildcardHostname,
      });

      if (response.result && response.result.length > 0) {
        const existing = response.result[0];
        return {
          hostnameId: existing.id,
          hostname: existing.hostname,
          status: existing.status || 'active',
          sslStatus: existing.ssl?.status || 'active',
        };
      }

      // Wildcard hostname doesn't exist, create it
      return await this.createWildcardHostname();
    } catch (error) {
      console.error(`[CloudflareSaaSService] Failed to ensure wildcard hostname:`, error);
      throw new Error(`Failed to ensure wildcard hostname for ${wildcardHostname}`);
    }
  }

  /**
   * Wait for SSL certificate to become active
   * @param hostnameId - Custom hostname ID
   * @param maxWaitTime - Maximum time to wait in milliseconds (default 5 minutes)
   * @param pollInterval - Polling interval in milliseconds (default 10 seconds)
   */
  async waitForSSLActivation(
    hostnameId: string,
    maxWaitTime: number = 300000, // 5 minutes
    pollInterval: number = 10000 // 10 seconds
  ): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getCustomHostnameStatus(hostnameId);

      if (status.sslStatus === 'active') {
        return;
      }

      if (status.sslStatus === 'failed') {
        throw new Error(`SSL certificate provisioning failed for ${hostnameId}`);
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `SSL certificate did not activate within ${maxWaitTime}ms for ${hostnameId}`
    );
  }

  /**
   * Wait for DNS to resolve and site to become accessible
   * @param hostname - Full hostname (e.g., "rich-cove-955.dev.huskystudio.app")
   * @param maxWaitTime - Maximum time to wait in milliseconds (default 2 minutes)
   * @param pollInterval - Polling interval in milliseconds (default 5 seconds)
   */
  async waitForDNSResolution(
    hostname: string,
    maxWaitTime: number = 120000, // 2 minutes
    pollInterval: number = 5000 // 5 seconds
  ): Promise<void> {
    const startTime = Date.now();
    const url = `https://${hostname}`;

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Try to fetch the site
        const response = await fetch(url, {
          method: 'HEAD',
          redirect: 'manual', // Don't follow redirects
        });

        // Any response (even 404) means DNS resolved and site is reachable
        if (response) {
          return;
        }
      } catch {
        // DNS not resolved yet or connection failed, continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    // Don't throw - DNS might resolve later
  }
}
