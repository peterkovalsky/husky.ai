import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { GeneratePresignedUploadDto, GeneratePresignedUploadResponseDto } from '../dto/GeneratePresignedUploadDto';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

export class GeneratePresignedUploadUseCase {
  constructor(
    private mediaRepository: IMediaRepository,
    private storageService: IStorageService,
    private projectRepository: IProjectRepository
  ) {}

  // File size limit: 10MB for all media types
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

  async execute(dto: GeneratePresignedUploadDto, userId: string): Promise<GeneratePresignedUploadResponseDto> {
    // Validate mime type - allow images, videos, and PDFs
    const allowedMimeTypes = [
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      // Videos
      'video/mp4',
      'video/webm',
      'video/quicktime', // .mov
      // Documents
      'application/pdf',
      'text/plain',
    ];
    if (!allowedMimeTypes.includes(dto.mimeType)) {
      throw new Error(`Unsupported mime type: ${dto.mimeType}. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }

    // Validate file size
    if (dto.fileSize > GeneratePresignedUploadUseCase.MAX_FILE_SIZE) {
      throw new Error('File size exceeds maximum allowed size of 10MB');
    }

    // Validate project exists if projectId is provided
    if (dto.projectId) {
      const project = await this.projectRepository.findById(dto.projectId);
      if (!project) {
        throw new Error('Project not found');
      }
    }

    // Extract file extension
    const ext = path.extname(dto.fileName) || this.getExtensionFromMimeType(dto.mimeType);

    // Generate unique storage key
    // When projectId is provided: {projectId}/media/{uuid}.{ext}
    // When no projectId (new project flow): uploads/{userId}/media/{uuid}.{ext}
    const mediaUuid = uuidv4();
    const storageKey = dto.projectId
      ? `${dto.projectId}/media/${mediaUuid}${ext}`
      : `uploads/${userId}/media/${mediaUuid}${ext}`;

    // Get R2 projects bucket name (with fallback to legacy S3 bucket for backwards compatibility)
    const storageBucket = process.env.CLOUDFLARE_R2_PROJECTS_BUCKET || process.env.S3_PROJECTS_BUCKET_NAME!;

    // Determine media type based on MIME type
    const mediaType = this.getMediaTypeFromMimeType(dto.mimeType);

    // Create media record in database
    // Note: Database fields are still named s3Key/s3Bucket for backwards compatibility
    const media = await this.mediaRepository.create({
      userId,
      type: mediaType,
      mimeType: dto.mimeType,
      s3Key: storageKey,
      s3Bucket: storageBucket,
      fileSize: dto.fileSize,
    });

    // Generate presigned upload URL (expires in 15 minutes)
    const uploadUrl = await this.storageService.generatePresignedUploadUrl(
      storageKey,
      dto.mimeType,
      900, // 15 minutes
      storageBucket
    );

    return {
      mediaId: media.id,
      uploadUrl,
      s3Key: storageKey, // Return as s3Key for API backwards compatibility
    };
  }

  private getMediaTypeFromMimeType(mimeType: string): 'image' | 'video' | 'doc' {
    if (mimeType.startsWith('image/')) {
      return 'image';
    }
    if (mimeType.startsWith('video/')) {
      return 'video';
    }
    if (mimeType === 'application/pdf' || mimeType === 'text/plain') {
      return 'doc';
    }
    return 'doc'; // Default fallback
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      // Images
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
      // Videos
      'video/mp4': '.mp4',
      'video/webm': '.webm',
      'video/quicktime': '.mov',
      // Documents
      'application/pdf': '.pdf',
      'text/plain': '.txt',
    };
    return mimeToExt[mimeType] || '';
  }
}
