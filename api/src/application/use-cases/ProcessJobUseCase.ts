import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IAIService } from '../../domain/services/IAIService';
import { IBuildService } from '../../domain/services/IBuildService';
import { IStorageService } from '../../domain/services/IStorageService';
import { JobMessage } from '../../domain/services/IQueueService';
import { BuildMetrics } from '../../domain/entities/Build';

export class ProcessJobUseCase {
  constructor(
    private promptRepository: IPromptRepository,
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private aiService: IAIService,
    private buildService: IBuildService,
    private storageService: IStorageService
  ) {}

  async execute(jobMessage: JobMessage): Promise<void> {
    const { promptId, jobId, prompt, projectId, userId } = jobMessage;
    const actualPromptId = promptId || jobId; // Support both old and new message format

    if (!actualPromptId) {
      throw new Error('No prompt ID found in job message');
    }

    if (!projectId) {
      throw new Error('Project ID is required for job processing');
    }

    // Now TypeScript knows these are defined
    const safePromptId: string = actualPromptId;
    const safeProjectId: string = projectId;

    // Initialize metrics tracking
    const jobStartTime = Date.now();
    const metrics: BuildMetrics = {};
    let buildId: string | null = null;

    try {
      console.log(`Processing prompt ${safePromptId}...`);

      // Update prompt status to PROCESSING
      await this.promptRepository.updateStatus(safePromptId, "PROCESSING");

      // Set project context for AI service
      await this.aiService.setProjectContext(safeProjectId);

      // Get conversation context
      const previousPrompts = await this.promptRepository.findByProjectId(safeProjectId);
      let contextPrompt = prompt;
      const conversation = previousPrompts
        .filter((p) => p.id !== safePromptId) // Exclude current prompt
        .map((p) => `User: ${p.prompt}`)
        .join("\n\n");

      if (conversation) {
        contextPrompt = `Previous conversation:\n${conversation}\n\nCurrent request: ${prompt}`;
      }

      // AI stage: Generate response
      console.log(`Running AI stage for prompt ${safePromptId}...`);
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(contextPrompt, safePromptId);
      metrics.aiGenerationTimeMs = Date.now() - aiStartTime;

      // Parse the AI response to get the app directory
      const responseData = JSON.parse(aiResponse.content);
      const appDirectory = responseData.appDirectory;

      if (!appDirectory) {
        throw new Error("No app directory found in AI response");
      }

      // Get the latest build for this project
      const latestBuild = await this.buildRepository.findLatestByProjectId(safeProjectId);
      if (latestBuild) {
        buildId = latestBuild.id;
      }

      // Update prompt status to BUILDING
      await this.promptRepository.updateStatus(safePromptId, "BUILDING");

      // Build stage
      console.log(`Running build stage for prompt ${safePromptId}...`);
      const buildStartTime = Date.now();
      const buildResult = await this.buildService.buildApp(appDirectory, safeProjectId);
      
      if (!buildResult.success) {
        throw new Error(`Build failed: ${buildResult.error || "Unknown build error"}`);
      }

      metrics.dependencyInstallTimeMs = buildResult.dependencyInstallTime || 0;
      metrics.buildTimeMs = buildResult.buildTime || 0;

      // Upload to S3
      console.log(`Uploading to S3 for prompt ${safePromptId}...`);
      const uploadStartTime = Date.now();
      const uploadResult = await this.storageService.uploadReactApp(appDirectory, safePromptId, safeProjectId);
      metrics.s3UploadTimeMs = Date.now() - uploadStartTime;

      if (!uploadResult.success) {
        throw new Error(`Failed to upload app to S3: ${uploadResult.error}`);
      }

      // Calculate total time
      metrics.totalTimeMs = Date.now() - jobStartTime;

      // Update build metrics in database
      if (buildId) {
        await this.buildRepository.updateMetrics(buildId, metrics);
      }

      // Save preview URL to project (only set if it's not already set)
      if (uploadResult.previewUrl) {
        const project = await this.projectRepository.findById(safeProjectId);
        if (project && !project.previewUrl) {
          await this.projectRepository.updatePreviewUrl(safeProjectId, uploadResult.previewUrl);
        }
      }

      // Update prompt status to READY
      await this.promptRepository.updateStatus(safePromptId, "READY");

      console.log(`Prompt ${safePromptId} completed successfully. Preview URL: ${uploadResult.previewUrl}`);
      console.log(`Build metrics:`, metrics);

    } catch (error) {
      console.error(`Error processing prompt ${safePromptId}:`, error);

      // Calculate total time even for failed jobs
      metrics.totalTimeMs = Date.now() - jobStartTime;

      // Update build metrics even on failure
      if (buildId) {
        try {
          await this.buildRepository.updateMetrics(buildId, metrics);
        } catch (metricsError) {
          console.error("Failed to update metrics on error:", metricsError);
        }
      }

      // Update prompt status with error
      await this.promptRepository.updateStatus(safePromptId, "FAILED");

      throw error; // Re-throw to be handled by job processor
    }
  }
}