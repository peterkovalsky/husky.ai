import { IProjectEnvironmentService, ProjectEnvironmentResult } from '../../domain/services/IProjectEnvironmentService';
import { ProjectTemplate } from '../../domain/entities/Project';

export class PrepareProjectEnvironmentUseCase {
  constructor(
    private projectEnvironmentService: IProjectEnvironmentService
  ) {}

  /**
   * Prepare the project environment by copying node_modules and package-lock.json.
   * This operation is idempotent and safe to call multiple times.
   * Designed to run in parallel with AI generation.
   */
  async execute(projectId: string, template?: ProjectTemplate): Promise<ProjectEnvironmentResult> {
    console.log(`Preparing project environment for ${projectId} (template: ${template || 'react18-ts'})...`);

    const result = await this.projectEnvironmentService.prepareEnvironmentAsync(projectId, template);

    console.log(`Project environment prepared for ${projectId} in ${result.totalPrepTime}ms`);

    return result;
  }
}
