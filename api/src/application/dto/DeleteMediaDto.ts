export interface DeleteMediaDto {
  mediaId: string;
  projectId?: string; // Optional: if provided, only clean from this project's builds
}

export interface DeleteMediaResponseDto {
  success: boolean;
}
