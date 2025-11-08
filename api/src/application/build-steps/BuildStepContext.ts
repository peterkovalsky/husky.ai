import { FileTree } from '../../domain/entities/Build';

/**
 * Shared context passed between all build steps
 * This is a mutable object that accumulates state as steps execute
 */
export class BuildStepContext {
  // Job identifiers (immutable)
  readonly promptId: string;
  readonly projectId: string;
  readonly userId: string;

  // Build state (mutable, set by steps)
  buildId?: string;
  workingDirectory?: string;
  fileTree?: FileTree;
  version?: number;
  mediaIds?: string[];

  // Performance metrics (accumulated across steps)
  private readonly metricsData: Record<string, number> = {};

  // Step-specific data storage (for passing data between steps)
  private readonly stepData: Map<string, any> = new Map();

  constructor(jobMessage: { promptId: string; projectId: string; userId: string }) {
    this.promptId = jobMessage.promptId;
    this.projectId = jobMessage.projectId;
    this.userId = jobMessage.userId;
  }

  /**
   * Add or update metrics from a step
   * @param metrics Key-value pairs of metric names and values (usually timing data in ms)
   */
  addMetrics(metrics: Record<string, number> | undefined): void {
    if (!metrics) return;

    Object.entries(metrics).forEach(([key, value]) => {
      this.metricsData[key] = value;
    });
  }

  /**
   * Get all accumulated metrics
   */
  getMetrics(): Record<string, number> {
    return { ...this.metricsData };
  }

  /**
   * Store step-specific data that other steps might need
   * @param key Unique key for the data
   * @param value Data to store
   */
  setStepData(key: string, value: any): void {
    this.stepData.set(key, value);
  }

  /**
   * Retrieve step-specific data
   * @param key Unique key for the data
   */
  getStepData<T = any>(key: string): T | undefined {
    return this.stepData.get(key);
  }

  /**
   * Check if a required field is set
   * Throws an error if the field is missing
   */
  requireBuildId(): string {
    if (!this.buildId) {
      throw new Error('BuildStepContext: buildId is required but not set');
    }
    return this.buildId;
  }

  /**
   * Check if working directory is set
   * Throws an error if missing
   */
  requireWorkingDirectory(): string {
    if (!this.workingDirectory) {
      throw new Error('BuildStepContext: workingDirectory is required but not set');
    }
    return this.workingDirectory;
  }
}
