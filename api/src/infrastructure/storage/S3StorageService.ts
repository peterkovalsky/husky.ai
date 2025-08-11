import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand, GetBucketWebsiteCommand } from "@aws-sdk/client-s3";
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
  private versionsBucketName: string;

  constructor() {
    const region = process.env.AWS_REGION || 'us-east-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    
    this.bucketName = process.env.S3_BUCKET_NAME!;
    this.versionsBucketName = process.env.S3_VERSIONS_BUCKET_NAME!;

    if (!this.bucketName || !this.versionsBucketName) {
      throw new Error(`Missing S3 configuration: S3_BUCKET_NAME=${!!this.bucketName}, S3_VERSIONS_BUCKET_NAME=${!!this.versionsBucketName}`);
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

    console.log(`S3StorageService initialized with region: ${region}, buckets: ${this.bucketName}, ${this.versionsBucketName}`);
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
        `${projectId}/v${version}/source/`,
        this.versionsBucketName
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

      const uploadedFiles = await this.uploadDirectory(
        distPath, 
        `${projectId}/v${version}/production/`,
        this.versionsBucketName
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
    bucketName?: string
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
    };

    const uploadDirRecursive = async (currentDir: string, currentPrefix: string) => {
      const items = await readdir(currentDir);

      for (const item of items) {
        const itemPath = path.join(currentDir, item);
        const itemStat = await stat(itemPath);

        if (itemStat.isDirectory()) {
          await uploadDirRecursive(itemPath, `${currentPrefix}${item}/`);
        } else {
          const key = `${currentPrefix}${item}`;
          await uploadFile(itemPath, key);
        }
      }
    };

    await uploadDirRecursive(localDir, s3Prefix);
    return uploadedFiles;
  }

  private async getBucketWebsiteUrl(projectId: string): Promise<string> {
    try {
      const command = new GetBucketWebsiteCommand({
        Bucket: this.bucketName,
      });

      const response = await this.s3Client.send(command);
      
      // Get the region from the S3 client configuration
      const region = process.env.AWS_REGION || 'us-east-1';
      
      // Construct the static website URL
      const websiteUrl = `http://${this.bucketName}.s3-website-${region}.amazonaws.com/projects/${projectId}/`;
      
      return websiteUrl;
    } catch (error) {
      console.warn('Failed to get bucket website configuration, falling back to object URL:', error);
      // Fallback to the standard S3 object URL if website hosting is not configured
      return `https://${this.bucketName}.s3.amazonaws.com/projects/${projectId}/`;
    }
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
    // List all objects with the given prefix
    const listCommand = new ListObjectsV2Command({
      Bucket: this.bucketName,
      Prefix: prefix,
    });

    const listResult = await this.s3Client.send(listCommand);
    
    if (!listResult.Contents || listResult.Contents.length === 0) {
      return; // No objects to delete
    }

    // Delete objects in batches (S3 allows up to 1000 objects per delete request)
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

    // Also check versions bucket if we have objects there
    const versionsListCommand = new ListObjectsV2Command({
      Bucket: this.versionsBucketName,
      Prefix: prefix,
    });

    const versionsListResult = await this.s3Client.send(versionsListCommand);
    
    if (versionsListResult.Contents && versionsListResult.Contents.length > 0) {
      const versionsToDelete = versionsListResult.Contents.map(obj => ({ Key: obj.Key! }));
      
      while (versionsToDelete.length > 0) {
        const batch = versionsToDelete.splice(0, 1000);
        
        const deleteVersionsCommand = new DeleteObjectsCommand({
          Bucket: this.versionsBucketName,
          Delete: {
            Objects: batch,
          },
        });

        await this.s3Client.send(deleteVersionsCommand);
      }
    }
  }
}