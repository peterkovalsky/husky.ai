import { IBuildRepository } from '../../domain/repositories/IBuildRepository';
import { IProjectRepository } from '../../domain/repositories/IProjectRepository';
import { IStorageService } from '../../domain/services/IStorageService';
import { BuildStepStatus } from '../build-steps/IBuildStep';

export interface UndoVersionResult {
  version: number;
  previewUrl: string;
}

export class UndoVersionUseCase {
  constructor(
    private buildRepository: IBuildRepository,
    private projectRepository: IProjectRepository,
    private storageService: IStorageService
  ) {}

  async execute(projectId: string): Promise<UndoVersionResult> {
    // Validate project exists
    const project = await this.projectRepository.findById(projectId);
    if (!project) {
      throw new Error('Project not found');
    }

    // Get all successful builds (status='COMPLETED') ordered by version DESC
    const builds = await this.buildRepository.findByProjectId(projectId);
    const successfulBuilds = builds.filter(build => build.status === BuildStepStatus.COMPLETED)
      .sort((a, b) => b.version - a.version);

    // Validate: Must have at least 2 successful builds
    if (successfulBuilds.length < 2) {
      throw new Error('Cannot undo: At least 2 successful builds required');
    }

    const latestBuild = successfulBuilds[0];
    const previousBuild = successfulBuilds[1];

    console.log(`[UndoVersionUseCase] Undoing version ${latestBuild.version}, restoring version ${previousBuild.version} for project ${projectId}`);

    // Delete latest version from database
    await this.buildRepository.deleteByVersion(projectId, latestBuild.version);
    console.log(`[UndoVersionUseCase] Deleted version ${latestBuild.version} from database`);

    // Try to delete version from S3 (don't throw if fails - per requirements)
    await this.storageService.deleteVersion(projectId, latestBuild.version);

    // Delete thumbnail for the version being undone
    await this.storageService.deleteThumbnail(projectId, latestBuild.version);
    console.log(`[UndoVersionUseCase] Deleted thumbnail for version ${latestBuild.version}`);

    // Copy previous version preview-build to preview bucket
    const previewUrl = await this.storageService.copyVersionToPreview(projectId, previousBuild.version);
    console.log(`[UndoVersionUseCase] Restored version ${previousBuild.version} to preview`);

    // Update project's currentVersion
    // Note: Thumbnail URL is constructed on-the-fly from projectId and currentVersion, so updating
    // currentVersion automatically points to the correct thumbnail
    await this.projectRepository.updateCurrentVersion(projectId, previousBuild.version);
    console.log(`[UndoVersionUseCase] Updated project currentVersion to ${previousBuild.version}`);

    return {
      version: previousBuild.version,
      previewUrl
    };
  }
}
