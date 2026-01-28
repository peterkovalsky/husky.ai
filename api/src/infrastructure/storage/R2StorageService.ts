import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IStorageService, UploadResult } from '../../domain/services/IStorageService';
import fs from "fs";
import path from "path";
import { promisify } from "util";

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

/**
 * Service for managing storage in Cloudflare R2
 * R2 is S3-compatible, so we use the AWS S3 SDK
 *
 * Buckets:
 * - Preview bucket: For live app previews during development (public)
 * - Projects bucket: For source code, versioned builds, thumbnails, media (private, presigned URLs)
 * - Public media bucket: For AI-referenced media (public, custom domain)
 */
export class R2StorageService implements IStorageService {
  private r2Client: S3Client;
  private previewBucketName: string;
  private projectsBucketName: string;
  private publicMediaBucketName: string;
  private publicMediaBaseUrl: string;
  private previewBaseUrl: string;

  constructor() {
    const endpoint = process.env.CLOUDFLARE_R2_ENDPOINT;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

    this.previewBucketName = process.env.CLOUDFLARE_R2_PREVIEW_BUCKET!;
    this.projectsBucketName = process.env.CLOUDFLARE_R2_PROJECTS_BUCKET!;
    this.publicMediaBucketName = process.env.CLOUDFLARE_R2_PUBLIC_MEDIA_BUCKET!;
    this.publicMediaBaseUrl = process.env.R2_PUBLIC_MEDIA_BASE_URL!;
    this.previewBaseUrl = process.env.R2_PREVIEW_BASE_URL!;

    if (!endpoint || !accessKeyId || !secretAccessKey) {
      throw new Error(
        `Missing R2 credentials: endpoint=${!!endpoint}, accessKeyId=${!!accessKeyId}, secretAccessKey=${!!secretAccessKey}`
      );
    }

    if (!this.previewBucketName || !this.projectsBucketName || !this.publicMediaBucketName) {
      throw new Error(
        `Missing R2 bucket configuration: previewBucket=${!!this.previewBucketName}, projectsBucket=${!!this.projectsBucketName}, publicMediaBucket=${!!this.publicMediaBucketName}`
      );
    }

    if (!this.publicMediaBaseUrl || !this.previewBaseUrl) {
      throw new Error(
        `Missing R2 public URL configuration: publicMediaBaseUrl=${!!this.publicMediaBaseUrl}, previewBaseUrl=${!!this.previewBaseUrl}`
      );
    }

    // R2 is S3-compatible - use AWS S3 SDK with R2 endpoint
    this.r2Client = new S3Client({
      region: 'auto', // R2 requires 'auto' as the region
      endpoint: endpoint,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    console.log(`[R2StorageService] Initialized with preview bucket: ${this.previewBucketName}, projects bucket: ${this.projectsBucketName}, public media bucket: ${this.publicMediaBucketName}`);
  }

  async uploadReactApp(appDirectory: string, promptId: string, projectId: string): Promise<UploadResult> {
    try {
      const distPath = path.join(appDirectory, "dist");

      if (!fs.existsSync(distPath)) {
        return {
          success: false,
          error: "No dist folder found - build may have failed"
        };
      }

      const uploadedFiles = await this.uploadDirectory(distPath, `projects/${projectId}/`, this.previewBucketName);
      const previewUrl = await this.getBucketWebsiteUrl(projectId);

      return {
        success: true,
        previewUrl,
        uploadedFiles
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  async uploadSourceCode(appDirectory: string, projectId: string, version: number): Promise<UploadResult> {
    try {
      const uploadedFiles = await this.uploadDirectory(
        appDirectory,
        `${projectId}/web/v${version}/source/`,
        this.projectsBucketName,
        ['dist', 'node_modules']
      );

      return {
        success: true,
        uploadedFiles
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  async uploadPreviewVersion(appDirectory: string, projectId: string, version: number): Promise<UploadResult> {
    try {
      const distPath = path.join(appDirectory, "dist");

      if (!fs.existsSync(distPath)) {
        return {
          success: false,
          error: "No dist folder found for preview upload"
        };
      }

      // Check if dist folder has contents
      const distContents = fs.readdirSync(distPath);
      console.log(`[R2StorageService] Dist folder contents: ${distContents.join(', ')}`);

      if (distContents.length === 0) {
        return {
          success: false,
          error: "Dist folder is empty - no files to upload"
        };
      }

      const r2Prefix = `${projectId}/web/v${version}/preview-build/`;
      console.log(`[R2StorageService] Uploading preview from ${distPath} to ${r2Prefix} in bucket ${this.projectsBucketName}`);

      const uploadedFiles = await this.uploadDirectory(
        distPath,
        r2Prefix,
        this.projectsBucketName
      );

      return {
        success: true,
        uploadedFiles
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  async uploadProductionVersion(appDirectory: string, projectId: string, version: number): Promise<UploadResult> {
    try {
      const distPath = path.join(appDirectory, "dist");

      if (!fs.existsSync(distPath)) {
        return {
          success: false,
          error: "No dist folder found for production upload"
        };
      }

      // Check if dist folder has contents
      const distContents = fs.readdirSync(distPath);
      console.log(`[R2StorageService] Dist folder contents: ${distContents.join(', ')}`);

      if (distContents.length === 0) {
        return {
          success: false,
          error: "Dist folder is empty - no files to upload"
        };
      }

      const r2Prefix = `${projectId}/web/v${version}/production-build/`;
      console.log(`[R2StorageService] Uploading production from ${distPath} to ${r2Prefix} in bucket ${this.projectsBucketName}`);

      const uploadedFiles = await this.uploadDirectory(
        distPath,
        r2Prefix,
        this.projectsBucketName
      );

      return {
        success: true,
        uploadedFiles
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown upload error'
      };
    }
  }

  private async uploadDirectory(
    localDir: string,
    r2Prefix: string,
    bucketName: string,
    excludeFolders?: string[]
  ): Promise<string[]> {
    const uploadedFiles: string[] = [];

    const uploadFile = async (filePath: string, key: string) => {
      const fileContent = await readFile(filePath);
      const contentType = this.getContentType(filePath);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      });

      await this.r2Client.send(command);
      uploadedFiles.push(key);
      console.log(`[R2StorageService] Uploaded file: ${key}`);
    };

    const uploadDirRecursive = async (currentDir: string, currentPrefix: string) => {
      const items = await readdir(currentDir);

      for (const item of items) {
        const itemPath = path.join(currentDir, item);
        const itemStat = await stat(itemPath);

        if (itemStat.isDirectory()) {
          // Skip excluded folders
          if (excludeFolders && excludeFolders.includes(item)) {
            continue;
          }
          await uploadDirRecursive(itemPath, `${currentPrefix}${item}/`);
        } else {
          const key = `${currentPrefix}${item}`;
          await uploadFile(itemPath, key);
        }
      }
    };

    await uploadDirRecursive(localDir, r2Prefix);
    console.log(`[R2StorageService] Upload completed. Total files uploaded: ${uploadedFiles.length}`);
    if (uploadedFiles.length > 0) {
      console.log(`[R2StorageService] First few uploaded files: ${uploadedFiles.slice(0, 3).join(', ')}`);
    }
    return uploadedFiles;
  }

  private async getBucketWebsiteUrl(projectId: string): Promise<string> {
    return `${this.previewBaseUrl}/projects/${projectId}/`;
  }

  private getContentType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const contentTypes: { [key: string]: string } = {
      '.html': 'text/html',
      '.css': 'text/css',
      '.js': 'application/javascript',
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
      '.webp': 'image/webp',
      '.avif': 'image/avif',
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.previewBucketName,
      Key: key,
    });

    await this.r2Client.send(command);
  }

  async deleteFolder(prefix: string): Promise<void> {
    // Delete from preview bucket
    await this.deleteFolderFromBucket(prefix, this.previewBucketName);

    // Delete from projects bucket (extract project ID from prefix and use new structure)
    const projectId = prefix.replace('projects/', '').replace(/\/$/, '');
    const projectsPrefix = `${projectId}/web/`;

    await this.deleteFolderFromBucket(projectsPrefix, this.projectsBucketName);
  }

  private async deleteFolderFromBucket(prefix: string, bucketName: string): Promise<void> {
    const listCommand = new ListObjectsV2Command({
      Bucket: bucketName,
      Prefix: prefix,
    });

    const listResult = await this.r2Client.send(listCommand);

    if (listResult.Contents && listResult.Contents.length > 0) {
      const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key! }));

      while (objectsToDelete.length > 0) {
        const batch = objectsToDelete.splice(0, 1000);

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: batch,
          },
        });

        await this.r2Client.send(deleteCommand);
      }
      console.log(`[R2StorageService] Deleted files with prefix ${prefix} from bucket ${bucketName}`);
    }
  }

  async generatePresignedUploadUrl(key: string, mimeType: string, expiresIn: number, bucket?: string): Promise<string> {
    const targetBucket = this.resolveBucket(bucket);

    const command = new PutObjectCommand({
      Bucket: targetBucket,
      Key: key,
      ContentType: mimeType,
    });

    const signedUrl = await getSignedUrl(this.r2Client, command, { expiresIn });
    console.log(`[R2StorageService] Generated presigned upload URL for ${key} in bucket ${targetBucket}, expires in ${expiresIn}s`);

    return signedUrl;
  }

  async generatePresignedDownloadUrl(key: string, expiresIn: number, bucket?: string): Promise<string> {
    const targetBucket = this.resolveBucket(bucket);

    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(this.r2Client, command, { expiresIn });
    console.log(`[R2StorageService] Generated presigned download URL for ${key} in bucket ${targetBucket}, expires in ${expiresIn}s`);

    return signedUrl;
  }

  /**
   * Resolve bucket name from legacy S3 bucket names to R2 bucket names
   * This maintains backwards compatibility with code that passes old bucket names
   */
  private resolveBucket(bucket?: string): string {
    if (!bucket) {
      return this.previewBucketName;
    }

    // Map legacy S3 bucket names to R2 bucket names
    const legacyPreviewBucket = process.env.S3_BUCKET_NAME;
    const legacyProjectsBucket = process.env.S3_PROJECTS_BUCKET_NAME;
    const legacyPublicMediaBucket = process.env.S3_BUCKET_PUBLIC_MEDIA;

    if (bucket === legacyPreviewBucket) {
      return this.previewBucketName;
    }
    if (bucket === legacyProjectsBucket) {
      return this.projectsBucketName;
    }
    if (bucket === legacyPublicMediaBucket) {
      return this.publicMediaBucketName;
    }

    // If it matches an R2 bucket name, use it directly
    if (bucket === this.previewBucketName || bucket === this.projectsBucketName || bucket === this.publicMediaBucketName) {
      return bucket;
    }

    // Default to projects bucket for unknown bucket names (most common use case)
    console.warn(`[R2StorageService] Unknown bucket name: ${bucket}, defaulting to projects bucket`);
    return this.projectsBucketName;
  }

  async verifyFileExists(key: string, bucket?: string): Promise<boolean> {
    const targetBucket = this.resolveBucket(bucket);

    try {
      const command = new HeadObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      await this.r2Client.send(command);
      console.log(`[R2StorageService] File exists: ${key} in bucket ${targetBucket}`);
      return true;
    } catch (error) {
      console.log(`[R2StorageService] File does not exist: ${key} in bucket ${targetBucket}`);
      return false;
    }
  }

  /**
   * Copy file to public media bucket (within R2)
   * Note: R2 doesn't support CopyObject across buckets, so we download and re-upload
   */
  async copyToPublicBucket(sourceKey: string, sourceBucket: string, projectId: string): Promise<{ publicKey: string; publicUrl: string }> {
    try {
      const resolvedSourceBucket = this.resolveBucket(sourceBucket);

      // Extract filename from source key
      const filename = path.basename(sourceKey);

      // Construct public key: <project_id>/<filename>
      const publicKey = `${projectId}/${filename}`;

      // Download from source bucket
      const getCommand = new GetObjectCommand({
        Bucket: resolvedSourceBucket,
        Key: sourceKey,
      });

      const response = await this.r2Client.send(getCommand);

      if (!response.Body) {
        throw new Error('Empty response body');
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as NodeJS.ReadableStream;
      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }
      const buffer = Buffer.concat(chunks);

      // Upload to public media bucket
      const putCommand = new PutObjectCommand({
        Bucket: this.publicMediaBucketName,
        Key: publicKey,
        Body: buffer,
        ContentType: this.getContentType(sourceKey),
      });

      await this.r2Client.send(putCommand);

      // Construct public URL
      const publicUrl = `${this.publicMediaBaseUrl}/${publicKey}`;

      console.log(`[R2StorageService] Copied ${sourceKey} from ${resolvedSourceBucket} to public bucket as ${publicKey}`);
      console.log(`[R2StorageService] Public URL: ${publicUrl}`);

      return { publicKey, publicUrl };
    } catch (error) {
      throw new Error(`Failed to copy file to public bucket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteFromPublicBucket(key: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.publicMediaBucketName,
        Key: key,
      });

      await this.r2Client.send(command);
      console.log(`[R2StorageService] Deleted ${key} from public media bucket`);
    } catch (error) {
      throw new Error(`Failed to delete file from public bucket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteMediaFile(key: string, bucket: string): Promise<void> {
    try {
      const targetBucket = this.resolveBucket(bucket);

      const command = new DeleteObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      await this.r2Client.send(command);
      console.log(`[R2StorageService] Deleted media file ${key} from bucket ${targetBucket}`);
    } catch (error) {
      throw new Error(`Failed to delete media file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteVersion(projectId: string, version: number): Promise<void> {
    try {
      const versionPrefix = `${projectId}/web/v${version}/`;
      console.log(`[R2StorageService] Deleting version ${version} from ${this.projectsBucketName} with prefix: ${versionPrefix}`);

      await this.deleteFolderFromBucket(versionPrefix, this.projectsBucketName);
      console.log(`[R2StorageService] Successfully deleted version ${version} files from R2`);
    } catch (error) {
      // Log error but don't throw - per requirements, continue with warning if deletion fails
      console.error(`[R2StorageService] Warning: Failed to delete version ${version} from R2:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Copy version from projects bucket (preview-build) to preview bucket
   * Note: R2 doesn't support CopyObject across buckets, so we download and re-upload
   */
  async copyVersionToPreview(projectId: string, version: number): Promise<string> {
    try {
      const sourcePrefix = `${projectId}/web/v${version}/preview-build/`;
      const destPrefix = `projects/${projectId}/`;
      console.log(`[R2StorageService] Copying version ${version} to preview - from ${sourcePrefix} to ${destPrefix}`);

      // List all files in the preview-build folder
      const listCommand = new ListObjectsV2Command({
        Bucket: this.projectsBucketName,
        Prefix: sourcePrefix,
      });

      const listResult = await this.r2Client.send(listCommand);

      if (!listResult.Contents || listResult.Contents.length === 0) {
        throw new Error(`No files found in version ${version} preview-build folder`);
      }

      console.log(`[R2StorageService] Found ${listResult.Contents.length} files to copy for version ${version}`);

      // Copy each file (download from projects bucket, upload to preview bucket)
      for (const obj of listResult.Contents) {
        if (!obj.Key) continue;

        // Download from projects bucket
        const getCommand = new GetObjectCommand({
          Bucket: this.projectsBucketName,
          Key: obj.Key,
        });

        const response = await this.r2Client.send(getCommand);

        if (!response.Body) {
          console.warn(`[R2StorageService] Empty body for ${obj.Key}, skipping`);
          continue;
        }

        // Convert stream to buffer
        const chunks: Uint8Array[] = [];
        const stream = response.Body as NodeJS.ReadableStream;
        for await (const chunk of stream) {
          chunks.push(chunk as Uint8Array);
        }
        const buffer = Buffer.concat(chunks);

        // Calculate relative path (remove source prefix)
        const relativePath = obj.Key.substring(sourcePrefix.length);
        const destKey = `${destPrefix}${relativePath}`;

        // Upload to preview bucket
        const putCommand = new PutObjectCommand({
          Bucket: this.previewBucketName,
          Key: destKey,
          Body: buffer,
          ContentType: this.getContentType(obj.Key),
        });

        await this.r2Client.send(putCommand);
        console.log(`[R2StorageService] Copied ${obj.Key} to ${destKey}`);
      }

      const previewUrl = await this.getBucketWebsiteUrl(projectId);
      console.log(`[R2StorageService] Successfully copied version ${version} to preview: ${previewUrl}`);
      return previewUrl;
    } catch (error) {
      throw new Error(`Failed to copy version ${version} to preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPublicUrl(key: string): Promise<string> {
    return `${this.publicMediaBaseUrl}/${key}`;
  }

  /**
   * Upload a thumbnail screenshot to R2
   * @param projectId The project ID
   * @param version The build version number
   * @param buffer The screenshot image buffer (PNG, compressed)
   * @returns The R2 key of the uploaded thumbnail (not a URL)
   */
  async uploadThumbnail(projectId: string, version: number, buffer: Buffer): Promise<string> {
    const key = `${projectId}/thumbnails/v${version}.png`;

    try {
      const command = new PutObjectCommand({
        Bucket: this.projectsBucketName,
        Key: key,
        Body: buffer,
        ContentType: 'image/png',
      });

      await this.r2Client.send(command);
      console.log(`[R2StorageService] Uploaded thumbnail: ${key}`);

      // Return just the key - presigned URL will be generated when fetching
      return key;
    } catch (error) {
      throw new Error(`Failed to upload thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a presigned URL for a thumbnail
   * @param thumbnailKey The R2 key of the thumbnail
   * @param expiresIn Expiration time in seconds (default: 1 hour)
   * @returns Presigned URL for the thumbnail
   */
  async getThumbnailPresignedUrl(thumbnailKey: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.projectsBucketName,
      Key: thumbnailKey,
    });

    const signedUrl = await getSignedUrl(this.r2Client, command, { expiresIn });
    return signedUrl;
  }

  /**
   * Delete a thumbnail from R2
   * @param projectId The project ID
   * @param version The build version number
   */
  async deleteThumbnail(projectId: string, version: number): Promise<void> {
    const key = `${projectId}/thumbnails/v${version}.png`;

    try {
      const command = new DeleteObjectCommand({
        Bucket: this.projectsBucketName,
        Key: key,
      });

      await this.r2Client.send(command);
      console.log(`[R2StorageService] Deleted thumbnail: ${key}`);
    } catch (error) {
      // Log warning but don't throw - per requirements, continue if deletion fails
      console.warn(`[R2StorageService] Warning: Failed to delete thumbnail ${key}:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  /**
   * Download a file from R2 as a Buffer
   * @param key The R2 key of the file
   * @param bucket Optional bucket name (defaults to preview bucket)
   * @returns The file contents as a Buffer
   */
  async downloadFile(key: string, bucket?: string): Promise<Buffer> {
    const targetBucket = this.resolveBucket(bucket);

    try {
      const command = new GetObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      const response = await this.r2Client.send(command);

      if (!response.Body) {
        throw new Error('Empty response body');
      }

      // Convert the stream to a Buffer
      const chunks: Uint8Array[] = [];
      const stream = response.Body as NodeJS.ReadableStream;

      for await (const chunk of stream) {
        chunks.push(chunk as Uint8Array);
      }

      const buffer = Buffer.concat(chunks);
      console.log(`[R2StorageService] Downloaded file: ${key} (${buffer.length} bytes) from bucket ${targetBucket}`);

      return buffer;
    } catch (error) {
      throw new Error(`Failed to download file ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload a Buffer to R2
   * @param key The R2 key to upload to
   * @param buffer The Buffer to upload
   * @param contentType The MIME type of the content
   * @param bucket Optional bucket name (defaults to preview bucket)
   */
  async uploadBuffer(key: string, buffer: Buffer, contentType: string, bucket?: string): Promise<void> {
    const targetBucket = this.resolveBucket(bucket);

    try {
      const command = new PutObjectCommand({
        Bucket: targetBucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      });

      await this.r2Client.send(command);
      console.log(`[R2StorageService] Uploaded buffer: ${key} (${buffer.length} bytes) to bucket ${targetBucket}`);
    } catch (error) {
      throw new Error(`Failed to upload buffer to ${key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get the R2 client for direct access
   * Used by ProcessPublishJobUseCase to read production builds
   */
  getR2Client(): S3Client {
    return this.r2Client;
  }

  /**
   * Get the projects bucket name
   * Used by ProcessPublishJobUseCase
   */
  getProjectsBucketName(): string {
    return this.projectsBucketName;
  }
}
