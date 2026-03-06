/**
 * Interface for managing public media storage in R2
 * Used for storing user-uploaded images that need to be accessible publicly
 * for AI code generation (the AI references these URLs in generated React code)
 */
export interface IPublicMediaStorageService {
  /**
   * Copy a file from S3 to R2 public media bucket
   * @param sourceKey - The S3 key of the source file
   * @param sourceBucket - The S3 bucket name
   * @param projectId - The project ID (used to organize files)
   * @returns The public key and public URL of the copied file
   */
  copyFromS3ToR2(
    sourceKey: string,
    sourceBucket: string,
    projectId: string
  ): Promise<{ publicKey: string; publicUrl: string }>;

  /**
   * Upload a buffer directly to R2 public media bucket
   * @param buffer - The file content as a Buffer
   * @param projectId - The project ID (used to organize files)
   * @param filename - The destination filename (e.g., "generated-abc123.png")
   * @param contentType - The MIME content type (e.g., "image/png")
   * @returns The public key and public URL of the uploaded file
   */
  uploadBuffer(
    buffer: Buffer,
    projectId: string,
    filename: string,
    contentType: string
  ): Promise<{ publicKey: string; publicUrl: string }>;

  /**
   * Delete a file from the R2 public media bucket
   * @param key - The key of the file to delete
   */
  deleteFile(key: string): Promise<void>;

  /**
   * Get the public URL for a given key
   * @param key - The key of the file
   * @returns The public URL
   */
  getPublicUrl(key: string): string;
}
