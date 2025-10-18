import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { CreatePromptUseCase } from '../../application/use-cases/CreatePromptUseCase';
import { GetPromptStatusUseCase } from '../../application/use-cases/GetPromptStatusUseCase';

export class PromptController {
  constructor(
    private createPromptUseCase: CreatePromptUseCase,
    private getPromptStatusUseCase: GetPromptStatusUseCase
  ) {}

  createPrompt = async (req: AuthRequest, res: Response) => {
    try {
      const { prompt, projectId } = req.body;

      console.log('[PromptController] Creating prompt - projectId:', projectId, 'prompt:', prompt?.substring(0, 50));

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await this.createPromptUseCase.execute(
        { prompt, projectId },
        req.user
      );

      console.log('[PromptController] Prompt created successfully - promptId:', result.promptId, 'finalProjectId:', result.projectId);

      res.json({
        message: 'Prompt queued successfully',
        ...result
      });
    } catch (error) {
      console.error('Error creating prompt:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      res.status(500).json({
        error: 'Failed to queue prompt',
        details: errorMessage
      });
    }
  };

  getPromptStatus = async (req: AuthRequest, res: Response) => {
    try {
      const { promptId } = req.params;
      
      const result = await this.getPromptStatusUseCase.execute(promptId);
      res.json(result);
    } catch (error) {
      console.error('Error getting prompt status:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage === 'Prompt not found') {
        return res.status(404).json({ error: errorMessage });
      }
      
      res.status(500).json({
        error: 'Failed to get prompt status',
        details: errorMessage
      });
    }
  };
}