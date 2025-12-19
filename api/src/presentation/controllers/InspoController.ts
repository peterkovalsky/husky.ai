import { Request, Response } from 'express';
import { GetInspoGalleryUseCase } from '../../application/use-cases/GetInspoGalleryUseCase';
import { InspoType } from '../../domain/entities/Inspo';

export class InspoController {
  constructor(private getInspoGalleryUseCase: GetInspoGalleryUseCase) {}

  getGallery = async (req: Request, res: Response) => {
    try {
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const { type, limit, offset } = req.query;

      const result = await this.getInspoGalleryUseCase.execute({
        type: type as InspoType | undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined
      });

      res.status(200).json(result);
    } catch (error) {
      console.error('Error fetching inspiration gallery:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to fetch inspiration gallery'
      });
    }
  };
}
