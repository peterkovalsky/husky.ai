import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { InitiatePublishingUseCase } from '../../application/use-cases/InitiatePublishingUseCase';
import { InitiateUnpublishingUseCase } from '../../application/use-cases/InitiateUnpublishingUseCase';
import { GetPublishStatusUseCase } from '../../application/use-cases/GetPublishStatusUseCase';

export class PublishingController {
  constructor(
    private initiatePublishingUseCase: InitiatePublishingUseCase,
    private initiateUnpublishingUseCase: InitiateUnpublishingUseCase,
    private getPublishStatusUseCase: GetPublishStatusUseCase
  ) {}

  publish = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`Publishing project ${projectId} for user ${req.user.id}`);
      await this.initiatePublishingUseCase.execute(projectId, req.user);

      res.status(202).json({
        message: 'Publishing initiated',
        projectId
      });
    } catch (error) {
      console.error('Error publishing project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('not found')) {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('already in progress') || errorMessage.includes('no successful builds')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to initiate publishing',
        details: errorMessage
      });
    }
  };

  unpublish = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`Unpublishing project ${projectId} for user ${req.user.id}`);
      await this.initiateUnpublishingUseCase.execute(projectId, req.user);

      res.status(202).json({
        message: 'Unpublishing initiated',
        projectId
      });
    } catch (error) {
      console.error('Error unpublishing project:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('not found')) {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('not published') || errorMessage.includes('already in progress')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to initiate unpublishing',
        details: errorMessage
      });
    }
  };

  getStatus = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const status = await this.getPublishStatusUseCase.execute(projectId, req.user);

      res.json(status);
    } catch (error) {
      console.error('Error getting publish status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('not found')) {
        return res.status(404).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to get publish status',
        details: errorMessage
      });
    }
  };

  retry = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`Retrying publish for project ${projectId} for user ${req.user.id}`);
      // Retry is the same as initiating a new publish
      await this.initiatePublishingUseCase.execute(projectId, req.user);

      res.status(202).json({
        message: 'Publishing retry initiated',
        projectId
      });
    } catch (error) {
      console.error('Error retrying publish:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('not found')) {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('already in progress')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to retry publishing',
        details: errorMessage
      });
    }
  };
}
