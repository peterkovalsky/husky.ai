import { SupabaseClient } from '@supabase/supabase-js';
import { ICreditPurchaseRepository } from '../../domain/repositories/ICreditPurchaseRepository';
import { CreditPurchase, CreateCreditPurchaseRequest } from '../../domain/entities/CreditPurchase';
import { SupabaseClientFactory } from '../../shared/database/SupabaseClientFactory';

export class SupabaseCreditPurchaseRepository implements ICreditPurchaseRepository {
  private supabase: SupabaseClient;

  constructor() {
    this.supabase = SupabaseClientFactory.getClient();
  }

  async create(request: CreateCreditPurchaseRequest): Promise<CreditPurchase> {
    const { data, error } = await this.supabase
      .from('credit_purchases')
      .insert({
        workspace_id: request.workspaceId,
        credits_purchased: request.creditsPurchased,
        amount_paid: request.amountPaid,
        stripe_payment_intent_id: request.stripePaymentIntentId
      })
      .select()
      .single();

    if (error) throw error;
    return this.mapToEntity(data);
  }

  async findByWorkspaceId(workspaceId: string, limit?: number): Promise<CreditPurchase[]> {
    let query = this.supabase
      .from('credit_purchases')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false });

    if (limit) {
      query = query.limit(limit);
    }

    const { data, error } = await query;

    if (error) throw error;
    return (data || []).map(this.mapToEntity);
  }

  async findByStripePaymentIntentId(paymentIntentId: string): Promise<CreditPurchase | null> {
    const { data, error } = await this.supabase
      .from('credit_purchases')
      .select('*')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data ? this.mapToEntity(data) : null;
  }

  async getTotalPurchasedCredits(workspaceId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from('credit_purchases')
      .select('credits_purchased')
      .eq('workspace_id', workspaceId);

    if (error) throw error;

    return (data || []).reduce((sum, purchase) => sum + purchase.credits_purchased, 0);
  }

  private mapToEntity(data: any): CreditPurchase {
    return {
      id: data.id,
      workspaceId: data.workspace_id,
      creditsPurchased: data.credits_purchased,
      amountPaid: parseFloat(data.amount_paid),
      stripePaymentIntentId: data.stripe_payment_intent_id,
      createdAt: new Date(data.created_at)
    };
  }
}
