import { IChatMessageRepository } from '../../domain/repositories/IChatMessageRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { ChatMessageDto, ChatMessageMediaDto } from '../dto/ProjectDto';
import { ChatMessage } from '../../domain/entities/ChatMessage';
import { Media } from '../../domain/entities/Media';

const PRESIGNED_URL_EXPIRY_SECONDS = 3600;

export class GetChatMessagesUseCase {
  constructor(
    private chatMessageRepository: IChatMessageRepository,
    private mediaRepository: IMediaRepository,
    private storageService: IStorageService
  ) {}

  async execute(projectId: string, limit: number, before?: string): Promise<{
    chatMessages: ChatMessageDto[];
    hasMore: boolean;
  }> {
    const result = await this.chatMessageRepository.findByProjectIdPaginated(projectId, {
      limit,
      before,
    });

    const enrichedMessages = await this.enrichChatMessagesWithMedia(result.messages);

    return {
      chatMessages: enrichedMessages,
      hasMore: result.hasMore,
    };
  }

  private async enrichChatMessagesWithMedia(chatMessages: ChatMessage[]): Promise<ChatMessageDto[]> {
    const allMediaIds = new Set<string>();
    for (const message of chatMessages) {
      if (message.mediaIds && message.mediaIds.length > 0) {
        for (const mediaId of message.mediaIds) {
          allMediaIds.add(mediaId);
        }
      }
    }

    if (allMediaIds.size === 0) {
      return chatMessages.map(msg => this.mapChatMessageToDto(msg, []));
    }

    const mediaIds = Array.from(allMediaIds);
    let mediaRecords: Media[] = [];
    try {
      mediaRecords = await this.mediaRepository.findByIds(mediaIds);
    } catch (error) {
      console.error(`[GetChatMessagesUseCase] Error fetching media records:`, error);
    }

    const mediaUrlsMap = new Map<string, ChatMessageMediaDto>();
    for (const media of mediaRecords) {
      try {
        const mediaDto = await this.generateMediaUrls(media);
        mediaUrlsMap.set(media.id, mediaDto);
      } catch (error) {
        console.error(`[GetChatMessagesUseCase] Error generating URLs for media ${media.id}:`, error);
      }
    }

    return chatMessages.map(msg => {
      const mediaUrls: ChatMessageMediaDto[] = [];
      if (msg.mediaIds && msg.mediaIds.length > 0) {
        for (const mediaId of msg.mediaIds) {
          const mediaDto = mediaUrlsMap.get(mediaId);
          if (mediaDto) {
            mediaUrls.push(mediaDto);
          }
        }
      }
      return this.mapChatMessageToDto(msg, mediaUrls);
    });
  }

  private async generateMediaUrls(media: Media): Promise<ChatMessageMediaDto> {
    const fullUrl = await this.storageService.generatePresignedDownloadUrl(
      media.s3Key,
      PRESIGNED_URL_EXPIRY_SECONDS,
      media.s3Bucket
    );

    let thumbnailUrl: string;
    if (media.thumbnailS3Key && media.thumbnailS3Bucket) {
      thumbnailUrl = await this.storageService.generatePresignedDownloadUrl(
        media.thumbnailS3Key,
        PRESIGNED_URL_EXPIRY_SECONDS,
        media.thumbnailS3Bucket
      );
    } else {
      thumbnailUrl = fullUrl;
    }

    return {
      id: media.id,
      thumbnailUrl,
      fullUrl,
      type: media.type,
      mimeType: media.mimeType
    };
  }

  private mapChatMessageToDto(message: ChatMessage, mediaUrls: ChatMessageMediaDto[]): ChatMessageDto {
    return {
      id: message.id,
      projectId: message.projectId,
      buildId: message.buildId,
      userId: message.userId,
      type: message.type,
      source: message.source,
      content: message.content,
      role: message.role,
      conversationRound: message.conversationRound,
      messageOrder: message.messageOrder,
      mediaIds: message.mediaIds,
      mediaUrls: mediaUrls.length > 0 ? mediaUrls : undefined,
      inspoId: message.inspoId,
      questionId: message.questionId,
      parentMessageId: message.parentMessageId,
      isSkipped: message.isSkipped,
      answerOptionId: message.answerOptionId,
      answerOptionLabel: message.answerOptionLabel,
      answerFreeText: message.answerFreeText,
      status: message.status,
      metadata: message.metadata,
      createdAt: message.createdAt,
      modifiedAt: message.modifiedAt
    };
  }
}
