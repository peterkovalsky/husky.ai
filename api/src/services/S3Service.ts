import { S3Client, PutObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const readFile = promisify(fs.readFile);
const readdir = promisify(fs.readdir);
const stat = promisify(fs.stat);

export interface UploadResult {
  success: boolean;
  previewUrl?: string;
  error?: string;
  uploadedFiles?: string[];
}

export class S3Service {
  private client: S3Client;
  private bucketName: string;
  private bucketRegion: string;

  constructor(bucketName?: string) {
    this.bucketRegion = process.env.AWS_REGION || 'us-east-1';
    this.client = new S3Client({
      region: this.bucketRegion,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || ''
      }
    });
    
    this.bucketName = bucketName || process.env.S3_BUCKET_NAME || '';
    
    if (!this.bucketName) {
      throw new Error('S3 Bucket name is required. Set S3_BUCKET_NAME environment variable.');
    }
  }

  private getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: Record<string, string> = {
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
      '.txt': 'text/plain',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.eot': 'application/vnd.ms-fontobject'
    };
    
    return mimeTypes[ext] || 'application/octet-stream';
  }

  private async uploadFile(localPath: string, s3Key: string): Promise<void> {
    try {
      const fileContent = await readFile(localPath);
      const mimeType = this.getMimeType(localPath);
      
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: mimeType
      });

      await this.client.send(command);
    } catch (error) {
      console.error(`Error uploading file ${localPath} to S3:`, error);
      throw error;
    }
  }

  private async uploadDirectoryRecursive(
    localDir: string, 
    s3Prefix: string, 
    uploadedFiles: string[]
  ): Promise<void> {
    const files = await readdir(localDir);
    
    for (const file of files) {
      const localPath = path.join(localDir, file);
      const fileStat = await stat(localPath);
      
      if (fileStat.isDirectory()) {
        // Recursively upload subdirectory
        const newPrefix = s3Prefix ? `${s3Prefix}/${file}` : file;
        await this.uploadDirectoryRecursive(
          localPath, 
          newPrefix, 
          uploadedFiles
        );
      } else {
        // Upload file
        const s3Key = s3Prefix ? `${s3Prefix}/${file}` : file;
        await this.uploadFile(localPath, s3Key);
        uploadedFiles.push(s3Key);
      }
    }
  }

  async uploadReactApp(appDirectory: string, jobId: string): Promise<UploadResult> {
    try {
      // Check if dist directory exists
      const distPath = path.join(appDirectory, 'dist');
      if (!fs.existsSync(distPath)) {
        return {
          success: false,
          error: 'Build directory (dist) not found. Make sure the React app was built successfully.'
        };
      }

      // Upload to root of bucket (no prefix)
      const uploadedFiles: string[] = [];

      // Upload all files from the dist directory to bucket root
      await this.uploadDirectoryRecursive(distPath, '', uploadedFiles);

      // Generate S3 static website URL
      const previewUrl = `http://${this.bucketName}.s3-website-${this.bucketRegion}.amazonaws.com`;

      return {
        success: true,
        previewUrl,
        uploadedFiles
      };
    } catch (error) {
      console.error('Error uploading React app to S3:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred during upload'
      };
    }
  }

  async listAppFiles(jobId: string): Promise<string[]> {
    try {
      // List all files in bucket since we upload to root
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName
      });

      const response = await this.client.send(command);
      return (response.Contents || []).map(obj => obj.Key!);
    } catch (error) {
      console.error('Error listing app files from S3:', error);
      throw new Error(`Failed to list app files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  generatePreviewUrl(jobId: string): string {
    return `http://${this.bucketName}.s3-website-${this.bucketRegion}.amazonaws.com`;
  }
}