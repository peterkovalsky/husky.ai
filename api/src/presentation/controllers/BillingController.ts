import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { CheckWorkspaceCreditsUseCase } from '../../application/use-cases/billing/CheckWorkspaceCreditsUseCase';
import { PurchaseCreditsUseCase } from '../../application/use-cases/billing/PurchaseCreditsUseCase';
import { UpgradeSubscriptionUseCase } from '../../application/use-cases/billing/UpgradeSubscriptionUseCase';
import { CancelSubscriptionUseCase } from '../../application/use-cases/billing/CancelSubscriptionUseCase';
import { ICreditPurchaseRepository } from '../../domain/repositories/ICreditPurchaseRepository';
import { SubscriptionTier } from '../../domain/entities/Workspace';

export class BillingController {
  constructor(
    private checkCreditsUseCase: CheckWorkspaceCreditsUseCase,
    private purchaseCreditsUseCase: PurchaseCreditsUseCase,
    private upgradeSubscriptionUseCase: UpgradeSubscriptionUseCase,
    private cancelSubscriptionUseCase: CancelSubscriptionUseCase,
    private creditPurchaseRepository: ICreditPurchaseRepository
  ) {}

  getCredits = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId } = req.query;

      if (!workspaceId || typeof workspaceId !== 'string') {
        return res.status(400).json({ error: 'Workspace ID is required' });
      }

      const result = await this.checkCreditsUseCase.execute(workspaceId);
      res.json(result);
    } catch (error) {
      console.error('Error getting credits:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to get credits',
        details: errorMessage
      });
    }
  };

  purchaseCredits = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId, credits, successUrl, cancelUrl } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace ID is required' });
      }

      if (!credits || typeof credits !== 'number' || credits <= 0) {
        return res.status(400).json({ error: 'Credits must be a positive number' });
      }

      if (!req.user?.email) {
        return res.status(401).json({ error: 'User email not found' });
      }

      const result = await this.purchaseCreditsUseCase.execute({
        workspaceId,
        credits,
        userEmail: req.user.email,
        successUrl,
        cancelUrl
      });

      res.json(result);
    } catch (error) {
      console.error('Error purchasing credits:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to purchase credits',
        details: errorMessage
      });
    }
  };

  subscribe = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId, tier, successUrl, cancelUrl } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace ID is required' });
      }

      if (!tier || !['basic', 'pro'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be "basic" or "pro"' });
      }

      if (!req.user?.email) {
        return res.status(401).json({ error: 'User email not found' });
      }

      const result = await this.upgradeSubscriptionUseCase.execute({
        workspaceId,
        tier: tier as SubscriptionTier,
        userEmail: req.user.email,
        successUrl,
        cancelUrl
      });

      res.json({
        message: 'Subscription created successfully',
        ...result
      });
    } catch (error) {
      console.error('Error creating subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to create subscription',
        details: errorMessage
      });
    }
  };

  upgrade = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId, tier, successUrl, cancelUrl } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace ID is required' });
      }

      if (!tier || !['basic', 'pro'].includes(tier)) {
        return res.status(400).json({ error: 'Invalid tier. Must be "basic" or "pro"' });
      }

      if (!req.user?.email) {
        return res.status(401).json({ error: 'User email not found' });
      }

      const result = await this.upgradeSubscriptionUseCase.execute({
        workspaceId,
        tier: tier as SubscriptionTier,
        userEmail: req.user.email,
        successUrl,
        cancelUrl
      });

      res.json({
        message: 'Subscription upgraded successfully',
        ...result
      });
    } catch (error) {
      console.error('Error upgrading subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to upgrade subscription',
        details: errorMessage
      });
    }
  };

  cancel = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId } = req.body;

      if (!workspaceId) {
        return res.status(400).json({ error: 'Workspace ID is required' });
      }

      await this.cancelSubscriptionUseCase.execute(workspaceId);

      res.json({
        message: 'Subscription canceled successfully'
      });
    } catch (error) {
      console.error('Error canceling subscription:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to cancel subscription',
        details: errorMessage
      });
    }
  };

  getHistory = async (req: AuthRequest, res: Response) => {
    try {
      const { workspaceId } = req.query;

      if (!workspaceId || typeof workspaceId !== 'string') {
        return res.status(400).json({ error: 'Workspace ID is required' });
      }

      const purchases = await this.creditPurchaseRepository.findByWorkspaceId(workspaceId, 50);

      res.json({
        purchases: purchases.map(p => ({
          id: p.id,
          credits: p.creditsPurchased,
          amount: p.amountPaid,
          date: p.createdAt
        }))
      });
    } catch (error) {
      console.error('Error getting purchase history:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      res.status(500).json({
        error: 'Failed to get purchase history',
        details: errorMessage
      });
    }
  };
}
