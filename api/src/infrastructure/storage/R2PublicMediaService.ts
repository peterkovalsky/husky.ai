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
 */
export class R2PublicMediaService implements IPublicMediaStorageService {
  private r2Client: S3Client;
  private s3Client: S3Client;
  private bucketName: string;
  private publicBaseUrl: string;

  constructor() {
    // R2 Configuration
    const r2Endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const r2AccessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const r2SecretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.CLOUDFLARE_R2_PUBLIC_MEDIA_BUCKET!;
    this.publicBaseUrl = process.env.R2_PUBLIC_MEDIA_BASE_URL!;

    // S3 Configuration (for reading source files)
    const awsRegion = process.env.AWS_REGION;
    const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !this.bucketName || !this.publicBaseUrl) {
      throw new Error(
        `Missing R2 public media configuration: endpoint=${!!r2Endpoint}, accessKeyId=${!!r2AccessKeyId}, secretAccessKey=${!!r2SecretAccessKey}, bucketName=${!!this.bucketName}, publicBaseUrl=${!!this.publicBaseUrl}`
      );
    }

    if (!awsRegion || !awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error(
        `Missing AWS S3 configuration: region=${!!awsRegion}, accessKeyId=${!!awsAccessKeyId}, secretAccessKey=${!!awsSecretAccessKey}`
      );
    }

    // R2 is S3-compatible - use AWS S3 SDK
    this.r2Client = new S3Client({
      region: 'auto', // R2 uses 'auto' as the region
      endpoint: r2Endpoint,
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey,
      },
    });

    // S3 client for reading source files
    this.s3Client = new S3Client({
      region: awsRegion,
      credentials: {
        accessKeyId: awsAccessKeyId,
        secretAccessKey: awsSecretAccessKey,
      },
    });

    console.log(
      `[R2PublicMediaService] Initialized with bucket: ${this.bucketName}, baseUrl: ${this.publicBaseUrl}`
    );
  }

  /**
   * Copy a file from S3 to R2 public media bucket
   */
  async copyFromS3ToR2(
    sourceKey: string,
    sourceBucket: string,
    projectId: string
  ): Promise<{ publicKey: string; publicUrl: string }> {
    console.log(
      `[R2PublicMediaService] Copying from S3 ${sourceBucket}/${sourceKey} to R2 ${this.bucketName}`
    );

    // Get file from S3
    const getCommand = new GetObjectCommand({
      Bucket: sourceBucket,
      Key: sourceKey,
    });

    const s3Object = await this.s3Client.send(getCommand);
    const fileContent = await this.streamToBuffer(s3Object.Body as NodeJS.ReadableStream);

    // Generate destination key: projectId/filename
    const fileName = path.basename(sourceKey);
    const destKey = `${projectId}/${fileName}`;

    // Upload to R2
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
