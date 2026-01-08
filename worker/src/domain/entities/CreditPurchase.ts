export interface CreditPurchase {
  id: string;
  workspaceId: string;
  creditsPurchased: number;
  amountPaid: number;
  stripePaymentIntentId?: string;
  createdAt: Date;
}

export interface CreateCreditPurchaseRequest {
  workspaceId: string;
  creditsPurchased: number;
  amountPaid: number;
  stripePaymentIntentId?: string;
}
