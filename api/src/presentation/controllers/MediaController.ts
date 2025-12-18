import { Request, Response } from 'express';
import { GeneratePresignedUploadUseCase } from '../../application/use-cases/GeneratePresignedUploadUseCase';
import { ConfirmMediaUploadUseCase } from '../../application/use-cases/ConfirmMediaUploadUseCase';
import { DeleteMediaUseCase } from '../../application/use-cases/DeleteMediaUseCase';

export class MediaController {
  constructor(
    private generatePresignedUploadUseCase: GeneratePresignedUploadUseCase,
    private confirmMediaUploadUseCase: ConfirmMediaUploadUseCase,
    private deleteMediaUseCase: DeleteMediaUseCase
  ) {}

  generatePresignedUpload = async (req: Request, res: Response) => {
    try {
      const { fileName, mimeType, fileSize, projectId } = req.body;
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!fileName || !mimeType) {
        return res.status(400).json({ error: 'fileName and mimeType are required' });
      }

      if (typeof fileSize !== 'number' || fileSize <= 0) {
        return res.status(400).json({ error: 'fileSize is required and must be a positive number' });
      }

      const result = await this.generatePresignedUploadUseCase.execute(
        { fileName, mimeType, fileSize, projectId },
        user.id
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error generating presigned upload URL:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to generate presigned upload URL'
      });
    }
  };

  confirmUpload = async (req: Request, res: Response) => {
    try {
      const { mediaId } = req.body;
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!mediaId) {
        return res.status(400).json({ error: 'mediaId is required' });
      }

      const result = await this.confirmMediaUploadUseCase.execute(
        { mediaId },
        user.id
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error confirming media upload:', error);
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to confirm media upload'
      });
    }
  };

  deleteMedia = async (req: Request, res: Response) => {
    try {
      const { mediaId } = req.params;
      const { projectId } = req.query; // Optional: accept projectId from query params
      const user = (req as any).user;

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      if (!mediaId) {
        return res.status(400).json({ error: 'mediaId is required' });
      }

      const result = await this.deleteMediaUseCase.execute(
        {
          mediaId,
          projectId: projectId as string | undefined
        },
        user.id
      );

      res.status(200).json(result);
    } catch (error) {
      console.error('Error deleting media:', error);
      const statusCode = error instanceof Error && error.message.includes('Unauthorized') ? 403 : 500;
      res.status(statusCode).json({
        error: error instanceof Error ? error.message : 'Failed to delete media'
      });
    }
  };
}
