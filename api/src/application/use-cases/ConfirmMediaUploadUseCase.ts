import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { ConfirmMediaUploadDto, ConfirmMediaUploadResponseDto } from '../dto/ConfirmMediaUploadDto';

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

    return {
      success: true,
      media: {
        id: media.id,
        s3Key: media.s3Key,
        mimeType: media.mimeType,
      },
    };
  }
}
