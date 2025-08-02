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
  private versionsBucketName: string;
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
    this.versionsBucketName = process.env.S3_VERSIONS_BUCKET_NAME || 'prod-husky-versions';
    
    if (!this.bucketName) {
      throw new Error('S3 Bucket name is required. Set S3_BUCKET_NAME environment variable.');
    }
  }

  private shouldExcludeFile(filePath: string, fileName: string): boolean {
    const excludePatterns = [
      'node_modules',
      'dist',
      '.git',
      '.env',
      '.env.local',
      '.env.development',
      '.env.production',
      'npm-debug.log',
      'yarn-debug.log',
      'yarn-error.log',
      '.DS_Store',
      'Thumbs.db'
    ];

    const relativePath = path.relative(process.cwd(), filePath);
    
    return excludePatterns.some(pattern => 
      relativePath.includes(pattern) || fileName.includes(pattern) || fileName.endsWith('.log')
    );
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
    return this.uploadFileToSpecificBucket(localPath, s3Key, this.bucketName);
  }

  private async uploadFileToSpecificBucket(localPath: string, s3Key: string, bucketName: string): Promise<void> {
    try {
      const fileContent = await readFile(localPath);
      const mimeType = this.getMimeType(localPath);
      
      
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: s3Key,
        Body: fileContent,
        ContentType: mimeType
      });

      await this.client.send(command);
    } catch (error) {
      console.error(`Error uploading file ${localPath} to S3 bucket ${bucketName}:`, error);
      throw error;
    }
  }

  private async uploadDirectoryRecursive(
    localDir: string, 
    s3Prefix: string, 
    uploadedFiles: string[],
    bucketName?: string,
    excludeFiles: boolean = false
  ): Promise<void> {
    const files = await readdir(localDir);
    
    for (const file of files) {
      const localPath = path.join(localDir, file);
      const fileStat = await stat(localPath);
      
      if (excludeFiles && this.shouldExcludeFile(localPath, file)) {
        continue;
      }
      
      if (fileStat.isDirectory()) {
        // Recursively upload subdirectory
        const newPrefix = s3Prefix ? `${s3Prefix}/${file}` : file;
        await this.uploadDirectoryRecursive(
          localPath, 
          newPrefix, 
          uploadedFiles,
          bucketName,
          excludeFiles
        );
      } else {
        // Upload file
        const s3Key = s3Prefix ? `${s3Prefix}/${file}` : file;
        await this.uploadFileToSpecificBucket(localPath, s3Key, bucketName || this.bucketName);
        uploadedFiles.push(s3Key);
      }
    }
  }

  async uploadReactApp(appDirectory: string, _jobId: string, projectId: string): Promise<UploadResult> {
    try {
      // Check if dist directory exists
      const distPath = path.join(appDirectory, 'dist');
      if (!fs.existsSync(distPath)) {
        return {
          success: false,
          error: 'Build directory (dist) not found. Make sure the React app was built successfully.'
        };
      }

      // Upload to project-specific folder
      const uploadedFiles: string[] = [];
      const s3Prefix = `projects/${projectId}`;

      // Upload all files from the dist directory to project-specific folder
      await this.uploadDirectoryRecursive(distPath, s3Prefix, uploadedFiles);
      
      console.log(`Successfully uploaded ${uploadedFiles.length} files to S3 prefix: ${s3Prefix}`);

      // Generate S3 static website URL with project path
      const previewUrl = `http://${this.bucketName}.s3-website-${this.bucketRegion}.amazonaws.com/projects/${projectId}/`;

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

  async listAppFiles(_jobId: string, projectId: string): Promise<string[]> {
    try {
      // List files in project-specific folder
      const command = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `projects/${projectId}/`
      });

      const response = await this.client.send(command);
      return (response.Contents || []).map(obj => obj.Key!);
    } catch (error) {
      console.error('Error listing app files from S3:', error);
      throw new Error(`Failed to list app files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async uploadSourceCode(appDirectory: string, projectId: string, version: number): Promise<UploadResult> {
    try {
      const uploadedFiles: string[] = [];
      const s3Prefix = `projects/${projectId}/v${version}/source`;

      // Upload source code excluding node_modules, dist, etc.
      await this.uploadDirectoryRecursive(
        appDirectory, 
        s3Prefix, 
        uploadedFiles,
        this.versionsBucketName,
        true // Enable file exclusion
      );

      console.log(`Source code uploaded to ${this.versionsBucketName}/${s3Prefix} - ${uploadedFiles.length} files`);

      return {
        success: true,
        uploadedFiles
      };
    } catch (error) {
      console.error('Error uploading source code to versions bucket:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred during source upload'
      };
    }
  }

  async uploadProductionVersion(appDirectory: string, projectId: string, version: number): Promise<UploadResult> {
    try {
      // Check if dist directory exists
      const distPath = path.join(appDirectory, 'dist');
      if (!fs.existsSync(distPath)) {
        return {
          success: false,
          error: 'Build directory (dist) not found. Make sure the React app was built successfully.'
        };
      }

      const uploadedFiles: string[] = [];
      const s3Prefix = `projects/${projectId}/v${version}/dist`;

      // Upload all files from the dist directory to versions bucket
      await this.uploadDirectoryRecursive(
        distPath, 
        s3Prefix, 
        uploadedFiles,
        this.versionsBucketName
      );

      console.log(`Production version uploaded to ${this.versionsBucketName}/${s3Prefix} - ${uploadedFiles.length} files`);

      return {
        success: true,
        uploadedFiles
      };
    } catch (error) {
      console.error('Error uploading production version to versions bucket:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred during production upload'
      };
    }
  }

  generatePreviewUrl(_jobId: string, projectId: string): string {
    return `http://${this.bucketName}.s3-website-${this.bucketRegion}.amazonaws.com/projects/${projectId}/`;
  }
}