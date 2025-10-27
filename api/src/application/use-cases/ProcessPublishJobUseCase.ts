import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { ICloudFrontService } from '../../domain/services/ICloudFrontService';
import { IRoute53Service } from '../../domain/services/IRoute53Service';
import { PublishingStatus } from '../../domain/entities/Project';
import { S3Client, ListObjectsV2Command, CopyObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export class ProcessPublishJobUseCase {
  private s3Client: S3Client;
  private projectsBucketName: string;
  private publishBucketName: string;
  private publishDomain: string;

  constructor(
    private projectRepository: IProjectRepository,
    private storageService: IStorageService,
    private cloudFrontService: ICloudFrontService,
    private route53Service: IRoute53Service
  ) {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.projectsBucketName = process.env.S3_PROJECTS_BUCKET_NAME!;
    this.publishBucketName = process.env.S3_BUCKET_PUBLISHED_APPS!;
    this.publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';

    if (!this.projectsBucketName || !this.publishBucketName) {
      throw new Error('Missing S3 bucket configuration');
    }

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
      console.log(`[ProcessPublishJobUseCase] Starting publish for project ${projectId}`);

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

      // Step 1: Copy production build from projects bucket to publish bucket
      console.log(`[ProcessPublishJobUseCase] Copying production build to publish bucket`);
      await this.copyProductionBuild(projectId, project.currentVersion);

      // Step 2: Create or update CloudFront distribution
      console.log(`[ProcessPublishJobUseCase] Setting up CloudFront distribution`);
      let distributionId = project.cloudfrontDistributionId;
      let cloudfrontDomain = project.cloudfrontDomain;

      if (!distributionId) {
        // First time publishing - create new distribution
        const distribution = await this.cloudFrontService.createDistribution(
          projectId,
          project.subdomain,
          this.publishDomain
        );

        distributionId = distribution.distributionId;
        cloudfrontDomain = distribution.domain;

        // Save CloudFront details
        await this.projectRepository.updateCloudFrontDetails(
          projectId,
          distributionId,
          cloudfrontDomain
        );
      }

      // Step 3: Create/update Route53 record
      console.log(`[ProcessPublishJobUseCase] Setting up DNS record`);
      await this.route53Service.createOrUpdateRecord(
        project.subdomain,
        this.publishDomain,
        cloudfrontDomain!
      );

      // Step 4: Wait for CloudFront distribution to deploy
      console.log(`[ProcessPublishJobUseCase] Waiting for CloudFront deployment`);
      await this.waitForCloudFrontDeployment(distributionId);

      // Step 5: Update project status to PUBLISHED
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.PUBLISHED);
      await this.projectRepository.setPublishedAt(projectId, new Date());
      await this.projectRepository.updatePublishingError(projectId, null);

      console.log(
        `[ProcessPublishJobUseCase] Successfully published project ${projectId} at ${project.subdomain}.${this.publishDomain}`
      );
    } catch (error) {
      console.error(`[ProcessPublishJobUseCase] Failed to publish project ${projectId}:`, error);

      // Update status to FAILED and store error message
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.FAILED);
      await this.projectRepository.updatePublishingError(
        projectId,
        error instanceof Error ? error.message : 'Unknown error'
      );

      throw error;
    }
  }

  private async copyProductionBuild(projectId: string, version: number): Promise<void> {
    const sourcePath = `${projectId}/web/v${version}/production-build/`;
    const destPath = `${projectId}/web/`;

    // First, delete existing files in destination (for republishing)
    await this.deleteS3Folder(this.publishBucketName, destPath);

    // List all files in source
    const listCommand = new ListObjectsV2Command({
      Bucket: this.projectsBucketName,
      Prefix: sourcePath,
    });

    const listResult = await this.s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      throw new Error(`No production build found at ${sourcePath}`);
    }

    // Copy each file
    for (const object of listResult.Contents) {
      if (!object.Key) continue;

      const fileName = object.Key.replace(sourcePath, '');
      const destKey = `${destPath}${fileName}`;

      const copyCommand = new CopyObjectCommand({
        Bucket: this.publishBucketName,
        CopySource: `${this.projectsBucketName}/${object.Key}`,
        Key: destKey,
      });

      await this.s3Client.send(copyCommand);
      console.log(`[ProcessPublishJobUseCase] Copied ${object.Key} to ${destKey}`);
    }

    console.log(
      `[ProcessPublishJobUseCase] Copied ${listResult.Contents.length} files to publish bucket`
    );
  }

  private async deleteS3Folder(bucket: string, prefix: string): Promise<void> {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
    });

    const listResult = await this.s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      return; // Nothing to delete
    }

    const objectsToDelete = listResult.Contents.map((obj) => ({ Key: obj.Key! }));

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: bucket,
      Delete: {
        Objects: objectsToDelete,
      },
    });

    await this.s3Client.send(deleteCommand);
    console.log(`[ProcessPublishJobUseCase] Deleted ${objectsToDelete.length} files from ${prefix}`);
  }

  private async waitForCloudFrontDeployment(
    distributionId: string,
    maxWaitTime: number = 900000 // 15 minutes
  ): Promise<void> {
    const startTime = Date.now();
    const pollInterval = 30000; // 30 seconds

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.cloudFrontService.getDistributionStatus(distributionId);

      if (status === 'Deployed') {
        console.log(`[ProcessPublishJobUseCase] CloudFront distribution deployed`);
        return;
      }

      console.log(
        `[ProcessPublishJobUseCase] Waiting for deployment... (${Math.floor((Date.now() - startTime) / 1000)}s elapsed)`
      );
      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    throw new Error(`CloudFront distribution did not deploy within ${maxWaitTime}ms`);
  }
}
