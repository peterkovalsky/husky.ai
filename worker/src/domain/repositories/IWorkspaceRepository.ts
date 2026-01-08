import { Workspace, CreateWorkspaceRequest, SubscriptionTier, SubscriptionStatus } from '../entities/Workspace';

export interface IWorkspaceRepository {
  create(request: CreateWorkspaceRequest): Promise<Workspace>;
  findByUserId(userId: string): Promise<Workspace[]>;
  findById(id: string): Promise<Workspace | null>;
  checkUserAccess(userId: string, workspaceId: string): Promise<boolean>;
  addUserToWorkspace(userId: string, workspaceId: string): Promise<void>;

  // Credit management
  consumeCredit(workspaceId: string): Promise<void>;
  addPurchasedCredits(workspaceId: string, credits: number): Promise<void>;
  resetMonthlyCredits(workspaceId: string): Promise<void>;

  // Subscription management
  updateSubscription(
    workspaceId: string,
    tier: SubscriptionTier,
    status: SubscriptionStatus,
    stripeSubscriptionId?: string
  ): Promise<void>;
  updateStripeCustomerId(workspaceId: string, stripeCustomerId: string): Promise<void>;

  // Billing period management
  updateBillingPeriod(workspaceId: string, start: Date, end: Date): Promise<void>;
  findWorkspacesWithExpiredBillingPeriod(): Promise<Workspace[]>;
}