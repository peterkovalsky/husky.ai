import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IChatMessageRepository } from '../../domain/repositories/IChatMessageRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { ProjectDetailsDto, ChatMessageDto, ChatMessageMediaDto } from '../dto/ProjectDto';
import { User } from '../../domain/entities/User';
import { ChatMessage } from '../../domain/entities/ChatMessage';
import { Media } from '../../domain/entities/Media';
import { mapBuildStatusToFrontend } from '../../domain/utils/statusMapper';

// Presigned URL expiration: 1 hour
const PRESIGNED_URL_EXPIRY_SECONDS = 3600;

export class GetProjectDetailsUseCase {
  constructor(
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private buildRepository: IBuildRepository,
    private chatMessageRepository: IChatMessageRepository,
    private mediaRepository: IMediaRepository,
    private storageService: IStorageService
  ) {}

  async execute(projectId: string, user: User): Promise<ProjectDetailsDto> {
    // Get project details
    const project = await this.projectRepository.findById(projectId);

    if (!project) {
      throw new Error('Project not found');
    }

    // Get workspace details
    const workspaces = await this.workspaceRepository.findByUserId(user.id);
    const workspace = workspaces.find(w => w.id === project.workspaceId);

    // Get all builds (builds are now the source of truth for prompts)
    const builds = await this.buildRepository.findByProjectId(projectId);

    // Get recent builds as "prompts" (last 10, sorted by creation date desc)
    // Builds are already ordered by version desc, so we take the first 10
    const recentBuilds = builds.slice(0, 10);

    // Get latest build for current version info
    const latestBuild = await this.buildRepository.findLatestByProjectId(projectId);

    // Get chat messages for this project
    let chatMessages: ChatMessage[] = [];
    try {
      chatMessages = await this.chatMessageRepository.findByProjectId(projectId);
      console.log(`[GetProjectDetailsUseCase] Found ${chatMessages.length} chat messages for project ${projectId}`);
    } catch (error) {
      console.error(`[GetProjectDetailsUseCase] Error fetching chat messages:`, error);
      // Continue with empty array - don't fail the whole request
    }

    // Enrich chat messages with media URLs
    const enrichedChatMessages = await this.enrichChatMessagesWithMedia(chatMessages);

    return {
      project: {
        id: project.id,
        name: project.name,
        workspaceId: project.workspaceId,
        previewUrl: project.previewUrl,
        createdAt: project.createdAt,
        modifiedAt: project.modifiedAt
      },
      workspace: workspace ? {
        id: workspace.id,
        name: workspace.name
      } : null,
      stats: {
        totalPrompts: builds.length,  // Now builds count as prompts
        totalBuilds: builds.length,
        totalPreviews: project.previewUrl ? 1 : 0,
        currentVersion: latestBuild?.version || 0
      },
      recentPrompts: recentBuilds.map(build => ({
        id: build.id,
        prompt: build.userPrompt.length > 100 ? build.userPrompt.substring(0, 100) + '...' : build.userPrompt,
        status: mapBuildStatusToFrontend(build.status),
        createdAt: build.createdAt,
        modifiedAt: build.modifiedAt
      })),
      builds: builds.slice(0, 5).map(build => ({
        id: build.id,
        version: build.version,
        createdAt: build.createdAt,
        metrics: build.metrics
      })),
      previews: project.previewUrl ? [{
        id: project.id,
        previewUrl: project.previewUrl,
        createdAt: project.createdAt,
        promptId: undefined
      }] : [],
      chatMessages: enrichedChatMessages
    };
  }

  /**
   * Enrich chat messages with presigned URLs for media attachments
   */
  private async enrichChatMessagesWithMedia(chatMessages: ChatMessage[]): Promise<ChatMessageDto[]> {
    // Collect all unique media IDs from all messages
    const allMediaIds = new Set<string>();
    for (const message of chatMessages) {
      if (message.mediaIds && message.mediaIds.length > 0) {
        for (const mediaId of message.mediaIds) {
          allMediaIds.add(mediaId);
        }
      }
    }

    // If no media IDs, return messages without enrichment
    if (allMediaIds.size === 0) {
      return chatMessages.map(msg => this.mapChatMessageToDto(msg, []));
    }

    // Fetch all media records
    const mediaIds = Array.from(allMediaIds);
    let mediaRecords: Media[] = [];
    try {
      mediaRecords = await this.mediaRepository.findByIds(mediaIds);
      console.log(`[GetProjectDetailsUseCase] Found ${mediaRecords.length} media records for ${mediaIds.length} IDs`);
    } catch (error) {
      console.error(`[GetProjectDetailsUseCase] Error fetching media records:`, error);
      // Continue with empty media - messages will still be returned without media URLs
    }

    // Build a map of media ID to media record
    const mediaMap = new Map<string, Media>();
    for (const media of mediaRecords) {
      mediaMap.set(media.id, media);
    }

    // Generate presigned URLs for all media
    const mediaUrlsMap = new Map<string, ChatMessageMediaDto>();
    for (const media of mediaRecords) {
      try {
        const mediaDto = await this.generateMediaUrls(media);
        mediaUrlsMap.set(media.id, mediaDto);
      } catch (error) {
        console.error(`[GetProjectDetailsUseCase] Error generating URLs for media ${media.id}:`, error);
        // Skip this media - don't fail the whole request
      }
    }

    // Enrich each message with media URLs
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

  /**
   * Generate presigned URLs for a media record
   */
  private async generateMediaUrls(media: Media): Promise<ChatMessageMediaDto> {
    // Generate full-size URL
    const fullUrl = await this.storageService.generatePresignedDownloadUrl(
      media.s3Key,
      PRESIGNED_URL_EXPIRY_SECONDS,
      media.s3Bucket
    );

    // Generate thumbnail URL (use thumbnail if available, otherwise use full-size)
    let thumbnailUrl: string;
    if (media.thumbnailS3Key && media.thumbnailS3Bucket) {
      thumbnailUrl = await this.storageService.generatePresignedDownloadUrl(
        media.thumbnailS3Key,
        PRESIGNED_URL_EXPIRY_SECONDS,
        media.thumbnailS3Bucket
      );
    } else {
      // Fallback to full-size image if no thumbnail exists
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

  /**
   * Map ChatMessage entity to ChatMessageDto
   */
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