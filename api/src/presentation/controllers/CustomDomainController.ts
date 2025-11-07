import { Response } from 'express';
import { AuthRequest } from '../middleware/AuthMiddleware';
import { SetCustomDomainUseCase } from '../../application/use-cases/SetCustomDomainUseCase';
import { VerifyCustomDomainDNSUseCase } from '../../application/use-cases/VerifyCustomDomainDNSUseCase';
import { RemoveCustomDomainUseCase } from '../../application/use-cases/RemoveCustomDomainUseCase';

export class CustomDomainController {
  constructor(
    private setCustomDomainUseCase: SetCustomDomainUseCase,
    private verifyCustomDomainDNSUseCase: VerifyCustomDomainDNSUseCase,
    private removeCustomDomainUseCase: RemoveCustomDomainUseCase
  ) {}

  setCustomDomain = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;
      const { domain } = req.body;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      if (!domain) {
        return res.status(400).json({ error: 'Domain is required' });
      }

      console.log(`Setting custom domain ${domain} for project ${projectId}`);
      const result = await this.setCustomDomainUseCase.execute(projectId, domain, req.user);

      res.status(200).json({
        message: 'Custom domain set successfully',
        domain: result.domain,
        dnsInstructions: result.dnsInstructions
      });
    } catch (error) {
      console.error('Error setting custom domain:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('not found')) {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('Invalid domain') || errorMessage.includes('already in use')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to set custom domain',
        details: errorMessage
      });
    }
  };

  verifyDNS = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`Verifying DNS for project ${projectId}`);
      const result = await this.verifyCustomDomainDNSUseCase.execute(projectId, req.user);

      res.status(200).json({
        verified: result.verified,
        error: result.error,
        validationRecords: result.validationRecords,
        message: result.message
      });
    } catch (error) {
      console.error('Error verifying DNS:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('not found')) {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('No custom domain')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to verify DNS',
        details: errorMessage
      });
    }
  };

  removeCustomDomain = async (req: AuthRequest, res: Response) => {
    try {
      const { projectId } = req.params;

      if (!req.user) {
        return res.status(401).json({ error: 'User not authenticated' });
      }

      console.log(`Removing custom domain for project ${projectId}`);
      await this.removeCustomDomainUseCase.execute(projectId, req.user);

      res.status(200).json({
        message: 'Custom domain removed successfully'
      });
    } catch (error) {
      console.error('Error removing custom domain:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      if (errorMessage.includes('Access denied')) {
        return res.status(403).json({ error: errorMessage });
      }

      if (errorMessage.includes('not found')) {
        return res.status(404).json({ error: errorMessage });
      }

      if (errorMessage.includes('No custom domain')) {
        return res.status(400).json({ error: errorMessage });
      }

      res.status(500).json({
        error: 'Failed to remove custom domain',
        details: errorMessage
      });
    }
  };
}
