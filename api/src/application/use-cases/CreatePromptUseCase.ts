import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { IMediaRepository } from '../../domain/repositories/IMediaRepository';
import { IQueueService } from '../../domain/services/IQueueService';
import { CreatePromptDto, CreatePromptResponseDto } from '../dto/CreatePromptDto';
import { ClarificationAnswer } from '../dto/AnalyzePromptDto';
import { User } from '../../domain/entities/User';
import { BuildStepStatus } from '../build-steps/IBuildStep';

export class CreatePromptUseCase {
  constructor(
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private workspaceRepository: IWorkspaceRepository,
    private queueService: IQueueService,
    private mediaRepository: IMediaRepository
  ) {}

  async execute(dto: CreatePromptDto, user: User): Promise<CreatePromptResponseDto> {
    if (!dto.prompt || typeof dto.prompt !== 'string') {
      throw new Error('Prompt is required and must be a string');
    }

    let projectId = dto.projectId;

    // Project ID is required
    if (!projectId) {
      throw new Error('projectId is required. Please specify which project to build.');
    }

    // Verify user has access to the specified project
    const hasAccess = await this.projectRepository.checkUserAccess(user.id, projectId);
    if (!hasAccess) {
      throw new Error('Access denied to project');
    }

    // Get project to find workspace ID
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Check if workspace has sufficient credits
    const workspace = await this.workspaceRepository.findById(project.workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const totalCredits = workspace.creditsMonthlyRemaining + workspace.creditsPurchased;
    if (totalCredits <= 0) {
      throw new Error('INSUFFICIENT_CREDITS: You have run out of credits. Please purchase more credits or upgrade your plan.');
    }

    // Validate media IDs if provided
    if (dto.mediaIds && dto.mediaIds.length > 0) {
      const medias = await this.mediaRepository.findByIds(dto.mediaIds);

      // Verify all media IDs exist
      if (medias.length !== dto.mediaIds.length) {
        throw new Error('One or more media IDs not found');
      }

      // Verify all media belongs to the user
      const allOwnedByUser = medias.every(media => media.userId === user.id);
      if (!allOwnedByUser) {
        throw new Error('Unauthorized: One or more media files do not belong to user');
      }
    }

    // Enhance prompt with clarification data if provided
    const enhancedPrompt = this.buildEnhancedPrompt(
      dto.prompt,
      dto.clarificationAnswers,
      dto.skippedClarification,
      !!dto.inspoId // hasInspoImage flag
    );

    // Create build directly with user prompt (builds are now the source of truth)
    const build = await this.buildRepository.create({
      fileTree: {},
      projectId,
      userId: user.id,
      userPrompt: enhancedPrompt,
      status: BuildStepStatus.INITIALIZING,
      mediaIds: dto.mediaIds || [],
      inspoId: dto.inspoId
    });

    console.log(`[CreatePromptUseCase] Created build ${build.id} with status INITIALIZING`);

    // Send message to queue with just buildId - all data is in the build record
    const message = {
      buildId: build.id,
      timestamp: new Date().toISOString()
    };

    console.log(`[CreatePromptUseCase] Sending message to queue for build:`, build.id);
    await this.queueService.sendMessage(message);
    console.log(`[CreatePromptUseCase] Message sent to queue successfully`);

    // Note: Credit consumption moved to FinalizationStep (only charged on successful build)

    return {
      promptId: build.id,  // For backward compatibility, return build.id as promptId
      jobId: build.id,
      status: 'QUEUED',
      projectId,
      timestamp: build.createdAt
    };
  }

  /**
   * Build an enhanced prompt that includes user's clarification answers and inspiration context
   */
  private buildEnhancedPrompt(
    originalPrompt: string,
    clarificationAnswers?: ClarificationAnswer[],
    skippedClarification?: boolean,
    hasInspoImage?: boolean
  ): string {
    let prompt = originalPrompt;

    // If user skipped clarification ("Surprise Me"), add note for creative freedom
    if (skippedClarification) {
      prompt = `${prompt}

Note: User selected "Surprise Me" - use your best creative judgment for all design choices. Be bold and creative with the visual direction.`;
    } else if (clarificationAnswers && clarificationAnswers.length > 0) {
      // Build user preferences section from answers
      const preferences = clarificationAnswers
        .map(answer => {
          const questionLabel = answer.questionText || `Question ${answer.questionId}`;

          if (answer.freeTextAnswer) {
            return `- ${questionLabel}: ${answer.freeTextAnswer}`;
          } else if (answer.selectedOptionLabel) {
            const description = answer.selectedOptionDescription
              ? ` - "${answer.selectedOptionDescription}"`
              : '';
            return `- ${questionLabel}: ${answer.selectedOptionLabel}${description}`;
          }
          return null;
        })
        .filter(Boolean)
        .join('\n');

      if (preferences) {
        prompt = `${prompt}

User's design preferences:
${preferences}

Please incorporate these design preferences into your implementation.`;
      }
    }

    // Add design inspiration context if an inspiration image was selected
    if (hasInspoImage) {
      prompt = `${prompt}

Design Inspiration Reference:
The user has selected a design inspiration image shown above. Use this as a reference for:
- Visual style and aesthetic direction
- Layout patterns and structure
- Color scheme inspiration
- Typography choices

IMPORTANT: Do NOT copy text content from the inspiration - only use it for design guidance.`;
    }

    return prompt;
  }
}