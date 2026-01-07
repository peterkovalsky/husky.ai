import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  IImageProcessingService,
  ImageDimensions,
  ImageResizeResult,
} from '../../domain/services/IImageProcessingService';
import { ILogger } from '../../shared/logger/Logger';

export class ImageProcessingService implements IImageProcessingService {
  private s3Client: S3Client;
  private logger: ILogger;

  constructor(s3Client: S3Client, logger: ILogger) {
    this.s3Client = s3Client;
    this.logger = logger;
  }

  async checkAndResizeImage(
    s3Key: string,
    s3Bucket: string,
    maxDimension: number = 7500
  ): Promise<ImageResizeResult> {
    try {
      // Download image from S3
      const getCommand = new GetObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
      });

      const response = await this.s3Client.send(getCommand);

      if (!response.Body) {
        this.logger.warn(`No body in S3 response for ${s3Key}`);
        return {
          wasResized: false,
          originalDimensions: { width: 0, height: 0 },
        };
      }

      // Convert stream to buffer
      const imageBuffer = await this.streamToBuffer(response.Body);

      // Get image metadata
      const metadata = await sharp(imageBuffer).metadata();

      if (!metadata.width || !metadata.height) {
        this.logger.warn(`Could not read dimensions for ${s3Key}`);
        return {
          wasResized: false,
          originalDimensions: { width: 0, height: 0 },
        };
      }

      const originalDimensions: ImageDimensions = {
        width: metadata.width,
        height: metadata.height,
      };

      // Check if resizing is needed
      const needsResize = metadata.width > maxDimension || metadata.height > maxDimension;

      if (!needsResize) {
        this.logger.info(`Image ${s3Key} dimensions ${metadata.width}x${metadata.height} are within limit`);
        return {
          wasResized: false,
          originalDimensions,
        };
      }

      // Calculate new dimensions maintaining aspect ratio
      let newWidth = metadata.width;
      let newHeight = metadata.height;

      if (metadata.width > metadata.height) {
        // Width is larger
        newWidth = maxDimension;
        newHeight = Math.round((metadata.height / metadata.width) * maxDimension);
      } else {
        // Height is larger or equal
        newHeight = maxDimension;
        newWidth = Math.round((metadata.width / metadata.height) * maxDimension);
      }

      const newDimensions: ImageDimensions = {
        width: newWidth,
        height: newHeight,
      };

      this.logger.warn(
        `Image ${s3Key} exceeds max dimension (${metadata.width}x${metadata.height}). ` +
        `Resizing to ${newWidth}x${newHeight}`
      );

      // Resize image
      const resizedBuffer = await sharp(imageBuffer)
        .resize(newWidth, newHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        .toBuffer();

      // Upload resized image back to S3
      const putCommand = new PutObjectCommand({
        Bucket: s3Bucket,
        Key: s3Key,
        Body: resizedBuffer,
        ContentType: response.ContentType || 'image/jpeg',
      });

      await this.s3Client.send(putCommand);

      this.logger.info(`Successfully resized and replaced ${s3Key} in S3`);

      return {
        wasResized: true,
        originalDimensions,
        newDimensions,
      };
    } catch (error) {
      // As requested: log warning but don't throw error
      this.logger.warn(
        `Error processing image ${s3Key}: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
      return {
        wasResized: false,
        originalDimensions: { width: 0, height: 0 },
      };
    }
  }

  private async streamToBuffer(stream: any): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}
