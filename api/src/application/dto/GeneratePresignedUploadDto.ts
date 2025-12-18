export interface GeneratePresignedUploadDto {
  fileName: string;
  mimeType: string;
  fileSize: number; // File size in bytes for server-side validation
  projectId?: string; // Optional - when not provided, uses user-based path for uploads before project creation
}

export interface GeneratePresignedUploadResponseDto {
  mediaId: string;
  uploadUrl: string;
  s3Key: string;
}
