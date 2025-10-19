export interface Media {
  id: string;
  userId: string;
  type: 'image' | 'video' | 'doc';
  mimeType: string;
  s3Key: string;
  s3Bucket: string;
  fileSize: number;
  width?: number;
  height?: number;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateMediaRequest {
  userId: string;
  type: 'image' | 'video' | 'doc';
  mimeType: string;
  s3Key: string;
  s3Bucket: string;
  fileSize: number;
  width?: number;
  height?: number;
}
