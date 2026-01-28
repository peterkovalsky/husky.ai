/**
 * Build step status values (stored in builds.step_status column)
 * These represent the current phase of the build process
 *
 * Note: Build execution now happens in the worker service.
 * This enum is kept for status tracking and database compatibility.
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
