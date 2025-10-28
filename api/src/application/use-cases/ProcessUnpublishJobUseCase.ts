import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { ICloudFrontService } from '../../domain/services/ICloudFrontService';
import { IRoute53Service } from '../../domain/services/IRoute53Service';
import { PublishingStatus } from '../../domain/entities/Project';
import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';

export class ProcessUnpublishJobUseCase {
  private s3Client: S3Client;
  private publishBucketName: string;
  private publishDomain: string;

  constructor(
    private projectRepository: IProjectRepository,
    private cloudFrontService: ICloudFrontService,
    private route53Service: IRoute53Service
  ) {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.publishBucketName = process.env.S3_BUCKET_PUBLISHED_APPS!;
    this.publishDomain = process.env.PUBLISH_DOMAIN || 'huskystudio.ai';

    if (!this.publishBucketName) {
      throw new Error('Missing S3_BUCKET_PUBLISHED_APPS environment variable');
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
      console.log(`[ProcessUnpublishJobUseCase] Starting unpublish for project ${projectId}`);

      // Get project details
      const project = await this.projectRepository.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      // Step 1: Delete Route53 record
      if (project.subdomain && project.cloudfrontDomain) {
        console.log(`[ProcessUnpublishJobUseCase] Deleting DNS record`);
        try {
          await this.route53Service.deleteRecord(
            project.subdomain,
            this.publishDomain,
            project.cloudfrontDomain
          );
        } catch (error) {
          console.warn(
            `[ProcessUnpublishJobUseCase] Failed to delete Route53 record (may not exist):`,
            error
          );
        }
      }

      // Step 2: Delete CloudFront distribution
      if (project.cloudfrontDistributionId) {
        console.log(`[ProcessUnpublishJobUseCase] Deleting CloudFront distribution`);
        try {
          await this.cloudFrontService.deleteDistribution(project.cloudfrontDistributionId);
        } catch (error) {
          console.warn(
            `[ProcessUnpublishJobUseCase] Failed to delete CloudFront distribution (may not exist):`,
            error
          );
        }
      }

      // Step 3: Delete published files from S3
      console.log(`[ProcessUnpublishJobUseCase] Deleting published files from S3`);
      await this.deletePublishedFiles(projectId);

      // Step 4: Update project status
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.UNPUBLISHED);
      await this.projectRepository.setPublishedAt(projectId, null);
      await this.projectRepository.setPublishedVersion(projectId, null);
      await this.projectRepository.updateCloudFrontDetails(projectId, '', '');
      await this.projectRepository.updatePublishingError(projectId, null);

      console.log(`[ProcessUnpublishJobUseCase] Successfully unpublished project ${projectId}`);
    } catch (error) {
      console.error(`[ProcessUnpublishJobUseCase] Failed to unpublish project ${projectId}:`, error);

      // Update status to FAILED and store generic error message
      await this.projectRepository.updatePublishingStatus(projectId, PublishingStatus.FAILED);
      await this.projectRepository.updatePublishingError(
        projectId,
        'An error occurred while unpublishing your project. Please try again.'
      );

      throw error;
    }
  }

  private async deletePublishedFiles(projectId: string): Promise<void> {
    const prefix = `${projectId}/web/`;

    const listCommand = new ListObjectsV2Command({
      Bucket: this.publishBucketName,
      Prefix: prefix,
    });

    const listResult = await this.s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`[ProcessUnpublishJobUseCase] No files to delete in ${prefix}`);
      return;
    }

    const objectsToDelete = listResult.Contents.map((obj) => ({ Key: obj.Key! }));

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: this.publishBucketName,
      Delete: {
        Objects: objectsToDelete,
      },
    });

    await this.s3Client.send(deleteCommand);
    console.log(
      `[ProcessUnpublishJobUseCase] Deleted ${objectsToDelete.length} files from publish bucket`
    );
  }
}
