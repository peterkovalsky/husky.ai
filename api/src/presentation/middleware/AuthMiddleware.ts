import { Request, Response, NextFunction } from 'express';
import { SupabaseAuthService } from '../../infrastructure/auth/SupabaseAuthService';
import { User } from '../../domain/entities/User';
import { AuthenticationError } from '../../shared/errors/AppErrors';

export interface AuthRequest extends Request {
  user?: User;
}

export class AuthMiddleware {
  constructor(private authService: SupabaseAuthService) {}

  authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid authorization header');
      }

      const token = authHeader.substring(7);
      const user = await this.authService.validateToken(token);

      if (!user) {
        throw new AuthenticationError('Invalid or expired token');
      }

      req.user = user;
      next();
    } catch (error) {
      // Let error middleware handle all errors
      next(error);
    }
  };
}