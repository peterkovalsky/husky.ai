export interface ConfirmMediaUploadDto {
  mediaId: string;
}

export interface ConfirmMediaUploadResponseDto {
  success: boolean;
  media: {
    id: string;
    s3Key: string;
    mimeType: string;
  };
}
