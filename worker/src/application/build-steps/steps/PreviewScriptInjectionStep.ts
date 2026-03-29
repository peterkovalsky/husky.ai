import { IBuildStep, StepResult } from '../IBuildStep';
import { BuildStepContext } from '../BuildStepContext';
import { IBuildRepository } from '../../../domain/repositories/IBuildRepository';

/**
 * PreviewScriptInjectionStep: No-op (scripts are now injected at serve time)
 *
 * Previously injected inline scripts (screenshot, location tracking, page context)
 * into preview HTML at build time. Now the preview Cloudflare Worker injects a
 * <script src="/_husky/husky.js"> tag at serve time instead, so the script can
 * be updated for all sites by uploading a new file to R2.
 *
 * This step is kept as a no-op to avoid breaking the build pipeline.
 */
export class PreviewScriptInjectionStep implements IBuildStep {
  readonly stepName = 'Preview Script Injection';
  readonly stepStatus = 'INJECTING_PREVIEW_SCRIPT';

  constructor(
    private buildRepository: IBuildRepository
  ) {}

  async execute(_context: BuildStepContext): Promise<StepResult> {
    console.log(`[${this.stepName}] Skipped - scripts are now injected at serve time by the preview worker`);
    return { success: true, metrics: {} };
  }
}
