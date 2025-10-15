import { IProjectEnvironmentService, ProjectEnvironmentResult } from '../../domain/services/IProjectEnvironmentService';

export class PrepareProjectEnvironmentUseCase {
  constructor(
    private projectEnvironmentService: IProjectEnvironmentService
  ) {}

  /**
   * Prepare the project environment by copying node_modules and package-lock.json.
   * This operation is idempotent and safe to call multiple times.
   * Designed to run in parallel with AI generation.
   */
  async execute(projectId: string): Promise<ProjectEnvironmentResult> {
    console.log(`Preparing project environment for ${projectId}...`);

    const result = await this.projectEnvironmentService.prepareEnvironmentAsync(projectId);

    console.log(`Project environment prepared for ${projectId} in ${result.totalPrepTime}ms`);

    return result;
  }
}
