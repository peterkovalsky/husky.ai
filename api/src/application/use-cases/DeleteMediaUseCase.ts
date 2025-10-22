import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IQueueService, DeleteMediaMessage } from '../../domain/services/IQueueService';
import { DeleteMediaDto, DeleteMediaResponseDto } from '../dto/DeleteMediaDto';

export class DeleteMediaUseCase {
  constructor(
    private mediaRepository: IMediaRepository,
    private queueService: IQueueService
  ) {}

  async execute(dto: DeleteMediaDto, userId: string): Promise<DeleteMediaResponseDto> {
    // Find media by ID (excludes soft-deleted records)
    const media = await this.mediaRepository.findById(dto.mediaId);

    if (!media) {
      throw new Error('Media not found or already deleted');
    }

    // Verify ownership
    if (media.userId !== userId) {
      throw new Error('Unauthorized: Media does not belong to user');
    }

    // Optimistically soft delete the media immediately
    await this.mediaRepository.softDelete(dto.mediaId);
    console.log(`[DeleteMediaUseCase] Soft deleted media ${dto.mediaId}`);

    // Queue deletion message for async cleanup
    const deleteMessage: DeleteMediaMessage = {
      action: 'DELETE_MEDIA',
      mediaId: dto.mediaId,
      userId,
      projectId: dto.projectId, // Optional: if provided, only clean from this project
      timestamp: new Date().toISOString(),
    };

    await this.queueService.sendMessage(deleteMessage);
    console.log(`[DeleteMediaUseCase] Queued deletion message for media ${dto.mediaId}${dto.projectId ? ` in project ${dto.projectId}` : ''}`);

    return { success: true };
  }
}
