import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';

export interface CheckCreditsResponse {
  totalCredits: number;
  monthlyRemaining: number;
  purchased: number;
  purchasedUsed: number;
  purchasedTotal: number;
  monthlyAllocated: number;
  isLow: boolean;
  isOut: boolean;
  threshold: number;
  tier: string;
  billingPeriodEnd: Date;
}

export class CheckWorkspaceCreditsUseCase {
  constructor(private workspaceRepository: IWorkspaceRepository) {}

  async execute(workspaceId: string): Promise<CheckCreditsResponse> {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const totalCredits = workspace.creditsMonthlyRemaining + workspace.creditsPurchased;
    const threshold = Math.ceil(workspace.creditsMonthlyAllocated * 0.1); // 10% threshold
    const purchasedUsed = workspace.creditsTotalPurchased - workspace.creditsPurchased;

    return {
      totalCredits,
      monthlyRemaining: workspace.creditsMonthlyRemaining,
      purchased: workspace.creditsPurchased,
      purchasedUsed,
      purchasedTotal: workspace.creditsTotalPurchased,
      monthlyAllocated: workspace.creditsMonthlyAllocated,
      isLow: totalCredits <= threshold && totalCredits > 0,
      isOut: totalCredits === 0,
      threshold,
      tier: workspace.subscriptionTier,
      billingPeriodEnd: workspace.billingPeriodEnd
    };
  }
}
