export enum ProjectStatus {
  NEW = 'NEW',       // Newly created project, no builds yet
  FAILED = 'FAILED', // Contains only failed builds
  ACTIVE = 'ACTIVE', // At least one successful build (shown on dashboard)
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

export enum CustomDomainStatus {
  NONE = 'NONE',
  PENDING_DNS = 'PENDING_DNS',
  PENDING_SSL = 'PENDING_SSL',
  ACTIVE = 'ACTIVE',
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
  customDomain?: string | null;
  customDomainCloudflareId?: string | null;
  customDomainStatus?: CustomDomainStatus;
  customDomainError?: string | null;
  customDomainVerifiedAt?: Date | null;
  thumbnailUrl?: string | null;
  createdAt: Date;
  modifiedAt: Date;
}

export interface CreateProjectRequest {
  name: string;
  description?: string;
  workspaceId: string;
}