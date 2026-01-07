import Cloudflare from 'cloudflare';

/**
 * Service for managing subdomain → project ID mappings in Cloudflare KV
 * This allows the Worker to look up which project to serve for a given subdomain
 */
export class CloudflareKVService {
  private cf: Cloudflare;
  private accountId: string;
  private namespaceId: string;

  constructor() {
    const apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID!;
    this.namespaceId = process.env.CLOUDFLARE_KV_NAMESPACE_ID!;

    if (!apiToken || !this.accountId || !this.namespaceId) {
      throw new Error(
        `Missing Cloudflare KV configuration: apiToken=${!!apiToken}, accountId=${!!this.accountId}, namespaceId=${!!this.namespaceId}`
      );
    }

    this.cf = new Cloudflare({
      apiToken,
    });

    console.log(
      `[CloudflareKVService] Initialized with namespace: ${this.namespaceId}`
    );
  }

  /**
   * Map a subdomain to a project ID in KV
   * Worker uses this to look up which project to serve
   * @param subdomain - Subdomain (e.g., "rich-cove-955")
   * @param projectId - Project ID
   */
  async setSubdomainMapping(subdomain: string, projectId: string): Promise<void> {
    console.log(`[CloudflareKVService] Mapping subdomain ${subdomain} → project ${projectId}`);

    try {
      await this.cf.kv.namespaces.values.update(
        this.namespaceId,
        subdomain,
        {
          account_id: this.accountId,
          value: projectId,
          metadata: '{}',
        }
      );

      console.log(`[CloudflareKVService] Successfully mapped ${subdomain} → ${projectId}`);
    } catch (error) {
      console.error(`[CloudflareKVService] Failed to set subdomain mapping:`, error);
      throw new Error(`Failed to map subdomain ${subdomain} to project ${projectId}`);
    }
  }

  /**
   * Set a generic key-value mapping in KV
   * Used for storing ACME validation tokens and other data
   * @param key - Key to store
   * @param value - Value to store
   */
  async setMapping(key: string, value: string): Promise<void> {
    console.log(`[CloudflareKVService] Setting KV mapping: ${key}`);

    try {
      await this.cf.kv.namespaces.values.update(
        this.namespaceId,
        key,
        {
          account_id: this.accountId,
          value: value,
          metadata: '{}',
        }
      );

      console.log(`[CloudflareKVService] Successfully set KV mapping for ${key}`);
    } catch (error) {
      console.error(`[CloudflareKVService] Failed to set KV mapping:`, error);
      throw new Error(`Failed to set KV mapping for ${key}`);
    }
  }

  /**
   * Delete subdomain mapping from KV
   * @param subdomain - Subdomain to remove
   */
  async deleteSubdomainMapping(subdomain: string): Promise<void> {
    console.log(`[CloudflareKVService] Deleting subdomain mapping for ${subdomain}`);

    try {
      await this.cf.kv.namespaces.values.delete(
        this.namespaceId,
        subdomain,
        {
          account_id: this.accountId,
        }
      );

      console.log(`[CloudflareKVService] Successfully deleted mapping for ${subdomain}`);
    } catch (error) {
      console.error(`[CloudflareKVService] Failed to delete subdomain mapping:`, error);
      // Don't throw - unpublishing should succeed even if KV deletion fails
    }
  }

  /**
   * Get project ID for a subdomain
   * @param subdomain - Subdomain to look up
   * @returns Project ID or null if not found
   */
  async getProjectId(subdomain: string): Promise<string | null> {
    try {
      const response = await this.cf.kv.namespaces.values.get(
        this.namespaceId,
        subdomain,
        {
          account_id: this.accountId,
        }
      );

      const result = await response.text();
      return result || null;
    } catch (error) {
      console.error(`[CloudflareKVService] Failed to get project ID for ${subdomain}:`, error);
      return null;
    }
  }
}
