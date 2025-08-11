import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { SetupUserUseCase } from '../../application/use-cases/SetupUserUseCase';

export class UserController {
  constructor(private setupUserUseCase: SetupUserUseCase) {}


  getDefaultProject = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const project = await this.setupUserUseCase.getUserDefaultProject(req.user.id);
      
      if (!project) {
        return res.status(404).json({ error: 'No default project found' });
      }
      
      res.json({ project });
    } catch (error) {
      console.error('Error getting default project:', error);
      res.status(500).json({ error: 'Failed to get default project' });
    }
  };
}