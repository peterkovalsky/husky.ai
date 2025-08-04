import { S3Client, PutObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
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
      const previewUrl = `https://${this.bucketName}.s3.amazonaws.com/projects/${projectId}/`;

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
}