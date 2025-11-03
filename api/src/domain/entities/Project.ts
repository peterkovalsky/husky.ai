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

export enum HostnameStatus {
  NONE = 'NONE',
  PROVISIONING = 'PROVISIONING',
  READY = 'READY',
  FAILED = 'FAILED'
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
  cloudflareHostnameId?: string | null;
  cloudflareHostnameStatus?: string | null;
  hostnameStatus?: HostnameStatus;
  hostnameError?: string | null;
  publishingError?: string;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspaceId: string;
}