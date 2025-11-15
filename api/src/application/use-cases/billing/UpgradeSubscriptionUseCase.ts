import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { IStripeService } from '../../../domain/services/IStripeService';
import { SubscriptionTier } from '../../../domain/entities/Workspace';

export interface UpgradeSubscriptionRequest {
  workspaceId: string;
  tier: SubscriptionTier;
  userEmail: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface UpgradeSubscriptionResponse {
  checkoutUrl?: string;
  subscriptionId?: string;
  tier: SubscriptionTier;
  creditsAllocated: number;
}

export class UpgradeSubscriptionUseCase {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private stripeService: IStripeService
  ) {}

  async execute(request: UpgradeSubscriptionRequest): Promise<UpgradeSubscriptionResponse> {
    const { workspaceId, tier, userEmail, successUrl, cancelUrl } = request;

    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    if (tier === 'free') {
      throw new Error('Cannot upgrade to free tier. Use cancel subscription instead.');
    }

    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Ensure workspace has a Stripe customer ID
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      customerId = await this.stripeService.createCustomer(workspaceId, userEmail);
      await this.workspaceRepository.updateStripeCustomerId(workspaceId, customerId);
    } else {
      // Update customer email to ensure it's current
      await this.stripeService.updateCustomerEmail(customerId, userEmail);
    }

    // Get credit allocation for tier
    const creditsAllocated = this.getCreditAllocationForTier(tier);

    // If success/cancel URLs provided, use Checkout Session flow
    if (successUrl && cancelUrl) {
      const checkoutUrl = await this.stripeService.createSubscriptionCheckoutSession(
        customerId,
        tier,
        workspaceId,
        successUrl,
        cancelUrl
      );

      return {
        checkoutUrl,
        tier,
        creditsAllocated
      };
    }

    // Otherwise, use direct subscription creation (legacy flow)
    let subscriptionId: string;
    if (workspace.stripeSubscriptionId) {
      await this.stripeService.updateSubscription(workspace.stripeSubscriptionId, tier);
      subscriptionId = workspace.stripeSubscriptionId;
    } else {
      subscriptionId = await this.stripeService.createSubscription(customerId, tier);
    }

    // Update workspace with new subscription tier
    await this.workspaceRepository.updateSubscription(
      workspaceId,
      tier,
      'active',
      subscriptionId
    );

    return {
      subscriptionId,
      tier,
      creditsAllocated
    };
  }

  private getCreditAllocationForTier(tier: SubscriptionTier): number {
    const allocations: Record<SubscriptionTier, number> = {
      'free': 100,
      'basic': 250,
      'pro': 500
    };
    return allocations[tier];
  }
}
