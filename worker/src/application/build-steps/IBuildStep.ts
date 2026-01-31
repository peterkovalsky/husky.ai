import { BuildStepContext } from './BuildStepContext';

/**
 * Result returned by a build step after execution
 */
export interface StepResult {
  /** Whether the step completed successfully */
  success: boolean;

  /** Step-specific performance metrics (timing data) */
  metrics?: Record<string, number>;

  /** Error that occurred during step execution */
  error?: Error;

  /** Optional step-specific output data to pass to next steps */
  data?: any;
}

/**
 * Base interface for all build steps
 * Each step is responsible for:
 * 1. Updating its own step_status in the database
 * 2. Executing its core logic
 * 3. Returning metrics and results
 */
export interface IBuildStep {
  /** Human-readable name of the step (for logging) */
  readonly stepName: string;

  /** Database step_status value for this step */
  readonly stepStatus: string;

  /**
   * Execute the build step
   * @param context Shared build context containing state and dependencies
   * @returns StepResult with success status, metrics, and optional data
   */
  execute(context: BuildStepContext): Promise<StepResult>;
}

/**
 * Build step status values (stored in builds.step_status column)
 * These represent the current phase of the build process
 */
export enum BuildStepStatus {
  /** Validating job, creating build record */
  INITIALIZING = 'INITIALIZING',

  /** Processing user prompt (resizing images, validating media) */
  PROCESSING_PROMPT = 'PROCESSING_PROMPT',

  /** AI generation + environment prep (parallel, but only track AI) */
  GENERATING_CODE = 'GENERATING_CODE',

  /** Merging files, cleanup, saving to disk */
  PREPARING_FILES = 'PREPARING_FILES',

  /** Running preview build with project base path */
  BUILDING_PREVIEW = 'BUILDING_PREVIEW',

  /** Uploading preview build to preview bucket */
  UPLOADING_PREVIEW = 'UPLOADING_PREVIEW',

  /** Archiving source code and build artifacts to projects bucket */
  ARCHIVING_SOURCE = 'ARCHIVING_SOURCE',

  /** Capturing screenshot of the preview */
  CAPTURING_SCREENSHOT = 'CAPTURING_SCREENSHOT',

  /** Running production build with root base path */
  BUILDING_PRODUCTION = 'BUILDING_PRODUCTION',

  /** Uploading production build */
  UPLOADING_PRODUCTION = 'UPLOADING_PRODUCTION',

  /** Updating metrics, version, project status */
  FINALIZING = 'FINALIZING',

  /** Build finished successfully */
  COMPLETED = 'COMPLETED',

  /** Build failed at any step */
  FAILED = 'FAILED'
}
