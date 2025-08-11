import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';
import { SetupUserUseCase } from '../../application/use-cases/SetupUserUseCase';

export class WorkspaceController {
  constructor(
    private workspaceRepository: IWorkspaceRepository,
    private setupUserUseCase: SetupUserUseCase
  ) {}

  getWorkspaces = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      // Get user's workspaces
      let workspaces = await this.workspaceRepository.findByUserId(req.user.id);
      
      // If user has no workspaces, auto-setup
      if (workspaces.length === 0) {
        console.log(`Auto-setting up user ${req.user.id} - no workspaces found`);
        const setupResult = await this.setupUserUseCase.execute(req.user);
        
        // Get workspaces again after setup
        workspaces = await this.workspaceRepository.findByUserId(req.user.id);
      }

      res.json({ workspaces });
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
  };
}