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

  async execute(dto: GeneratePresignedUploadDto, userId: string): Promise<GeneratePresignedUploadResponseDto> {
    // Validate mime type (only images for now)
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedMimeTypes.includes(dto.mimeType)) {
      throw new Error(`Unsupported mime type: ${dto.mimeType}. Allowed types: ${allowedMimeTypes.join(', ')}`);
    }

    // Validate project exists and user has access
    const project = await this.projectRepository.findById(dto.projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Extract file extension
    const ext = path.extname(dto.fileName) || this.getExtensionFromMimeType(dto.mimeType);

    // Generate unique S3 key: {projectId}/media/{uuid}.{ext}
    const mediaUuid = uuidv4();
    const s3Key = `${dto.projectId}/media/${mediaUuid}${ext}`;

    // Get projects bucket name
    const s3Bucket = process.env.S3_PROJECTS_BUCKET_NAME!;

    // Create media record in database
    const media = await this.mediaRepository.create({
      userId,
      type: 'image',
      mimeType: dto.mimeType,
      s3Key,
      s3Bucket,
      fileSize: 0, // Will be updated on confirm if needed
    });

    // Generate presigned upload URL (expires in 15 minutes)
    const uploadUrl = await this.storageService.generatePresignedUploadUrl(
      s3Key,
      dto.mimeType,
      900, // 15 minutes
      s3Bucket
    );

    return {
      mediaId: media.id,
      uploadUrl,
      s3Key,
    };
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const mimeToExt: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/webp': '.webp',
    };
    return mimeToExt[mimeType] || '';
  }
}
