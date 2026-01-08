import { CreditPurchase, CreateCreditPurchaseRequest } from '../entities/CreditPurchase';

export interface ICreditPurchaseRepository {
  create(request: CreateCreditPurchaseRequest): Promise<CreditPurchase>;
  findByWorkspaceId(workspaceId: string, limit?: number): Promise<CreditPurchase[]>;
  findByStripePaymentIntentId(paymentIntentId: string): Promise<CreditPurchase | null>;
  getTotalPurchasedCredits(workspaceId: string): Promise<number>;
}
