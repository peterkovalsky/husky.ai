import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import path from 'path';
import { IPublicMediaStorageService } from '../../domain/services/IPublicMediaStorageService';

/**
 * Service for managing public media in Cloudflare R2
 * R2 is S3-compatible, so we use the AWS S3 SDK
 *
 * Used for storing user-uploaded images that need to be accessible publicly
 * for AI code generation (the AI references these URLs in generated React code)
 *
 * All storage is now on R2 - both source (projects bucket) and destination (public media bucket)
 */
export class R2PublicMediaService implements IPublicMediaStorageService {
  private r2Client: S3Client;
  private bucketName: string;
  private projectsBucketName: string;
  private publicBaseUrl: string;

  constructor() {
    // R2 Configuration
    const r2Endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.CLOUDFLARE_R2_PUBLIC_MEDIA_BUCKET!;
    this.projectsBucketName = process.env.CLOUDFLARE_R2_PROJECTS_BUCKET!;
    this.publicBaseUrl = process.env.R2_PUBLIC_MEDIA_BASE_URL!;

    if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !this.bucketName || !this.publicBaseUrl) {
      throw new Error(
        `Missing R2 public media configuration: endpoint=${!!r2Endpoint}, accessKeyId=${!!r2AccessKeyId}, secretAccessKey=${!!r2SecretAccessKey}, bucketName=${!!this.bucketName}, publicBaseUrl=${!!this.publicBaseUrl}`
      );
    }

    if (!this.projectsBucketName) {
      throw new Error(
        `Missing R2 projects bucket configuration (CLOUDFLARE_R2_PROJECTS_BUCKET)`
      );
    }

    // R2 is S3-compatible - use AWS S3 SDK
    // Single client for all R2 operations (both source and destination buckets)
    this.r2Client = new S3Client({
      region: 'auto', // R2 uses 'auto' as the region
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });

    console.log(
      `[R2PublicMediaService] Initialized with public media bucket: ${this.bucketName}, projects bucket: ${this.projectsBucketName}, baseUrl: ${this.publicBaseUrl}`
    );
  }

  /**
   * Copy a file from R2 projects bucket to R2 public media bucket
   * Note: R2 doesn't support CopyObject across buckets, so we download and re-upload
   */
  async copyFromS3ToR2(
    sourceKey: string,
    sourceBucket: string,
    projectId: string
  ): Promise<{ publicKey: string; publicUrl: string }> {
    // Resolve the source bucket - map legacy S3 bucket names to R2
    const resolvedSourceBucket = this.resolveSourceBucket(sourceBucket);

    console.log(
      `[R2PublicMediaService] Copying from R2 ${resolvedSourceBucket}/${sourceKey} to R2 ${this.bucketName}`
    );

    // Get file from R2 source bucket
    const getCommand = new GetObjectCommand({
      Bucket: resolvedSourceBucket,
      Key: sourceKey,
    });

    const r2Object = await this.r2Client.send(getCommand);
    const fileContent = await this.streamToBuffer(r2Object.Body as NodeJS.ReadableStream);

    // Generate destination key: projectId/filename
    const fileName = path.basename(sourceKey);
    const destKey = `${projectId}/${fileName}`;

    // Upload to R2 public media bucket
    const contentType = this.getContentType(sourceKey);
    const putCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: destKey,
      Body: fileContent,
      ContentType: contentType,
    });

    await this.r2Client.send(putCommand);

    const publicUrl = this.getPublicUrl(destKey);
    console.log(`[R2PublicMediaService] Copied to R2: ${publicUrl}`);

    return {
      publicKey: destKey,
      publicUrl,
    };
  }

  /**
   * Resolve source bucket - maps legacy S3 bucket names to R2 bucket names
   */
  private resolveSourceBucket(bucket: string): string {
    // Map legacy S3 bucket names to R2 bucket names
    const legacyProjectsBucket = process.env.S3_PROJECTS_BUCKET_NAME;

    if (bucket === legacyProjectsBucket) {
      return this.projectsBucketName;
    }

    // If it's already an R2 bucket name, use it directly
    if (bucket === this.projectsBucketName || bucket === this.bucketName) {
      return bucket;
    }

    // Default to projects bucket for unknown bucket names
    console.warn(`[R2PublicMediaService] Unknown source bucket: ${bucket}, defaulting to projects bucket`);
    return this.projectsBucketName;
  }

  /**
   * Upload a buffer directly to R2 public media bucket
   */
  async uploadBuffer(
    buffer: Buffer,
    projectId: string,
    filename: string,
    contentType: string
  ): Promise<{ publicKey: string; publicUrl: string }> {
    const destKey = `${projectId}/${filename}`;

    console.log(`[R2PublicMediaService] Uploading buffer to R2: ${destKey} (${buffer.length} bytes, ${contentType})`);

    const putCommand = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: destKey,
      Body: buffer,
      ContentType: contentType,
    });

    await this.r2Client.send(putCommand);

    const publicUrl = this.getPublicUrl(destKey);
    console.log(`[R2PublicMediaService] Uploaded to R2: ${publicUrl}`);

    return {
      publicKey: destKey,
      publicUrl,
    };
  }

  /**
   * Delete a file from R2 public media bucket
   */
  async deleteFile(key: string): Promise<void> {
    console.log(`[R2PublicMediaService] Deleting file: ${key}`);

    const deleteCommand = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.r2Client.send(deleteCommand);
    console.log(`[R2PublicMediaService] Deleted file: ${key}`);
  }

  /**
   * Get the public URL for a given key
   */
  getPublicUrl(key: string): string {
    // Remove leading slash if present
    const cleanKey = key.startsWith('/') ? key.slice(1) : key;
    return `${this.publicBaseUrl}/${cleanKey}`;
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.webp': 'image/webp',
      '.ico': 'image/x-icon',
      '.bmp': 'image/bmp',
      '.tiff': 'image/tiff',
      '.avif': 'image/avif',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  /**
   * Convert stream to buffer
   */
  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }
}
