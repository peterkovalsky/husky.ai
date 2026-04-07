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

    // Copy previous version preview-build to preview bucket FIRST
    // (must happen before S3 deletion in case latest and previous share the same version number)
    await this.storageService.copyVersionToPreview(projectId, previousBuild.version);
    console.log(`[UndoVersionUseCase] Restored version ${previousBuild.version} to preview`);

    // Atomically: delete chat messages, delete build record, update project version
    await this.buildRepository.undoBuild(latestBuild.id, projectId, previousBuild.version);
    console.log(`[UndoVersionUseCase] Transaction completed: deleted build ${latestBuild.id} (version ${latestBuild.version}), updated project to version ${previousBuild.version}`);

    // Clean up S3 storage (non-transactional, best-effort)
    await this.storageService.deleteVersion(projectId, latestBuild.version);
    await this.storageService.deleteThumbnail(projectId, latestBuild.version);
    console.log(`[UndoVersionUseCase] Deleted S3 files and thumbnail for version ${latestBuild.version}`);

    // Construct previewUrl on-the-fly (not from DB)
    const previewUrl = this.storageService.getPreviewUrl(projectId);

    return {
      version: previousBuild.version,
      previewUrl
    };
  }
}
