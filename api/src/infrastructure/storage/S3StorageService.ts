import { S3Client, PutObjectCommand, ListObjectsV2Command, DeleteObjectCommand, DeleteObjectsCommand } from "@aws-sdk/client-s3";
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

  constructor() {
    const region = process.env.AWS_REGION;
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

    this.bucketName = process.env.S3_BUCKET_NAME!;
    this.projectsBucketName = process.env.S3_PROJECTS_BUCKET_NAME!;

    if (!this.bucketName || !this.projectsBucketName) {
      throw new Error(`Missing S3 configuration: S3_BUCKET_NAME=${!!this.bucketName}, S3_PROJECTS_BUCKET_NAME=${!!this.projectsBucketName}`);
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

    console.log(`S3StorageService initialized with region: ${region}, preview bucket: ${this.bucketName}, projects bucket: ${this.projectsBucketName}`);
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

      const s3Prefix = `${projectId}/web/v${version}/build/`;
      console.log(`[S3StorageService] Uploading from ${distPath} to ${s3Prefix} in bucket ${this.projectsBucketName}`);

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
}