import { BuildStepStatus } from '../../application/build-steps/IBuildStep';
import { BuildStatus, FrontendBuildStatus } from '../entities/Build';

/**
 * Maps detailed BuildStatus (BuildStepStatus) to high-level FrontendBuildStatus
 * for API responses to maintain frontend compatibility.
 *
 * Database stores detailed step-by-step status, but frontend only needs
 * high-level status for display and polling logic.
 */
export function mapBuildStatusToFrontend(status: BuildStatus): FrontendBuildStatus {
  switch (status) {
    case BuildStepStatus.INITIALIZING:
    case BuildStepStatus.PROCESSING_PROMPT:
    case BuildStepStatus.GENERATING_CODE:
    case BuildStepStatus.PREPARING_FILES:
      return FrontendBuildStatus.PROCESSING;

    case BuildStepStatus.BUILDING_PREVIEW:
    case BuildStepStatus.UPLOADING_PREVIEW:
      return FrontendBuildStatus.BUILDING;

    case BuildStepStatus.CAPTURING_SCREENSHOT:
    case BuildStepStatus.BUILDING_PRODUCTION:
    case BuildStepStatus.UPLOADING_PRODUCTION:
    case BuildStepStatus.FINALIZING:
    case BuildStepStatus.COMPLETED:
      return FrontendBuildStatus.READY;

    case BuildStepStatus.FAILED:
      return FrontendBuildStatus.FAILED;

    default:
      // Fallback for any unknown status
      return FrontendBuildStatus.PROCESSING;
  }
}
