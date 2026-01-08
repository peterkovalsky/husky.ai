import {
  CloudFrontClient,
  CreateDistributionCommand,
  GetDistributionCommand,
  DeleteDistributionCommand,
  GetDistributionConfigCommand,
  UpdateDistributionCommand,
  CreateOriginAccessControlCommand,
  ViewerProtocolPolicy,
  SSLSupportMethod,
  MinimumProtocolVersion,
  ItemSelection,
  Method,
  OriginAccessControlOriginTypes,
  OriginAccessControlSigningBehaviors,
  OriginAccessControlSigningProtocols,
} from '@aws-sdk/client-cloudfront';
import { ICloudFrontService, CloudFrontDistribution } from '../../domain/services/ICloudFrontService';

export class CloudFrontService implements ICloudFrontService {
  private client: CloudFrontClient;
  private publishBucketName: string;
  private acmCertificateArn: string;

  constructor() {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.publishBucketName = process.env.S3_BUCKET_PUBLISHED_APPS!;
    this.acmCertificateArn = process.env.ACM_CERTIFICATE_ARN!;

    if (!this.publishBucketName) {
      throw new Error('Missing S3_BUCKET_PUBLISHED_APPS environment variable');
    }

    if (!this.acmCertificateArn) {
      throw new Error('Missing ACM_CERTIFICATE_ARN environment variable');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('Missing AWS credentials');
    }

    this.client = new CloudFrontClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    console.log(`CloudFrontService initialized with publish bucket: ${this.publishBucketName}`);
  }

  private async createOriginAccessControl(projectId: string): Promise<string> {
    const oacConfig = {
      Name: `OAC-${projectId}-${Date.now()}`,
      Description: `Origin Access Control for project ${projectId}`,
      OriginAccessControlConfig: {
        Name: `OAC-${projectId}-${Date.now()}`,
        Description: `Origin Access Control for project ${projectId}`,
        SigningProtocol: OriginAccessControlSigningProtocols.sigv4,
        SigningBehavior: OriginAccessControlSigningBehaviors.always,
        OriginAccessControlOriginType: OriginAccessControlOriginTypes.s3,
      },
    };

    try {
      const command = new CreateOriginAccessControlCommand(oacConfig);
      const response = await this.client.send(command);
      console.log(`Created Origin Access Control: ${response.OriginAccessControl!.Id}`);
      return response.OriginAccessControl!.Id!;
    } catch (error) {
      throw new Error(
        `Failed to create Origin Access Control: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async createDistribution(
    projectId: string,
    subdomain: string,
    publishDomain: string
  ): Promise<CloudFrontDistribution> {
    const fullDomain = `${subdomain}.${publishDomain}`;
    const originDomain = `${this.publishBucketName}.s3.${process.env.AWS_REGION}.amazonaws.com`;
    const originPath = `/${projectId}/web`;

    // Create Origin Access Control for secure S3 access
    const oacId = await this.createOriginAccessControl(projectId);

    const distributionConfig = {
      CallerReference: `${projectId}-${Date.now()}`,
      Comment: `Distribution for project ${projectId}`,
      Enabled: true,
      Origins: {
        Quantity: 1,
        Items: [
          {
            Id: `S3-${projectId}`,
            DomainName: originDomain,
            OriginPath: originPath,
            S3OriginConfig: {
              OriginAccessIdentity: '', // Required field but empty when using OAC
            },
            OriginAccessControlId: oacId, // Use OAC for secure private bucket access
          },
        ],
      },
      DefaultRootObject: 'index.html',
      DefaultCacheBehavior: {
        TargetOriginId: `S3-${projectId}`,
        ViewerProtocolPolicy: ViewerProtocolPolicy.redirect_to_https,
        AllowedMethods: {
          Quantity: 2,
          Items: [Method.GET, Method.HEAD],
          CachedMethods: {
            Quantity: 2,
            Items: [Method.GET, Method.HEAD],
          },
        },
        ForwardedValues: {
          QueryString: false,
          Cookies: {
            Forward: ItemSelection.none,
          },
          Headers: {
            Quantity: 0,
          },
        },
        MinTTL: 0,
        DefaultTTL: 0,
        MaxTTL: 0,
        Compress: true,
        TrustedSigners: {
          Enabled: false,
          Quantity: 0,
        },
      },
      CustomErrorResponses: {
        Quantity: 1,
        Items: [
          {
            ErrorCode: 404,
            ResponseCode: '200',
            ResponsePagePath: '/index.html',
            ErrorCachingMinTTL: 0,
          },
        ],
      },
      Aliases: {
        Quantity: 1,
        Items: [fullDomain],
      },
      ViewerCertificate: {
        ACMCertificateArn: this.acmCertificateArn,
        SSLSupportMethod: SSLSupportMethod.sni_only,
        MinimumProtocolVersion: MinimumProtocolVersion.TLSv1_2_2021,
      },
    };

    const command = new CreateDistributionCommand({
      DistributionConfig: distributionConfig,
    });

    try {
      const response = await this.client.send(command);
      const distribution = response.Distribution!;

      console.log(
        `Created CloudFront distribution ${distribution.Id} for ${fullDomain} with OAC ${oacId}`
      );
      console.log(
        `IMPORTANT: Ensure S3 bucket ${this.publishBucketName} has the correct bucket policy to allow CloudFront OAC access`
      );

      return {
        distributionId: distribution.Id!,
        domain: distribution.DomainName!,
        status: distribution.Status as 'InProgress' | 'Deployed',
      };
    } catch (error) {
      throw new Error(
        `Failed to create CloudFront distribution: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async getDistributionStatus(
    distributionId: string
  ): Promise<'InProgress' | 'Deployed'> {
    const command = new GetDistributionCommand({
      Id: distributionId,
    });

    try {
      const response = await this.client.send(command);
      return response.Distribution!.Status as 'InProgress' | 'Deployed';
    } catch (error) {
      throw new Error(
        `Failed to get distribution status: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  async deleteDistribution(distributionId: string): Promise<void> {
    try {
      // First, get the distribution config to get the ETag
      const getConfigCommand = new GetDistributionConfigCommand({
        Id: distributionId,
      });

      const configResponse = await this.client.send(getConfigCommand);
      const config = configResponse.DistributionConfig!;
      const etag = configResponse.ETag!;

      // If distribution is enabled, we need to disable it first
      if (config.Enabled) {
        config.Enabled = false;

        const updateCommand = new UpdateDistributionCommand({
          Id: distributionId,
          DistributionConfig: config,
          IfMatch: etag,
        });

        await this.client.send(updateCommand);

        console.log(
          `Disabled CloudFront distribution ${distributionId}, waiting for deployment...`
        );

        // Wait for distribution to be deployed before deletion
        await this.waitForDeployment(distributionId);
      }

      // Get fresh ETag after update
      const freshConfigResponse = await this.client.send(getConfigCommand);
      const freshEtag = freshConfigResponse.ETag!;

      // Now delete the distribution
      const deleteCommand = new DeleteDistributionCommand({
        Id: distributionId,
        IfMatch: freshEtag,
      });

      await this.client.send(deleteCommand);
      console.log(`Deleted CloudFront distribution ${distributionId}`);
    } catch (error) {
      throw new Error(
        `Failed to delete CloudFront distribution: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`
      );
    }
  }

  private async waitForDeployment(
    distributionId: string,
    maxWaitTime: number = 600000 // 10 minutes
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 10000; // 10 seconds

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getDistributionStatus(distributionId);

      if (status === 'Deployed') {
        return;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(
      `Distribution ${distributionId} did not deploy within ${maxWaitTime}ms`
    );
  }
}
