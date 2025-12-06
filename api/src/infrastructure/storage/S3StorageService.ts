import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand, GetObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { IStorageService, UploadResult } from '../../domain/services/IStorageService';
import fs from "fs";
import path from "path";
import { promisify } from "util";

const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);
const readFile = promisify(fs.readFile);

export class S3StorageService implements IStorageService {
  private s3Client: S3Client;
  private bucketName: string;
  private projectsBucketName: string;
  private publicMediaBucketName: string;
  private publicMediaBaseUrl: string;

  constructor() {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.bucketName = process.env.S3_BUCKET_NAME!;
    this.projectsBucketName = process.env.S3_PROJECTS_BUCKET_NAME!;
    this.publicMediaBucketName = process.env.S3_BUCKET_PUBLIC_MEDIA!;

    if (!this.bucketName || !this.projectsBucketName || !this.publicMediaBucketName) {
      throw new Error(`Missing S3 configuration: S3_BUCKET_NAME=${!!this.bucketName}, S3_PROJECTS_BUCKET_NAME=${!!this.projectsBucketName}, S3_BUCKET_PUBLIC_MEDIA=${!!this.publicMediaBucketName}`);
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error(`Missing AWS credentials: AWS_ACCESS_KEY_ID=${!!accessKeyId}, AWS_SECRET_ACCESS_KEY=${!!secretAccessKey}`);
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });

    // Construct public media base URL (assuming standard S3 URL format)
    this.publicMediaBaseUrl = `https://${this.publicMediaBucketName}.s3.${region}.amazonaws.com`;

    console.log(`S3StorageService initialized with region: ${region}, preview bucket: ${this.bucketName}, projects bucket: ${this.projectsBucketName}, public media bucket: ${this.publicMediaBucketName}`);
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

      const uploadedFiles = await this.uploadDirectory(distPath, `projects/${projectId}/`);
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
      console.log(`[S3StorageService] Dist folder contents: ${distContents.join(', ')}`);

      if (distContents.length === 0) {
        return {
          success: false,
          error: "Dist folder is empty - no files to upload"
        };
      }

      const s3Prefix = `${projectId}/web/v${version}/preview-build/`;
      console.log(`[S3StorageService] Uploading preview from ${distPath} to ${s3Prefix} in bucket ${this.projectsBucketName}`);

      const uploadedFiles = await this.uploadDirectory(
        distPath,
        s3Prefix,
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
      console.log(`[S3StorageService] Dist folder contents: ${distContents.join(', ')}`);

      if (distContents.length === 0) {
        return {
          success: false,
          error: "Dist folder is empty - no files to upload"
        };
      }

      const s3Prefix = `${projectId}/web/v${version}/production-build/`;
      console.log(`[S3StorageService] Uploading production from ${distPath} to ${s3Prefix} in bucket ${this.projectsBucketName}`);

      const uploadedFiles = await this.uploadDirectory(
        distPath,
        s3Prefix,
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
    s3Prefix: string, 
    bucketName?: string,
    excludeFolders?: string[]
  ): Promise<string[]> {
    const bucket = bucketName || this.bucketName;
    const uploadedFiles: string[] = [];

    const uploadFile = async (filePath: string, key: string) => {
      const fileContent = await readFile(filePath);
      const contentType = this.getContentType(filePath);

      const command = new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: fileContent,
        ContentType: contentType,
      });

      await this.s3Client.send(command);
      uploadedFiles.push(key);
      console.log(`[S3StorageService] Uploaded file: ${key}`);
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

    await uploadDirRecursive(localDir, s3Prefix);
    console.log(`[S3StorageService] Upload completed. Total files uploaded: ${uploadedFiles.length}`);
    if (uploadedFiles.length > 0) {
      console.log(`[S3StorageService] First few uploaded files: ${uploadedFiles.slice(0, 3).join(', ')}`);
    }
    return uploadedFiles;
  }

  private async getBucketWebsiteUrl(projectId: string): Promise<string> {

    const previewBaseUrl = process.env.APP_PREVIEW_BASE_URL;
    if (!previewBaseUrl) {
      throw new Error('Missing APP_PREVIEW_BASE_URL setting');
    }

    return `${previewBaseUrl}/projects/${projectId}/`;
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
    };

