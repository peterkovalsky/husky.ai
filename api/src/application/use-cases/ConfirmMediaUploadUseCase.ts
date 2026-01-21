import sharp from 'sharp';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { ConfirmMediaUploadDto, ConfirmMediaUploadResponseDto } from '../dto/ConfirmMediaUploadDto';

const THUMBNAIL_SIZE = 256;

export class ConfirmMediaUploadUseCase {
  constructor(
    private mediaRepository: IMediaRepository,
    private storageService: IStorageService
  ) {}

  async execute(dto: ConfirmMediaUploadDto, userId: string): Promise<ConfirmMediaUploadResponseDto> {
    // Find media record
    const media = await this.mediaRepository.findById(dto.mediaId);
    if (!media) {
      throw new Error('Media not found');
    }

    // Verify user owns this media
    if (media.userId !== userId) {
      throw new Error('Unauthorized: Media does not belong to user');
    }

    // Verify file exists in S3
    const fileExists = await this.storageService.verifyFileExists(media.s3Key, media.s3Bucket);
    if (!fileExists) {
      throw new Error('File not found in S3. Upload may have failed.');
    }

    console.log(`[ConfirmMediaUploadUseCase] Confirmed upload for media ${media.id} at ${media.s3Key}`);

    // Generate thumbnail for images
    if (media.type === 'image') {
      try {
        await this.generateThumbnail(media.id, media.s3Key, media.s3Bucket, media.mimeType);
      } catch (error) {
        // Log error but don't fail the confirmation - thumbnail generation is best-effort
        console.error(`[ConfirmMediaUploadUseCase] Failed to generate thumbnail for media ${media.id}:`, error);
      }
    }

    return {
      success: true,
      media: {
        id: media.id,
        s3Key: media.s3Key,
        mimeType: media.mimeType,
      },
    };
  }

  private async generateThumbnail(
    mediaId: string,
    s3Key: string,
    s3Bucket: string,
    mimeType: string
  ): Promise<void> {
    console.log(`[ConfirmMediaUploadUseCase] Generating thumbnail for media ${mediaId}`);

    // Download the original image from S3
    const originalBuffer = await this.storageService.downloadFile(s3Key, s3Bucket);

    // Generate thumbnail using sharp
    // Use 'cover' fit to fill the square while maintaining aspect ratio
    const thumbnailBuffer = await sharp(originalBuffer)
      .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
        fit: 'cover',
        position: 'center',
      })
      .jpeg({ quality: 80 }) // Use JPEG for thumbnails (smaller size)
      .toBuffer();

    // Determine thumbnail S3 key (add -thumb-256 suffix before extension)
    const thumbnailS3Key = this.getThumbnailS3Key(s3Key);

    // Upload thumbnail to S3
    await this.storageService.uploadBuffer(thumbnailS3Key, thumbnailBuffer, 'image/jpeg', s3Bucket);

    // Update media record with thumbnail info
    await this.mediaRepository.updateThumbnailInfo(mediaId, thumbnailS3Key, s3Bucket);

    console.log(`[ConfirmMediaUploadUseCase] Thumbnail generated for media ${mediaId} at ${thumbnailS3Key}`);
  }

  private getThumbnailS3Key(originalS3Key: string): string {
    // Extract the extension and base name
    const lastDotIndex = originalS3Key.lastIndexOf('.');
    if (lastDotIndex === -1) {
      // No extension, just append
      return `${originalS3Key}-thumb-${THUMBNAIL_SIZE}.jpg`;
    }

    const baseName = originalS3Key.substring(0, lastDotIndex);
    return `${baseName}-thumb-${THUMBNAIL_SIZE}.jpg`;
  }
}
