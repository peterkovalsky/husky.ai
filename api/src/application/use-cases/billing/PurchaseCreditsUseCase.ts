import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';
import { ICreditPurchaseRepository } from '../../../domain/repositories/ICreditPurchaseRepository';
import { IStripeService } from '../../../domain/services/IStripeService';

export interface PurchaseCreditsRequest {
  workspaceId: string;
  credits: number;
  userEmail: string;
  successUrl?: string;
  cancelUrl?: string;
}

export interface PurchaseCreditsResponse {
  checkoutUrl?: string;
  clientSecret?: string;
  amount: number;
  credits: number;
}

export class PurchaseCreditsUseCase {
  private readonly CREDIT_PRICE = 0.10; // $0.10 per credit

  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private creditPurchaseRepository: ICreditPurchaseRepository,
    private stripeService: IStripeService
  ) {}

  async execute(request: PurchaseCreditsRequest): Promise<PurchaseCreditsResponse> {
    const { workspaceId, credits, userEmail, successUrl, cancelUrl } = request;

    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    if (!credits || credits <= 0) {
      throw new Error('Credits must be a positive number');
    }

    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Calculate amount
    const amount = credits * this.CREDIT_PRICE;

    // Ensure workspace has a Stripe customer ID
    let customerId = workspace.stripeCustomerId;
    if (!customerId) {
      // Create Stripe customer with user's email
      customerId = await this.stripeService.createCustomer(workspaceId, userEmail);
      await this.workspaceRepository.updateStripeCustomerId(workspaceId, customerId);
    } else {
      // Update customer email to ensure it's current
      await this.stripeService.updateCustomerEmail(customerId, userEmail);
    }

    // If success/cancel URLs provided, use Checkout Session flow
    if (successUrl && cancelUrl) {
      const checkoutUrl = await this.stripeService.createCreditPurchaseCheckoutSession(
        customerId,
        credits,
        amount,
        workspaceId,
        successUrl,
        cancelUrl
      );

      return {
        checkoutUrl,
        amount,
        credits
      };
    }

    // Otherwise, use payment intent flow (legacy)
    const clientSecret = await this.stripeService.createPaymentIntent(
      amount,
      customerId,
      {
        workspace_id: workspaceId,
        credits: credits.toString(),
        type: 'credit_purchase'
      }
    );

    return {
      clientSecret,
      amount,
      credits
    };
  }

  // This method is called by the webhook after successful payment
  async confirmPurchase(paymentIntentId: string, workspaceId: string, credits: number, amountPaid: number): Promise<void> {
    // Add credits to workspace
    await this.workspaceRepository.addPurchasedCredits(workspaceId, credits);

    // Record the purchase in history
    await this.creditPurchaseRepository.create({
      workspaceId,
      creditsPurchased: credits,
      amountPaid,
      stripePaymentIntentId: paymentIntentId
    });
  }
}