    return contentTypes[ext] || 'application/octet-stream';
  }

  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    await this.s3Client.send(command);
  }

  async deleteFolder(prefix: string): Promise<void> {
    // Delete from preview bucket
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const listResult = await this.s3Client.send(listCommand);

    if (listResult.Contents && listResult.Contents.length > 0) {
      const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key! }));

      while (objectsToDelete.length > 0) {
        const batch = objectsToDelete.splice(0, 1000);

        const deleteCommand = new DeleteObjectsCommand({
          Bucket: this.bucketName,
          Delete: {
            Objects: batch,
          },
        });

        await this.s3Client.send(deleteCommand);
      }
    }

    // Delete from projects bucket (extract project ID from prefix and use new structure)
    const projectId = prefix.replace('projects/', '').replace(/\/$/, '');
    const projectsPrefix = `${projectId}/web/`;

    const projectsListCommand = new ListObjectsV2Command({
      Bucket: this.projectsBucketName,
      Prefix: projectsPrefix,
    });

    const projectsListResult = await this.s3Client.send(projectsListCommand);

    if (projectsListResult.Contents && projectsListResult.Contents.length > 0) {
      const projectsToDelete = projectsListResult.Contents.map(obj => ({ Key: obj.Key! }));

      while (projectsToDelete.length > 0) {
        const batch = projectsToDelete.splice(0, 1000);

        const deleteProjectsCommand = new DeleteObjectsCommand({
          Bucket: this.projectsBucketName,
          Delete: {
            Objects: batch,
          },
        });

        await this.s3Client.send(deleteProjectsCommand);
      }
    }
  }

  async generatePresignedUploadUrl(key: string, mimeType: string, expiresIn: number, bucket?: string): Promise<string> {
    const targetBucket = bucket || this.bucketName;

    const command = new PutObjectCommand({
      Bucket: targetBucket,
      Key: key,
      ContentType: mimeType,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    console.log(`[S3StorageService] Generated presigned upload URL for ${key} in bucket ${targetBucket}, expires in ${expiresIn}s`);

    return signedUrl;
  }

  async generatePresignedDownloadUrl(key: string, expiresIn: number, bucket?: string): Promise<string> {
    const targetBucket = bucket || this.bucketName;

    const command = new GetObjectCommand({
      Bucket: targetBucket,
      Key: key,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    console.log(`[S3StorageService] Generated presigned download URL for ${key} in bucket ${targetBucket}, expires in ${expiresIn}s`);

    return signedUrl;
  }

  async verifyFileExists(key: string, bucket?: string): Promise<boolean> {
    const targetBucket = bucket || this.bucketName;

    try {
      const command = new HeadObjectCommand({
        Bucket: targetBucket,
        Key: key,
      });

      await this.s3Client.send(command);
      console.log(`[S3StorageService] File exists: ${key} in bucket ${targetBucket}`);
      return true;
    } catch (error) {
      console.log(`[S3StorageService] File does not exist: ${key} in bucket ${targetBucket}`);
      return false;
    }
  }

  async copyToPublicBucket(sourceKey: string, sourceBucket: string, projectId: string): Promise<{ publicKey: string; publicUrl: string }> {
    try {
      // Extract filename from source key
      const filename = path.basename(sourceKey);

      // Construct public key: <project_id>/<filename>
      const publicKey = `${projectId}/${filename}`;

      // Copy object from source bucket to public media bucket
      // Note: ACL not used - bucket should have a public access policy instead
      const command = new CopyObjectCommand({
        Bucket: this.publicMediaBucketName,
        CopySource: `${sourceBucket}/${sourceKey}`,
        Key: publicKey,
      });

      await this.s3Client.send(command);

      // Construct public URL
      const publicUrl = `${this.publicMediaBaseUrl}/${publicKey}`;

      console.log(`[S3StorageService] Copied ${sourceKey} from ${sourceBucket} to public bucket as ${publicKey}`);
      console.log(`[S3StorageService] Public URL: ${publicUrl}`);

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

      await this.s3Client.send(command);
      console.log(`[S3StorageService] Deleted ${key} from public media bucket`);
    } catch (error) {
      throw new Error(`Failed to delete file from public bucket: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteMediaFile(key: string, bucket: string): Promise<void> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: key,
      });

      await this.s3Client.send(command);
      console.log(`[S3StorageService] Deleted media file ${key} from bucket ${bucket}`);
    } catch (error) {
      throw new Error(`Failed to delete media file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async deleteVersion(projectId: string, version: number): Promise<void> {
    try {
      const versionPrefix = `${projectId}/web/v${version}/`;
      console.log(`[S3StorageService] Deleting version ${version} from ${this.projectsBucketName} with prefix: ${versionPrefix}`);

      const listCommand = new ListObjectsV2Command({
        Bucket: this.projectsBucketName,
        Prefix: versionPrefix,
      });

      const listResult = await this.s3Client.send(listCommand);

      if (listResult.Contents && listResult.Contents.length > 0) {
        const objectsToDelete = listResult.Contents.map(obj => ({ Key: obj.Key! }));
        console.log(`[S3StorageService] Found ${objectsToDelete.length} files to delete for version ${version}`);

        // Delete in batches of 1000 (S3 limit)
        while (objectsToDelete.length > 0) {
          const batch = objectsToDelete.splice(0, 1000);

          const deleteCommand = new DeleteObjectsCommand({
            Bucket: this.projectsBucketName,
            Delete: {
              Objects: batch,
            },
          });

          await this.s3Client.send(deleteCommand);
        }
        console.log(`[S3StorageService] Successfully deleted version ${version} files from S3`);
      } else {
        console.log(`[S3StorageService] No files found to delete for version ${version}`);
      }
    } catch (error) {
      // Log error but don't throw - per requirements, continue with warning if S3 deletion fails
      console.error(`[S3StorageService] Warning: Failed to delete version ${version} from S3:`, error instanceof Error ? error.message : 'Unknown error');
    }
  }

  async copyVersionToPreview(projectId: string, version: number): Promise<string> {
    try {
      const sourcePrefix = `${projectId}/web/v${version}/preview-build/`;
      const destPrefix = `projects/${projectId}/`;
      console.log(`[S3StorageService] Copying version ${version} to preview - from ${sourcePrefix} to ${destPrefix}`);

      // List all files in the preview-build folder
      const listCommand = new ListObjectsV2Command({
        Bucket: this.projectsBucketName,
        Prefix: sourcePrefix,
      });

      const listResult = await this.s3Client.send(listCommand);

      if (!listResult.Contents || listResult.Contents.length === 0) {
        throw new Error(`No files found in version ${version} preview-build folder`);
      }

      console.log(`[S3StorageService] Found ${listResult.Contents.length} files to copy for version ${version}`);

      // Copy each file to the preview bucket
      for (const obj of listResult.Contents) {
        if (!obj.Key) continue;

        // Calculate relative path (remove source prefix)
        const relativePath = obj.Key.substring(sourcePrefix.length);
        const destKey = `${destPrefix}${relativePath}`;

        // Copy object from projects bucket to preview bucket
        const copyCommand = new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.projectsBucketName}/${obj.Key}`,
          Key: destKey,
          ContentType: this.getContentType(obj.Key),
        });

        await this.s3Client.send(copyCommand);
        console.log(`[S3StorageService] Copied ${obj.Key} to ${destKey}`);
      }

      const previewUrl = await this.getBucketWebsiteUrl(projectId);
      console.log(`[S3StorageService] Successfully copied version ${version} to preview: ${previewUrl}`);
      return previewUrl;
    } catch (error) {
      throw new Error(`Failed to copy version ${version} to preview: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getPublicUrl(key: string): Promise<string> {
    return `${this.publicMediaBaseUrl}/${key}`;
  }

  /**
   * Upload a thumbnail screenshot to S3
   * @param projectId The project ID
   * @param version The build version number
   * @param buffer The screenshot image buffer (PNG, compressed)
   * @returns The S3 key of the uploaded thumbnail (not a URL)
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

      await this.s3Client.send(command);
      console.log(`[S3StorageService] Uploaded thumbnail: ${key}`);

      // Return just the key - presigned URL will be generated when fetching
      return key;
    } catch (error) {
      throw new Error(`Failed to upload thumbnail: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a presigned URL for a thumbnail
   * @param thumbnailKey The S3 key of the thumbnail
   * @param expiresIn Expiration time in seconds (default: 1 hour)
   * @returns Presigned URL for the thumbnail
   */
  async getThumbnailPresignedUrl(thumbnailKey: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.projectsBucketName,
      Key: thumbnailKey,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn });
    return signedUrl;
  }
}