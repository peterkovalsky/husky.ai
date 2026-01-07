export type SubscriptionTier = 'free' | 'basic' | 'pro';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'trialing';

export interface Workspace {
  id: string;
  name: string;
  createdAt: Date;
  modifiedAt: Date;

  // Subscription
  subscriptionTier: SubscriptionTier;
  subscriptionStatus: SubscriptionStatus;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;

  // Credits
  creditsMonthlyAllocated: number;
  creditsMonthlyRemaining: number;
  creditsPurchased: number;
  creditsTotalPurchased: number;

  // Billing periods
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
}

export interface CreateWorkspaceRequest {
  name: string;
}