import { SupabaseClient } from '@supabase/supabase-js';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { Workspace, CreateWorkspaceRequest, SubscriptionTier, SubscriptionStatus } from '../../domain/entities/Workspace';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseWorkspaceRepository implements IWorkspaceRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreateWorkspaceRequest): Promise<Workspace> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .insert({ name: request.name })
      .select()
      .single();

    if (error) throw error;
    
    return this.mapToEntity(data);
  }

  async findByUserId(userId: string): Promise<Workspace[]> {
    // First get workspace IDs for the user
    const { data: userWorkspaces, error: uwError } = await this.supabase
      .from('user_workspaces')
      .select('workspace_id')
      .eq('user_id', userId);

    if (uwError) throw uwError;

    if (!userWorkspaces || userWorkspaces.length === 0) {
      return [];
    }

    // Then get the workspace details
    const workspaceIds = userWorkspaces.map(uw => uw.workspace_id);
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('*')
      .in('id', workspaceIds);

    if (error) throw error;
    
    return (data || []).map(this.mapToEntity);
  }

  async findById(id: string): Promise<Workspace | null> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    
    return data ? this.mapToEntity(data) : null;
  }

  async checkUserAccess(userId: string, workspaceId: string): Promise<boolean> {
    const { data, error } = await this.supabase
      .from('user_workspaces')
      .select('id')
      .eq('user_id', userId)
      .eq('workspace_id', workspaceId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return !!data;
  }

  async addUserToWorkspace(userId: string, workspaceId: string): Promise<void> {
    const { error } = await this.supabase
      .from('user_workspaces')
      .insert({ user_id: userId, workspace_id: workspaceId });

    if (error) throw error;
  }

  async consumeCredit(workspaceId: string): Promise<void> {
    // Get current workspace to determine which credit pool to consume from
    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Use monthly credits first, then purchased credits
    if (workspace.creditsMonthlyRemaining > 0) {
      const { error } = await this.supabase
        .from('workspaces')
        .update({ credits_monthly_remaining: workspace.creditsMonthlyRemaining - 1 })
        .eq('id', workspaceId);

      if (error) throw error;
    } else if (workspace.creditsPurchased > 0) {
      const { error } = await this.supabase
        .from('workspaces')
        .update({ credits_purchased: workspace.creditsPurchased - 1 })
        .eq('id', workspaceId);

      if (error) throw error;
    } else {
      throw new Error('Insufficient credits');
    }
  }

  async addPurchasedCredits(workspaceId: string, credits: number): Promise<void> {
    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const { error } = await this.supabase
      .from('workspaces')
      .update({
        credits_purchased: workspace.creditsPurchased + credits,
        credits_total_purchased: workspace.creditsTotalPurchased + credits
      })
      .eq('id', workspaceId);

    if (error) throw error;
  }

  async resetMonthlyCredits(workspaceId: string): Promise<void> {
    const workspace = await this.findById(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const allocation = this.getCreditAllocationForTier(workspace.subscriptionTier);
    const now = new Date();
    const nextMonth = new Date(now);
    nextMonth.setMonth(nextMonth.getMonth() + 1);

    const { error } = await this.supabase
      .from('workspaces')
      .update({
        credits_monthly_allocated: allocation,
        credits_monthly_remaining: allocation,
        billing_period_start: now.toISOString(),
        billing_period_end: nextMonth.toISOString()
      })
      .eq('id', workspaceId);

    if (error) throw error;
  }

  async updateSubscription(
    workspaceId: string,
    tier: SubscriptionTier,
    status: SubscriptionStatus,
    stripeSubscriptionId?: string
  ): Promise<void> {
    const allocation = this.getCreditAllocationForTier(tier);

    const updates: any = {
      subscription_tier: tier,
      subscription_status: status,
      credits_monthly_allocated: allocation,
      credits_monthly_remaining: allocation
    };

    if (stripeSubscriptionId !== undefined) {
      updates.stripe_subscription_id = stripeSubscriptionId;
    }

    const { error } = await this.supabase
      .from('workspaces')
      .update(updates)
      .eq('id', workspaceId);

    if (error) throw error;
  }

  async updateStripeCustomerId(workspaceId: string, stripeCustomerId: string): Promise<void> {
    const { error } = await this.supabase
      .from('workspaces')
      .update({ stripe_customer_id: stripeCustomerId })
      .eq('id', workspaceId);

    if (error) throw error;
  }

  async updateBillingPeriod(workspaceId: string, start: Date, end: Date): Promise<void> {
    const { error } = await this.supabase
      .from('workspaces')
      .update({
        billing_period_start: start.toISOString(),
        billing_period_end: end.toISOString()
      })
      .eq('id', workspaceId);

    if (error) throw error;
  }

  async findWorkspacesWithExpiredBillingPeriod(): Promise<Workspace[]> {
    const { data, error } = await this.supabase
      .from('workspaces')
      .select('*')
      .lt('billing_period_end', new Date().toISOString());

    if (error) throw error;
    return (data || []).map(this.mapToEntity);
  }

  private getCreditAllocationForTier(tier: SubscriptionTier): number {
    const allocations: Record<SubscriptionTier, number> = {
      'free': 100,
      'basic': 250,
      'pro': 500
    };
    return allocations[tier];
  }

  private mapToEntity(data: any): Workspace {
    return {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at),
      modifiedAt: new Date(data.modified_at),
      subscriptionTier: data.subscription_tier as SubscriptionTier,
      subscriptionStatus: data.subscription_status as SubscriptionStatus,
      stripeCustomerId: data.stripe_customer_id,
      stripeSubscriptionId: data.stripe_subscription_id,
      creditsMonthlyAllocated: data.credits_monthly_allocated,
      creditsMonthlyRemaining: data.credits_monthly_remaining,
      creditsPurchased: data.credits_purchased,
      creditsTotalPurchased: data.credits_total_purchased,
      billingPeriodStart: new Date(data.billing_period_start),
      billingPeriodEnd: new Date(data.billing_period_end)
    };
  }
}