import { Request, Response, NextFunction } from 'express';
import { SupabaseAuthService } from '../../infrastructure/auth/SupabaseAuthService';
import { User } from '../../domain/entities/User';

export interface AuthRequest extends Request {
  user?: User;
}

export class AuthMiddleware {
  constructor(private authService: SupabaseAuthService) {}

  authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
      }

      const token = authHeader.substring(7);
      const user = await this.authService.validateToken(token);
      
      if (!user) {
        return res.status(401).json({ error: 'Invalid or expired token' });
      }

      req.user = user;
      next();
    } catch (error) {
      console.error('Authentication error:', error);
      return res.status(500).json({ error: 'Internal server error during authentication' });
    }
  };
}