import { SubscriptionTier } from '../entities/Workspace';

export interface IStripeService {
  // Customer management
  createCustomer(workspaceId: string, email: string): Promise<string>;
  updateCustomerEmail(customerId: string, email: string): Promise<void>;

  // Subscription management
  createSubscription(customerId: string, tier: SubscriptionTier): Promise<string>;
  cancelSubscription(subscriptionId: string): Promise<void>;
  updateSubscription(subscriptionId: string, tier: SubscriptionTier): Promise<void>;

  // Checkout Sessions
  createSubscriptionCheckoutSession(
    customerId: string,
    tier: SubscriptionTier,
    workspaceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string>;

  createCreditPurchaseCheckoutSession(
    customerId: string,
    credits: number,
    amount: number,
    workspaceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<string>;

  // Payment intent for credit purchases (kept for backward compatibility)
  createPaymentIntent(amount: number, customerId: string, metadata: Record<string, string>): Promise<string>;

  // Webhook verification
  constructWebhookEvent(payload: string | Buffer, signature: string): Promise<any>;
}
