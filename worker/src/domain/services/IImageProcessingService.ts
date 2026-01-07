export interface ImageDimensions {
  width: number;
  height: number;
}

export interface ImageResizeResult {
  wasResized: boolean;
  originalDimensions: ImageDimensions;
  newDimensions?: ImageDimensions;
}

export interface IImageProcessingService {
  /**
   * Checks image dimensions and resizes if either dimension exceeds the maximum.
   * Downloads image from S3, resizes if needed, and uploads back to the same location.
   *
   * @param s3Key - S3 key of the image
   * @param s3Bucket - S3 bucket name
   * @param maxDimension - Maximum allowed dimension (default: 7500px)
   * @returns Result indicating if image was resized and dimensions
   */
  checkAndResizeImage(
    s3Key: string,
    s3Bucket: string,
    maxDimension?: number
  ): Promise<ImageResizeResult>;
}
