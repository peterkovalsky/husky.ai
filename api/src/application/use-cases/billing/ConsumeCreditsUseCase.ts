import { IWorkspaceRepository } from '../../../domain/repositories/IWorkspaceRepository';

export interface ConsumeCreditsResponse {
  creditsUsed: number;
  totalRemaining: number;
  monthlyRemaining: number;
  purchasedRemaining: number;
}

export class ConsumeCreditsUseCase {
  constructor(private workspaceRepository: IWorkspaceRepository) {}

  async execute(workspaceId: string): Promise<ConsumeCreditsResponse> {
    if (!workspaceId) {
      throw new Error('Workspace ID is required');
    }

    // First check if workspace has credits before consuming
    const workspace = await this.workspaceRepository.findById(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    const totalCredits = workspace.creditsMonthlyRemaining + workspace.creditsPurchased;
    if (totalCredits <= 0) {
      throw new Error('Insufficient credits. Please purchase more credits or upgrade your plan.');
    }

    // Consume the credit (uses monthly first, then purchased)
    await this.workspaceRepository.consumeCredit(workspaceId);

    // Get updated workspace to return accurate remaining credits
    const updatedWorkspace = await this.workspaceRepository.findById(workspaceId);
    if (!updatedWorkspace) {
      throw new Error('Failed to retrieve updated workspace');
    }

    return {
      creditsUsed: 1,
      totalRemaining: updatedWorkspace.creditsMonthlyRemaining + updatedWorkspace.creditsPurchased,
      monthlyRemaining: updatedWorkspace.creditsMonthlyRemaining,
      purchasedRemaining: updatedWorkspace.creditsPurchased
    };
  }
}
