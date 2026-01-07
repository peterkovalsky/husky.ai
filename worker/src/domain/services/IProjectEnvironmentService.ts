export interface ProjectEnvironmentResult {
  nodeModulesCopied: boolean;
  nodeModulesCopyTime: number;
  packageLockCopied: boolean;
  totalPrepTime: number;
}

export interface IProjectEnvironmentService {
  /**
   * Prepare project environment by copying node_modules and package-lock.json if needed.
   * This operation is idempotent and safe to call multiple times.
   * @param projectId The project ID
   * @returns Promise with preparation results and timing
   */
  prepareEnvironmentAsync(projectId: string): Promise<ProjectEnvironmentResult>;
}
