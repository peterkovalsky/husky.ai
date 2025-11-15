import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { ILogger } from '../../../shared/logger/Logger';

export class ResetMonthlyCreditsUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private logger: ILogger
  ) {}

  async execute(): Promise<{ resetCount: number }> {
    // Find all workspaces with expired billing periods
    const expiredWorkspaces = await this.workspaceRepository.findWorkspacesWithExpiredBillingPeriod();

    let resetCount = 0;

    for (const workspace of expiredWorkspaces) {
      try {
        await this.workspaceRepository.resetMonthlyCredits(workspace.id);
        resetCount++;
        this.logger.info(`Reset monthly credits for workspace ${workspace.id} (${workspace.subscriptionTier})`);
      } catch (error: any) {
        this.logger.error(`Failed to reset credits for workspace ${workspace.id}:`, error);
      }
    }

    this.logger.info(`Monthly credit reset completed: ${resetCount} workspaces updated`);

    return { resetCount };
  }
}
