import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { CreatePromptUseCase } from '../../application/use-cases/CreatePromptUseCase';
import { GetPromptStatusUseCase } from '../../application/use-cases/GetPromptStatusUseCase';
import { AnalyzePromptUseCase } from '../../application/use-cases/AnalyzePromptUseCase';

export class PromptController {
  constructor(
    private createPromptUseCase: CreatePromptUseCase,
    private getPromptStatusUseCase: GetPromptStatusUseCase,
    private analyzePromptUseCase: AnalyzePromptUseCase
  ) {}

  createPrompt = async (req: AuthRequest, res: Response) => {
    try {
      const { prompt, projectId, mediaIds, annotationMediaIds, clarificationAnswers, analysisId, skippedClarification, inspoId, chatMessages, pageContext } = req.body;

      console.log('[PromptController] Creating prompt - projectId:', projectId, 'prompt:', prompt?.substring(0, 50), 'mediaIds:', mediaIds, 'pageContext:', pageContext ? pageContext.path : 'none');
      if (clarificationAnswers) {
        console.log('[PromptController] With clarification answers:', clarificationAnswers.length);
      }
      if (skippedClarification) {
        console.log('[PromptController] User skipped clarification (Surprise Me)');
      }
      if (inspoId) {
        console.log('[PromptController] With inspiration reference:', inspoId);
      }
      if (chatMessages) {
        console.log('[PromptController] With chat messages:', chatMessages.length);
      }

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await this.createPromptUseCase.execute(
        { prompt, projectId, mediaIds, annotationMediaIds, clarificationAnswers, analysisId, skippedClarification, inspoId, chatMessages, pageContext },
        req.user
      );

      // Handle insufficient credits - return 200 with flag so frontend can show UI
      if (result.insufficientCredits) {
        console.log('[PromptController] Insufficient credits for project:', result.projectId);
        return res.json(result);
      }

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

  analyzePrompt = async (req: AuthRequest, res: Response) => {
    try {
      const { prompt, projectId, mediaIds } = req.body;

      console.log('[PromptController] Analyzing prompt for clarification - projectId:', projectId || '(new project)');

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
      }

      const result = await this.analyzePromptUseCase.execute(
        { prompt, projectId, mediaIds },
        req.user
      );

      console.log('[PromptController] Analysis complete - needsClarification:', result.needsClarification, 'questions:', result.questions?.length || 0, 'showInspirationGallery:', result.showInspirationGallery);

      res.json(result);
    } catch (error) {
      console.error('Error analyzing prompt:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      res.status(500).json({
        error: 'Failed to analyze prompt',
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
      
      if (errorMessage === 'Build not found') {
        return res.status(404).json({ error: 'Prompt not found' }); // Keep error message for API compatibility
      }
      
      res.status(500).json({
        error: 'Failed to get prompt status',
        details: errorMessage
      });
    }
  };
}