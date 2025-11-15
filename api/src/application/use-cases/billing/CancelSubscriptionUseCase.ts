import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IStripeService } from '../../../domain/services/IStripeService';

export class CancelSubscriptionUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private stripeService: IStripeService
  ) {}

  async execute(workspaceId: string): Promise<void> {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    if (!workspace.stripeSubscriptionId) {
      throw new Error('No active subscription found');
    }

    // Cancel subscription in Stripe
    await this.stripeService.cancelSubscription(workspace.stripeSubscriptionId);

    // Downgrade workspace to free tier
    await this.workspaceRepository.updateSubscription(
      workspaceId,
      'free',
      'canceled',
      undefined // Clear subscription ID
    );
  }
}
