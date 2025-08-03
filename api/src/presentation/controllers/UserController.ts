import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { SetupUserUseCase } from '../../application/use-cases/SetupUserUseCase';

export class UserController {
  constructor(private setupUserUseCase: SetupUserUseCase) {}

  setupUser = async (req: AuthRequest, res: Response) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      const result = await this.setupUserUseCase.execute(
        req.user,
        req.user.displayName || req.user.email
      );
      
      res.json(result);
    } catch (error) {
      console.error('Error setting up user:', error);
      res.status(500).json({ error: 'Failed to setup user' });
    }
  };
}