import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import path from 'path';

/**
 * Service for managing published apps in Cloudflare R2
 * R2 is S3-compatible, so we use the AWS S3 SDK
 */
export class R2PublishedAppsService {
  private r2Client: S3Client;
  private bucketName: string;

  constructor() {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME!;

    if (!endpoint || !accessKeyId || !secretAccessKey || !this.bucketName) {
      throw new Error(
        `Missing R2 configuration: endpoint=${!!endpoint}, accessKeyId=${!!accessKeyId}, secretAccessKey=${!!secretAccessKey}, bucketName=${!!this.bucketName}`
      );
    }

    // R2 is S3-compatible - use AWS S3 SDK
    this.r2Client = new S3Client({
      region: 'auto', // R2 uses 'auto' as the region
      endpoint: endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    console.log(
      `[R2PublishedAppsService] Initialized with bucket: ${this.bucketName}`
    );
  }

  /**
   * Copy production build from S3 projects bucket to R2
   * @param s3Client - S3 client to read from S3
   * @param s3ProjectsBucket - S3 projects bucket name
   * @param projectId - Project ID
   * @param version - Version number to copy
   */
  async copyProductionBuildFromS3(
    s3Client: S3Client,
    s3ProjectsBucket: string,
    projectId: string,
    version: number
  ): Promise<void> {
    const sourcePath = `${projectId}/web/v${version}/production-build/`;
    const destPath = `${projectId}/web/`;

    console.log(
      `[R2PublishedAppsService] Copying from S3 ${s3ProjectsBucket}/${sourcePath} to R2 ${this.bucketName}/${destPath}`
    );

    // First, delete existing files in R2 (for republish scenario)
    await this.deleteFolder(destPath);

    // List all files in S3 source
    const listCommand = new ListObjectsV2Command({
      Bucket: s3ProjectsBucket,
      Prefix: sourcePath,
    });

    const listResult = await s3Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      throw new Error(
        `No production build found at S3 ${s3ProjectsBucket}/${sourcePath}`
      );
    }

    // Copy each file from S3 to R2
    const copyPromises = listResult.Contents.map(async (object) => {
      if (!object.Key) return;

      // Get file from S3
      const getCommand = new GetObjectCommand({
        Bucket: s3ProjectsBucket,
        Key: object.Key,
      });

      const s3Object = await s3Client.send(getCommand);
      const fileContent = await this.streamToBuffer(s3Object.Body as any);

      // Determine destination key (remove version path)
      // Example: project-id/web/v1/production-build/index.html → project-id/web/index.html
      const fileName = object.Key.replace(sourcePath, '');
      const destKey = `${destPath}${fileName}`;

      // Upload to R2
      await this.uploadFile(destKey, fileContent, object.Key);

      console.log(`[R2PublishedAppsService] Copied ${object.Key} to R2 ${destKey}`);
    });

    await Promise.all(copyPromises);

    console.log(
      `[R2PublishedAppsService] Successfully copied ${listResult.Contents.length} files to R2`
    );
  }

  /**
   * Upload a file to R2
   */
  async uploadFile(key: string, body: Buffer, originalKey?: string): Promise<void> {
    const contentType = this.getContentType(originalKey || key);

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: body,
      ContentType: contentType,
    });

    await this.r2Client.send(command);
  }

  /**
   * Delete a folder (all objects with prefix) from R2
   */
  async deleteFolder(folderPath: string): Promise<void> {
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: folderPath,
    });

    const listResult = await this.r2Client.send(listCommand);

    if (!listResult.Contents || listResult.Contents.length === 0) {
      console.log(`[R2PublishedAppsService] No files to delete at ${folderPath}`);
      return;
    }

    const objectsToDelete = listResult.Contents.map((obj) => ({ Key: obj.Key! }));

    const deleteCommand = new DeleteObjectsCommand({
      Bucket: this.bucketName,
      Delete: {
        Objects: objectsToDelete,
      },
    });

    await this.r2Client.send(deleteCommand);
    console.log(
      `[R2PublishedAppsService] Deleted ${objectsToDelete.length} files from R2 ${folderPath}`
    );
  }

  /**
   * Get content type based on file extension
   */
  private getContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.html': 'text/html',
      '.js': 'application/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject',
      '.otf': 'font/otf',
      '.webp': 'image/webp',
      '.xml': 'application/xml',
      '.txt': 'text/plain',
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
