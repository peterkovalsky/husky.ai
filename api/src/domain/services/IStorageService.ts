export interface UploadResult {
  success: boolean;
  previewUrl?: string;
  uploadedFiles?: string[];
  error?: string;
  duration?: number;
}

export interface IStorageService {
  uploadReactApp(appDirectory: string, promptId: string, projectId: string): Promise<UploadResult>;
  uploadSourceCode(appDirectory: string, projectId: string, version: number): Promise<UploadResult>;
  uploadPreviewVersion(appDirectory: string, projectId: string, version: number): Promise<UploadResult>;
  uploadProductionVersion(appDirectory: string, projectId: string, version: number): Promise<UploadResult>;
  deleteFile(key: string): Promise<void>;
  deleteFolder(prefix: string): Promise<void>;
  deleteMediaFile(key: string, bucket: string): Promise<void>;
  deleteVersion(projectId: string, version: number): Promise<void>;
  copyVersionToPreview(projectId: string, version: number): Promise<string>;
  generatePresignedUploadUrl(key: string, mimeType: string, expiresIn: number, bucket?: string): Promise<string>;
  generatePresignedDownloadUrl(key: string, expiresIn: number, bucket?: string): Promise<string>;
  verifyFileExists(key: string, bucket?: string): Promise<boolean>;
  copyToPublicBucket(sourceKey: string, sourceBucket: string, projectId: string): Promise<{ publicKey: string; publicUrl: string }>;
  deleteFromPublicBucket(key: string): Promise<void>;
  getPublicUrl(key: string): Promise<string>;
  uploadThumbnail(projectId: string, version: number, buffer: Buffer): Promise<string>;
  getThumbnailPresignedUrl(thumbnailKey: string, expiresIn?: number): Promise<string>;
  deleteThumbnail(projectId: string, version: number): Promise<void>;
  downloadFile(key: string, bucket?: string): Promise<Buffer>;
  uploadBuffer(key: string, buffer: Buffer, contentType: string, bucket?: string): Promise<void>;
}