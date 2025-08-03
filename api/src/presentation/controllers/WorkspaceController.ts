import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { IWorkspaceRepository } from '../../domain/repositories/IWorkspaceRepository';

export class WorkspaceController {
  constructor(private workspaceRepository: IWorkspaceRepository) {}

  getWorkspaces = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const workspaces = await this.workspaceRepository.findByUserId(req.user.id);
      res.json({ workspaces });
    } catch (error) {
      console.error('Error fetching workspaces:', error);
      res.status(500).json({ error: 'Failed to fetch workspaces' });
    }
  };
}