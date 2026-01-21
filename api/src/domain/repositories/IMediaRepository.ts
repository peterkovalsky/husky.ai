import { Media, CreateMediaRequest } from '../entities/Media';

export interface IMediaRepository {
  create(request: CreateMediaRequest): Promise<Media>;
  findById(id: string): Promise<Media | null>; // Excludes soft-deleted records
  findByIdIncludingDeleted(id: string): Promise<Media | null>; // Includes soft-deleted records
  findByIds(ids: string[]): Promise<Media[]>; // Excludes soft-deleted records
  findByUserId(userId: string): Promise<Media[]>; // Excludes soft-deleted records
  updateDimensions(id: string, width: number, height: number): Promise<void>;
  updatePublicS3Info(id: string, s3PublicKey: string, s3PublicBucket: string): Promise<void>;
  updateThumbnailInfo(id: string, thumbnailS3Key: string, thumbnailS3Bucket: string): Promise<void>;
  softDelete(id: string): Promise<void>;
  delete(id: string): Promise<void>; // Hard delete (kept for potential future use)
}
