export interface IRoute53Service {
  /**
   * Creates or updates an A record pointing to a CloudFront distribution
   * @param subdomain The subdomain (e.g., 'happy-cloud-42')
   * @param publishDomain The base domain (e.g., 'huskystudio.ai')
   * @param cloudfrontDomain The CloudFront distribution domain (e.g., 'd111111abcdef8.cloudfront.net')
   */
  createOrUpdateRecord(
    subdomain: string,
    publishDomain: string,
    cloudfrontDomain: string
  ): Promise<void>;

  /**
   * Deletes an A record
   * @param subdomain The subdomain (e.g., 'happy-cloud-42')
   * @param publishDomain The base domain (e.g., 'huskystudio.ai')
   * @param cloudfrontDomain The CloudFront distribution domain (needed to delete the exact record)
   */
  deleteRecord(
    subdomain: string,
    publishDomain: string,
    cloudfrontDomain: string
  ): Promise<void>;

  /**
   * Checks if DNS record is propagated and working
   * @param fullDomain The full domain (e.g., 'happy-cloud-42.huskystudio.ai')
   * @returns True if the record is working
   */
  checkDNSPropagation(fullDomain: string): Promise<boolean>;
}
