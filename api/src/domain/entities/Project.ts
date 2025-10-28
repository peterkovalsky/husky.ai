export enum ProjectStatus {
  ACTIVE = 'ACTIVE',
  DELETING = 'DELETING'
}

export enum PublishingStatus {
  UNPUBLISHED = 'UNPUBLISHED',
  PUBLISHING = 'PUBLISHING',
  PUBLISHED = 'PUBLISHED',
  FAILED = 'FAILED',
  UNPUBLISHING = 'UNPUBLISHING'
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  previewUrl?: string;
  workspaceId: string;
  status: ProjectStatus;
  currentVersion: number;
  subdomain?: string;
  publishedStatus: PublishingStatus;
  publishedAt?: Date;
  publishedVersion?: number;
  cloudfrontDistributionId?: string;
  cloudfrontDomain?: string;
  publishingError?: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspaceId: string;
}