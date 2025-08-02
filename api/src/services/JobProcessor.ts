import { SQSService, JobMessage } from "./SQSService";
import { JobStatusService } from "./JobStatusService";
import { S3Service } from "./S3Service";
import { AnthropicService } from "./AnthropicService";
import { DatabaseService, BuildMetrics } from "./DatabaseService";
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

export class JobProcessor {
  private sqsService: SQSService;
  private jobStatusService: JobStatusService;
  private s3Service: S3Service;
  private aiService: AnthropicService;
  private databaseService: DatabaseService;
  private isProcessing: boolean = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    sqsService: SQSService,
    jobStatusService: JobStatusService,
    s3Service: S3Service,
    aiService: AnthropicService,
    databaseService: DatabaseService
  ) {
    this.sqsService = sqsService;
    this.jobStatusService = jobStatusService;
    this.s3Service = s3Service;
    this.aiService = aiService;
    this.databaseService = databaseService;
  }

  start(): void {
    if (this.isProcessing) {
      console.log("Job processor is already running");
      return;
    }

    this.isProcessing = true;
    console.log("Starting job processor...");

    // Start processing messages immediately
    this.processMessages();

    // Set up interval to process messages every 5 seconds
    this.processingInterval = setInterval(() => {
      this.processMessages();
    }, 5000);
  }

  stop(): void {
    if (!this.isProcessing) {
      console.log("Job processor is not running");
      return;
    }

    this.isProcessing = false;
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }
    console.log("Job processor stopped");
  }

  private async processMessages(): Promise<void> {
    if (!this.isProcessing) {
      return;
    }

    try {
      // Receive messages from SQS
      const result = await this.sqsService.receiveMessages(1);

      if (result.messages.length === 0) {
        return; // No messages to process
      }

      for (const message of result.messages) {
        await this.processJob(message.body, message.receiptHandle);
      }
    } catch (error) {
      console.error("Error processing messages:", error);
      // Continue processing even if there's an error
    }
  }

  private async processJob(
    jobMessage: JobMessage,
    receiptHandle: string
  ): Promise<void> {
    const { promptId, jobId, prompt, projectId, userId } = jobMessage;
    const actualPromptId = promptId || jobId; // Support both old and new message format

    // Initialize metrics tracking
    const jobStartTime = Date.now();
    const metrics: BuildMetrics = {};
    let buildId: string | null = null;

    try {
      console.log(`Processing prompt ${actualPromptId}...`);

      // Update prompt status to PROCESSING in database
      await this.databaseService.updatePromptStatus(
        actualPromptId,
        "PROCESSING"
      );

      // Also update in-memory for backward compatibility
      this.jobStatusService.updateJobStatus(actualPromptId, "PROCESSING");

      // Set project context for AnthropicService if we have a projectId
      if (
        projectId &&
        "setProjectContext" in this.aiService &&
        typeof this.aiService.setProjectContext === "function"
      ) {
        await (this.aiService as any).setProjectContext(
          this.databaseService,
          projectId
        );
      }

      // Get conversation context if projectId is available
      let contextPrompt = prompt;
      if (projectId) {
        const previousPrompts =
          await this.databaseService.getPromptsByProjectId(projectId);
        const conversation = previousPrompts
          .filter((p) => p.id !== actualPromptId) // Exclude current prompt
          .map((p) => `User: ${p.prompt}`)
          .join("\n\n");

        if (conversation) {
          contextPrompt = `Previous conversation:\n${conversation}\n\nCurrent request: ${prompt}`;
        }

        // Note: File tree is now loaded directly into AnthropicService via setProjectContext
      }

      // AI stage: Generate response using existing AI service
      console.log(`Running AI stage for prompt ${actualPromptId}...`);
      const aiStartTime = Date.now();
      const aiResponse = await this.aiService.generateResponse(
        contextPrompt,
        actualPromptId
      );
      metrics.ai_generation_time_ms = Date.now() - aiStartTime;

      // Parse the AI response to get the app directory
      const responseData = JSON.parse(aiResponse.content);
      const appDirectory = responseData.appDirectory;

      if (!appDirectory) {
        throw new Error("No app directory found in AI response");
      }

      // Note: File tree is already saved to database by AnthropicService, get the build ID
      if (projectId) {
        const latestBuild =
          await this.databaseService.getLatestBuildByProjectId(projectId);
        if (latestBuild) {
          buildId = latestBuild.id;

          // Stage 1: Upload source code to versions bucket (async, don't block)
          this.uploadSourceCodeAsync(
            appDirectory,
            projectId,
            latestBuild.version,
            actualPromptId
          )
            .then((result) => {
              // Store the source upload timing for metrics
              if (buildId) {
                this.databaseService
                  .updateBuildMetrics(buildId, {
                    version_source_upload_time_ms: result.duration,
                  })
                  .catch((error) => {
                    console.error(
                      `Failed to update source upload metrics for build ${buildId}:`,
                      error
                    );
                  });
              }
            })
            .catch((error) => {
              console.error(
                `Source upload promise error for prompt ${actualPromptId}:`,
                error
              );
            });
        }
      }

      // Update prompt status to BUILDING
      await this.databaseService.updatePromptStatus(actualPromptId, "BUILDING");
      this.jobStatusService.updateJobStatus(actualPromptId, "BUILDING", {
        appDirectory,
      });

      // Build stage: Check for build errors and potentially fix with AI agent
      console.log(`Running build stage for prompt ${actualPromptId}...`);
      const buildStartTime = Date.now();
      const { finalAppDirectory, dependencyInstallTime, buildTime } =
        await this.handleBuildWithRetry(
          appDirectory,
          actualPromptId,
          projectId
        );
      metrics.dependency_install_time_ms = dependencyInstallTime;
      metrics.build_time_ms = buildTime;

      // Upload to S3
      console.log(`Uploading to S3 for prompt ${actualPromptId}...`);

      // Validate projectId is available for upload
      if (!projectId) {
        throw new Error(
          "Project ID is required for S3 upload. Cannot deploy app without project context."
        );
      }

      if (buildId) {
        console.log(
          `Running parallel uploads: main app + versioned source/production for project ${projectId}`
        );
      }
      const uploadStartTime = Date.now();

      // Run main upload and production version upload in parallel
      const [uploadResult, versionUploadResult] = await Promise.allSettled([
        this.s3Service.uploadReactApp(
          finalAppDirectory,
          actualPromptId,
          projectId
        ),
        projectId && buildId
          ? this.uploadProductionVersionAsync(
              finalAppDirectory,
              projectId,
              buildId,
              actualPromptId
            )
          : Promise.resolve({ success: true, uploadedFiles: [], duration: 0 }),
      ]);

      metrics.s3_upload_time_ms = Date.now() - uploadStartTime;

      // Check main upload result
      if (uploadResult.status === "rejected" || !uploadResult.value.success) {
        const error =
          uploadResult.status === "rejected"
            ? uploadResult.reason
            : uploadResult.value.error;
        throw new Error(`Failed to upload app to S3: ${error}`);
      }

      const mainUploadResult = uploadResult.value;

      // Log version upload result and capture metrics (but don't fail if it failed)
      if (versionUploadResult.status === "rejected") {
        console.error(
          `Version upload failed for prompt ${actualPromptId}:`,
          versionUploadResult.reason
        );
      } else if (versionUploadResult.value.success) {
        console.log(
          `Version upload completed for prompt ${actualPromptId} - ${
            versionUploadResult.value.uploadedFiles?.length || 0
          } files uploaded`
        );

        // Update production version upload timing in metrics
        if (buildId && versionUploadResult.value.duration) {
          try {
            await this.databaseService.updateBuildMetrics(buildId, {
              version_production_upload_time_ms:
                versionUploadResult.value.duration,
            });
          } catch (error) {
            console.error(
              `Failed to update production upload metrics for build ${buildId}:`,
              error
            );
          }
        }
      } else {
        console.error(
          `Version upload failed for prompt ${actualPromptId}: No error details available`
        );
      }

      // Calculate total time
      metrics.total_time_ms = Date.now() - jobStartTime;

      // Update build metrics in database
      if (buildId) {
        await this.databaseService.updateBuildMetrics(buildId, metrics);
      }

      // Save preview URL to database
      if (projectId) {
        await this.databaseService.createPreview(
          mainUploadResult.previewUrl!,
          projectId,
          actualPromptId
        );
      }

      // Update prompt status to READY
      await this.databaseService.updatePromptStatus(actualPromptId, "READY");
      this.jobStatusService.updateJobStatus(actualPromptId, "READY", {
        previewUrl: mainUploadResult.previewUrl,
      });

      console.log(
        `Prompt ${actualPromptId} completed successfully. Preview URL: ${mainUploadResult.previewUrl}`
      );
      console.log(`Build metrics:`, metrics);

      // Delete the message from SQS since it was processed successfully
      await this.sqsService.deleteMessage(receiptHandle);
    } catch (error) {
      console.error(`Error processing prompt ${actualPromptId}:`, error);

      // Calculate total time even for failed jobs
      metrics.total_time_ms = Date.now() - jobStartTime;

      // Update build metrics even on failure
      if (buildId) {
        try {
          await this.databaseService.updateBuildMetrics(buildId, metrics);
        } catch (metricsError) {
          console.error("Failed to update metrics on error:", metricsError);
        }
      }

      // Update prompt status with error in database
      await this.databaseService.updatePromptStatus(actualPromptId, "FAILED");

      // Update job status with error in memory
      this.jobStatusService.updateJobStatus(actualPromptId, "FAILED", {
        errorMessage:
          error instanceof Error ? error.message : "Unknown error occurred",
      });

      // Delete the message from SQS to prevent reprocessing
      await this.sqsService.deleteMessage(receiptHandle);
    }
  }

  // Method to get processor status
  getStatus(): { isProcessing: boolean; uptime?: number } {
    return {
      isProcessing: this.isProcessing,
    };
  }

  private async uploadSourceCodeAsync(
    appDirectory: string,
    projectId: string,
    version: number,
    promptId: string
  ): Promise<{ duration: number; success: boolean }> {
    const startTime = Date.now();
    try {
      console.log(
        `Starting source code upload for prompt ${promptId}, project ${projectId}, version ${version}...`
      );
      const uploadResult = await this.s3Service.uploadSourceCode(
        appDirectory,
        projectId,
        version
      );
      const duration = Date.now() - startTime;

      if (uploadResult.success) {
        console.log(
          `Source code upload completed for prompt ${promptId} - ${
            uploadResult.uploadedFiles?.length || 0
          } files uploaded (${duration}ms)`
        );
        return { duration, success: true };
      } else {
        console.error(
          `Source code upload failed for prompt ${promptId}:`,
          uploadResult.error
        );
        return { duration, success: false };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(`Source code upload error for prompt ${promptId}:`, error);
      return { duration, success: false };
    }
  }

  private async uploadProductionVersionAsync(
    appDirectory: string,
    projectId: string,
    buildId: string,
    promptId: string
  ): Promise<{ success: boolean; uploadedFiles?: string[]; duration: number }> {
    const startTime = Date.now();
    try {
      // Get build information to get the version
      const build = await this.databaseService.getBuildById(buildId);
      if (!build) {
        console.error(`Build not found for buildId ${buildId}`);
        return { success: false, duration: Date.now() - startTime };
      }

      console.log(
        `Starting production version upload for prompt ${promptId}, project ${projectId}, version ${build.version}...`
      );
      const uploadResult = await this.s3Service.uploadProductionVersion(
        appDirectory,
        projectId,
        build.version
      );
      const duration = Date.now() - startTime;

      if (uploadResult.success) {
        console.log(
          `Production version upload completed for prompt ${promptId} - ${
            uploadResult.uploadedFiles?.length || 0
          } files uploaded (${duration}ms)`
        );
        return {
          success: true,
          uploadedFiles: uploadResult.uploadedFiles,
          duration,
        };
      } else {
        console.error(
          `Production version upload failed for prompt ${promptId}:`,
          uploadResult.error
        );
        return { success: false, duration };
      }
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error(
        `Production version upload error for prompt ${promptId}:`,
        error
      );
      return { success: false, duration };
    }
  }

  private async handleBuildWithRetry(
    appDirectory: string,
    promptId: string,
    projectId?: string
  ): Promise<{
    finalAppDirectory: string;
    dependencyInstallTime: number;
    buildTime: number;
  }> {
    console.log(`Running build for prompt ${promptId}...`);

    try {
      // Check if build already exists
      const distPath = path.join(appDirectory, "dist");
      if (fs.existsSync(distPath)) {
        console.log(`Build successful - dist folder already exists`);
        return {
          finalAppDirectory: appDirectory,
          dependencyInstallTime: 0,
          buildTime: 0,
        };
      }

      // Try to build once
      const buildResult = await this.tryBuild(appDirectory, projectId);

      if (buildResult.success) {
        console.log(`Build successful`);
        return {
          finalAppDirectory: appDirectory,
          dependencyInstallTime: buildResult.dependencyInstallTime || 0,
          buildTime: buildResult.buildTime || 0,
        };
      }

      // Build failed - throw error immediately without retry
      console.error(`Build failed:`, buildResult.error);
      throw new Error(
        `Build failed: ${buildResult.error || "Unknown build error"}`
      );
    } catch (error) {
      console.error(`Build failed:`, error);
      throw new Error(
        `Build failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async tryBuild(
    appDirectory: string,
    projectId?: string
  ): Promise<{
    success: boolean;
    output?: string;
    error?: string;
    dependencyInstallTime?: number;
    buildTime?: number;
  }> {
    const execAsync = promisify(exec);

    try {
      // Check if package.json exists to determine the build command
      const packageJsonPath = path.join(appDirectory, "package.json");
      let buildCommand = "npm run build";

      if (fs.existsSync(packageJsonPath)) {
        try {
          const packageJson = JSON.parse(
            fs.readFileSync(packageJsonPath, "utf8")
          );
          // Check if vite is available, prefer vite build over npm run build
          if (
            packageJson.devDependencies?.vite ||
            packageJson.dependencies?.vite
          ) {
            buildCommand = "npx vite build";
          }
        } catch (error) {
          console.warn(
            "Failed to parse package.json, using default build command:",
            error
          );
        }
      }

      // Install dependencies first
      console.log("Installing dependencies...");

      // Always use npm install to handle any package.json/package-lock.json discrepancies
      const installCommand = "npm install --silent --no-audit --no-fund";

      const installStartTime = Date.now();
      await execAsync(installCommand, {
        cwd: appDirectory,
        timeout: 180000, // 3 minutes timeout
        killSignal: "SIGTERM",
      });
      const dependencyInstallTime = Date.now() - installStartTime;

      // Run build command
      console.log("Running build...");
      console.log("Hello");
      const buildStartTime = Date.now();

      // Set up build command with inline environment variables if projectId exists
      let finalBuildCommand = buildCommand;
      if (projectId) {
        finalBuildCommand = `VITE_BASE_PATH=/projects/${projectId}/ ${buildCommand}`;
      }
      console.log(`Running: ${finalBuildCommand}`);

      const { stdout, stderr } = await execAsync(finalBuildCommand, {
        cwd: appDirectory,
        timeout: 120000, // 2 minutes timeout
        killSignal: "SIGTERM",
      });
      const buildTime = Date.now() - buildStartTime;

      return {
        success: true,
        output: stdout,
        error: stderr || undefined,
        dependencyInstallTime,
        buildTime,
      };
    } catch (error: any) {
      console.error("Build process error:", error);

      return {
        success: false,
        output: error.stdout || "",
        error: error.stderr || error.message,
      };
    }
  }
}
