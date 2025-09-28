import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IPromptRepository } from '../../domain/repositories/IPromptRepository';
import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { DeleteProjectMessage } from '../../domain/services/IQueueService';
import { FileSystemHelper } from '../../shared/utils/FileSystemHelper';

export class DeleteProjectUseCase {
  private readonly fileSystemHelper: FileSystemHelper;

  constructor(
    private projectRepository: IProjectRepository,
    private promptRepository: IPromptRepository,
    private buildRepository: IBuildRepository,
    private storageService: IStorageService
  ) {
    this.fileSystemHelper = FileSystemHelper.getInstance();
  }

  async execute(message: DeleteProjectMessage): Promise<void> {
    const { projectId, userId } = message;

    console.log(`Starting physical deletion of project ${projectId} for user ${userId}`);

    try {
      // Get project details for S3 cleanup
      const project = await this.projectRepository.findByIdForOperations(projectId);
      if (!project) {
        console.warn(`Project ${projectId} not found during deletion`);
        return;
      }

      // Get all builds associated with the project
      const builds = await this.buildRepository.findByProjectId(projectId);
      
      // Delete S3 resources
      await this.deleteS3Resources(projectId, builds);

      // Delete local disk resources (apps folder)
      await this.deleteDiskResources(projectId);

      // Delete database records in order (foreign key constraints)
      await this.deleteDatabaseRecords(projectId);

      console.log(`Successfully deleted project ${projectId}`);
    } catch (error) {
      console.error(`Failed to delete project ${projectId}:`, error);
      throw error;
    }
  }

  private async deleteS3Resources(projectId: string, builds: any[]): Promise<void> {
    try {
      // Delete app versions for each build
      for (const build of builds) {
        if (build.s3Key) {
          try {
            await this.storageService.deleteFile(build.s3Key);
            console.log(`Deleted S3 file: ${build.s3Key}`);
          } catch (error) {
            console.warn(`Failed to delete S3 file ${build.s3Key}:`, error);
          }
        }
      }

      // Delete project folder in S3 (if any remaining files)
      try {
        await this.storageService.deleteFolder(`projects/${projectId}/`);
        console.log(`Deleted S3 folder: projects/${projectId}/`);
      } catch (error) {
        console.warn(`Failed to delete S3 folder for project ${projectId}:`, error);
      }

      // Delete preview files (if stored separately)
      try {
        await this.storageService.deleteFolder(`previews/${projectId}/`);
        console.log(`Deleted S3 preview folder: previews/${projectId}/`);
      } catch (error) {
        console.warn(`Failed to delete S3 preview folder for project ${projectId}:`, error);
      }
    } catch (error) {
      console.error(`Error during S3 cleanup for project ${projectId}:`, error);
      throw error;
    }
  }

  private async deleteDiskResources(projectId: string): Promise<void> {
    try {
      const projectDir = this.fileSystemHelper.getProjectDir(projectId);
      await this.fileSystemHelper.deleteDirectory(projectDir);
    } catch (error) {
      console.warn(`Failed to delete local directory for project ${projectId}:`, error);
      // Don't throw error - this shouldn't block the deletion process
    }
  }

  private async deleteDatabaseRecords(projectId: string): Promise<void> {
    try {
      // Delete in order of foreign key dependencies
      
      // 1. Delete builds (references project)
      await this.buildRepository.deleteByProjectId(projectId);
      console.log(`Deleted builds for project ${projectId}`);

      // 2. Delete prompts (references project)
      await this.promptRepository.deleteByProjectId(projectId);
      console.log(`Deleted prompts for project ${projectId}`);

      // 3. Finally delete the project itself
      await this.projectRepository.deleteById(projectId);
      console.log(`Deleted project record ${projectId}`);

    } catch (error) {
      console.error(`Error during database cleanup for project ${projectId}:`, error);
      throw error;
    }
  }
}