export interface CloudFrontDistribution {
  distributionId: string;
  domain: string; // The *.cloudfront.net domain
  status: 'InProgress' | 'Deployed';
}

export interface ICloudFrontService {
  /**
   * Creates a CloudFront distribution for the published project
   * @param projectId The project ID
   * @param subdomain The subdomain for the alternate domain name (e.g., 'happy-cloud-42')
   * @param publishDomain The base domain (e.g., 'huskystudio.ai' or 'dev.huskystudio.ai')
   * @returns The distribution details
   */
  createDistribution(
    projectId: string,
    subdomain: string,
    publishDomain: string
  ): Promise<CloudFrontDistribution>;

  /**
   * Gets the status of a CloudFront distribution
   * @param distributionId The distribution ID
   * @returns The distribution status
   */
  getDistributionStatus(distributionId: string): Promise<'InProgress' | 'Deployed'>;

  /**
   * Deletes a CloudFront distribution
   * @param distributionId The distribution ID
   */
  deleteDistribution(distributionId: string): Promise<void>;
}
