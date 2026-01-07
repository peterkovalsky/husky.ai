import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { DeleteMediaMessage } from '../../domain/services/IQueueService';
import { ILogger } from '../../shared/logger/Logger';

export class ProcessMediaDeletionUseCase {
  constructor(
    private mediaRepository: IMediaRepository,
    private buildRepository: IBuildRepository,
    private storageService: IStorageService,
    private logger: ILogger
  ) {}

  async execute(message: DeleteMediaMessage): Promise<void> {
    const { mediaId, userId, projectId } = message;

    try {
      // Find media (including soft-deleted records)
      const media = await this.mediaRepository.findByIdIncludingDeleted(mediaId);

      if (!media) {
        this.logger.warn(`[ProcessMediaDeletionUseCase] Media ${mediaId} not found, may have been hard deleted already`);
        return;
      }

      this.logger.info(`[ProcessMediaDeletionUseCase] Processing deletion for media ${mediaId}${projectId ? ` in project ${projectId}` : ' across all builds'}`);

      // Step 1: Remove media reference from builds
      try {
        if (projectId) {
          // If projectId provided, only remove from that project's builds
          await this.buildRepository.removeMediaIdFromProject(projectId, mediaId);
          this.logger.info(`[ProcessMediaDeletionUseCase] Removed media ${mediaId} references from builds in project ${projectId}`);
        } else {
          // If no projectId, remove from all builds that reference it
          await this.buildRepository.removeMediaIdFromAllBuilds(mediaId);
          this.logger.info(`[ProcessMediaDeletionUseCase] Removed media ${mediaId} references from all builds`);
        }
      } catch (error) {
        this.logger.error(`[ProcessMediaDeletionUseCase] Failed to remove media references from builds`, {
          mediaId,
          projectId: projectId || 'all',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with deletion even if this fails
      }

      // Step 2: Delete from private S3 bucket
      try {
        await this.storageService.deleteMediaFile(media.s3Key, media.s3Bucket);
        this.logger.info(`[ProcessMediaDeletionUseCase] Deleted media ${mediaId} from private bucket ${media.s3Bucket}`);
      } catch (error) {
        this.logger.error(`[ProcessMediaDeletionUseCase] Failed to delete from private bucket`, {
          mediaId,
          s3Key: media.s3Key,
          s3Bucket: media.s3Bucket,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // Continue with deletion even if this fails
      }

      // Step 3: Delete from public S3 bucket if exists
      if (media.s3PublicKey) {
        try {
          await this.storageService.deleteFromPublicBucket(media.s3PublicKey);
          this.logger.info(`[ProcessMediaDeletionUseCase] Deleted media ${mediaId} from public bucket`);
        } catch (error) {
          this.logger.error(`[ProcessMediaDeletionUseCase] Failed to delete from public bucket`, {
            mediaId,
            s3PublicKey: media.s3PublicKey,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          // Continue even if this fails
        }
      }

      // Step 4: Hard delete the media record from database
      try {
        await this.mediaRepository.delete(mediaId);
        this.logger.info(`[ProcessMediaDeletionUseCase] Hard deleted media record ${mediaId} from database`);
      } catch (error) {
        this.logger.error(`[ProcessMediaDeletionUseCase] Failed to hard delete media record from database`, {
          mediaId,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        // This is critical - if we can't delete the record, log it but don't throw
      }

      this.logger.info(`[ProcessMediaDeletionUseCase] Successfully completed deletion for media ${mediaId}`);
    } catch (error) {
      this.logger.error(`[ProcessMediaDeletionUseCase] Error processing media deletion`, {
        mediaId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      // Don't throw - let the message be deleted from queue
    }
  }
}
