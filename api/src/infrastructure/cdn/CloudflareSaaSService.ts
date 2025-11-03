import Cloudflare from 'cloudflare';

export interface CustomHostnameResult {
  hostnameId: string;
  hostname: string;
  status: string;
  sslStatus: string;
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

    console.log(
      `[CloudflareSaaSService] Initialized for zone ${this.zoneId}, domain ${this.publishDomain}`
    );
  }

  /**
   * Create a custom hostname for a published site
   * SSL certificate provisioning happens asynchronously
   * @param subdomain - Subdomain (e.g., "happy-cloud-42")
   * @returns Custom hostname details
   */
  async createCustomHostname(subdomain: string): Promise<CustomHostnameResult> {
    const hostname = `${subdomain}.${this.publishDomain}`;

    console.log(`[CloudflareSaaSService] Creating custom hostname: ${hostname}`);

    try {
      const response = await this.cf.customHostnames.create({
        zone_id: this.zoneId,
        hostname: hostname,
        ssl: {
          method: 'txt', // TXT validation - will be automated
          type: 'dv', // Domain validated SSL
          settings: {
            http2: 'on',
            min_tls_version: '1.2',
            tls_1_3: 'on',
          },
        },
      });

      console.log(
        `[CloudflareSaaSService] Custom hostname created: ${response.id}, SSL status: ${response.ssl?.status}`
      );

      // Log the full response to see what we're getting
      console.log(`[CloudflareSaaSService] Full response:`, JSON.stringify({
        id: response.id,
        hostname: response.hostname,
        status: response.status,
        ssl: {
          status: response.ssl?.status,
          validation_records: response.ssl?.validation_records,
          validation_errors: response.ssl?.validation_errors,
          method: response.ssl?.method,
          type: response.ssl?.type,
        }
      }, null, 2));

      // Automatically add TXT validation records to DNS
      if (response.ssl?.validation_records && response.ssl.validation_records.length > 0) {
        console.log(`[CloudflareSaaSService] Found ${response.ssl.validation_records.length} validation records`);

        for (const record of response.ssl.validation_records) {
          if (record.txt_name && record.txt_value) {
            console.log(`[CloudflareSaaSService] Creating TXT record: ${record.txt_name} = ${record.txt_value}`);

            try {
              // Create TXT record in DNS
              await this.cf.dns.records.create({
                zone_id: this.zoneId,
                type: 'TXT',
                name: record.txt_name,
                content: record.txt_value,
                ttl: 120, // 2 minutes for faster propagation
                comment: `SSL validation for ${hostname}`,
              });

              console.log(`[CloudflareSaaSService] TXT record created successfully`);
            } catch (dnsError: any) {
              // If record already exists, try to update it
              if (dnsError.status === 409 || dnsError.message?.includes('already exists')) {
                console.log(`[CloudflareSaaSService] TXT record exists, updating...`);

                // List existing records to find the one to update
                const existingRecords = await this.cf.dns.records.list({
                  zone_id: this.zoneId,
                  type: 'TXT',
                  name: record.txt_name,
                });

                if (existingRecords.result && existingRecords.result.length > 0) {
                  const existingRecord = existingRecords.result[0];
                  if (existingRecord.id) {
                    await this.cf.dns.records.update(existingRecord.id, {
                      zone_id: this.zoneId,
                      type: 'TXT',
                      name: record.txt_name,
                      content: record.txt_value,
                      ttl: 120,
                      comment: `SSL validation for ${hostname}`,
                    });
                    console.log(`[CloudflareSaaSService] TXT record updated successfully`);
                  }
                }
              } else {
                console.error(`[CloudflareSaaSService] Failed to create TXT record:`, dnsError);
              }
            }
          }
        }

        console.log(`[CloudflareSaaSService] TXT validation records added, SSL should activate in 30-60 seconds`);
      } else {
        console.log(`[CloudflareSaaSService] No validation records found in initial response`);
        console.log(`[CloudflareSaaSService] SSL status is: ${response.ssl?.status}`);

        // If status is initializing, we might need to poll for validation records
        if (response.ssl?.status === 'initializing' || response.ssl?.status === 'pending_validation') {
          console.log(`[CloudflareSaaSService] Will check for validation records in a moment...`);

          // Wait a bit for initialization
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Get the updated status with validation records
          try {
            const updatedStatus = await this.getCustomHostnameStatus(response.id);
            console.log(`[CloudflareSaaSService] Updated status:`, JSON.stringify(updatedStatus, null, 2));

            // Check for validation records in the updated response
            const fullHostnameData = await this.cf.customHostnames.get(response.id, {
              zone_id: this.zoneId,
            });

            console.log(`[CloudflareSaaSService] Full hostname data after polling:`, JSON.stringify({
              id: fullHostnameData.id,
              ssl_status: fullHostnameData.ssl?.status,
              validation_records: fullHostnameData.ssl?.validation_records,
              ssl: fullHostnameData.ssl,
            }, null, 2));

            // Try to add TXT records if we found them now
            if (fullHostnameData.ssl?.validation_records && fullHostnameData.ssl.validation_records.length > 0) {
              console.log(`[CloudflareSaaSService] Found validation records after polling!`);

              for (const record of fullHostnameData.ssl.validation_records) {
                if (record.txt_name && record.txt_value) {
                  console.log(`[CloudflareSaaSService] Creating TXT record: ${record.txt_name} = ${record.txt_value}`);

                  try {
                    // Create TXT record in DNS
                    await this.cf.dns.records.create({
                      zone_id: this.zoneId,
                      type: 'TXT',
                      name: record.txt_name,
                      content: record.txt_value,
                      ttl: 120,
                      comment: `SSL validation for ${hostname}`,
                    });

                    console.log(`[CloudflareSaaSService] TXT record created successfully`);
                  } catch (dnsError: any) {
                    console.error(`[CloudflareSaaSService] Failed to create TXT record:`, dnsError);
                  }
                }
              }
            }

            // Also create the DNS record for the subdomain itself
            await this.createSubdomainDNSRecord(hostname);
          } catch (pollError) {
            console.error(`[CloudflareSaaSService] Failed to poll for validation records:`, pollError);

            // Still try to create the DNS record even if TXT validation fails
            try {
              await this.createSubdomainDNSRecord(hostname);
            } catch (dnsError) {
              console.error(`[CloudflareSaaSService] Failed to create subdomain DNS record:`, dnsError);
            }
          }
        } else {
          // If not initializing/pending_validation, still create the DNS record
          try {
            await this.createSubdomainDNSRecord(hostname);
          } catch (dnsError) {
            console.error(`[CloudflareSaaSService] Failed to create subdomain DNS record:`, dnsError);
          }
        }
      }

      return {
        hostnameId: response.id,
        hostname: response.hostname,
        status: response.status || 'pending',
        sslStatus: response.ssl?.status || 'pending',
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
    console.log(`[CloudflareSaaSService] Creating DNS record for subdomain: ${hostname}`);

    try {
      // Check if record already exists
      const existingRecords = await this.cf.dns.records.list({
        zone_id: this.zoneId,
        name: hostname,
      });

      if (existingRecords.result && existingRecords.result.length > 0) {
        console.log(`[CloudflareSaaSService] DNS record already exists for ${hostname}`);
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

      console.log(`[CloudflareSaaSService] DNS record created successfully for ${hostname}`);
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
    console.log(`[CloudflareSaaSService] Getting status for hostname: ${hostnameId}`);

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
    console.log(`[CloudflareSaaSService] Deleting custom hostname: ${hostnameId}`);

    try {
      await this.cf.customHostnames.delete(hostnameId, {
        zone_id: this.zoneId,
      });

      console.log(`[CloudflareSaaSService] Custom hostname deleted: ${hostnameId}`);
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
   * Create a wildcard custom hostname for all subdomains
   * This only needs to be done once per environment
   * Example: *.dev.huskystudio.app
   * @returns Custom hostname details
   */
  async createWildcardHostname(): Promise<CustomHostnameResult> {
    const hostname = `*.${this.publishDomain}`;

    console.log(`[CloudflareSaaSService] Creating wildcard custom hostname: ${hostname}`);

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

      console.log(
        `[CloudflareSaaSService] Wildcard hostname created: ${response.id}, SSL status: ${response.ssl?.status}`
      );

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

    console.log(`[CloudflareSaaSService] Checking for existing wildcard hostname: ${wildcardHostname}`);

    try {
      // List all custom hostnames and find the wildcard one
      const response = await this.cf.customHostnames.list({
        zone_id: this.zoneId,
        hostname: wildcardHostname,
      });

      if (response.result && response.result.length > 0) {
        const existing = response.result[0];
        console.log(`[CloudflareSaaSService] Found existing wildcard hostname: ${existing.id}`);
        return {
          hostnameId: existing.id,
          hostname: existing.hostname,
          status: existing.status || 'active',
          sslStatus: existing.ssl?.status || 'active',
        };
      }

      // Wildcard hostname doesn't exist, create it
      console.log(`[CloudflareSaaSService] Wildcard hostname not found, creating...`);
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

    console.log(
      `[CloudflareSaaSService] Waiting for SSL activation for hostname: ${hostnameId}`
    );

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getCustomHostnameStatus(hostnameId);

      if (status.sslStatus === 'active') {
        console.log(
          `[CloudflareSaaSService] SSL activated for hostname: ${hostnameId} (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`
        );
        return;
      }

      if (status.sslStatus === 'failed') {
        throw new Error(`SSL certificate provisioning failed for ${hostnameId}`);
      }

      console.log(
        `[CloudflareSaaSService] SSL status: ${status.sslStatus}, waiting... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`
      );

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

    console.log(
      `[CloudflareSaaSService] Waiting for DNS resolution and site accessibility: ${url}`
    );

    while (Date.now() - startTime < maxWaitTime) {
      try {
        // Try to fetch the site
        const response = await fetch(url, {
          method: 'HEAD',
          redirect: 'manual', // Don't follow redirects
        });

        // Any response (even 404) means DNS resolved and site is reachable
        if (response) {
          console.log(
            `[CloudflareSaaSService] Site is accessible at ${url} (status: ${response.status}) (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`
          );
          return;
        }
      } catch (error: any) {
        // DNS not resolved yet or connection failed
        const errorType = error.cause?.code || error.message;
        console.log(
          `[CloudflareSaaSService] Site not yet accessible (${errorType}), waiting... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`
        );
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    console.warn(
      `[CloudflareSaaSService] DNS did not resolve within ${maxWaitTime}ms for ${hostname}, but continuing anyway`
    );
    // Don't throw - DNS might resolve later, just log warning
  }
}
