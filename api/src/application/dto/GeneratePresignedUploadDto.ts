export interface GeneratePresignedUploadDto {
  fileName: string;
  mimeType: string;
  projectId: string;
}

export interface GeneratePresignedUploadResponseDto {
  mediaId: string;
  uploadUrl: string;
  s3Key: string;
}
