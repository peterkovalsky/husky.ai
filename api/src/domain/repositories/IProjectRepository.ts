import { Project, CreateProjectRequest, PublishingStatus } from '../entities/Project';

export interface IProjectRepository {
  create(request: CreateProjectRequest): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findByIdForOperations(id: string): Promise<Project | null>;
  findByWorkspaceId(workspaceId: string): Promise<Project[]>;
  checkUserAccess(userId: string, projectId: string): Promise<boolean>;
  updatePreviewUrl(projectId: string, previewUrl: string): Promise<void>;
  updateCurrentVersion(projectId: string, version: number): Promise<void>;
  updateStatus(projectId: string, status: string): Promise<void>;
  deleteById(projectId: string): Promise<void>;

  // Publishing methods
  setSubdomain(projectId: string, subdomain: string): Promise<void>;
  isSubdomainTaken(subdomain: string): Promise<boolean>;
  updatePublishingStatus(projectId: string, status: PublishingStatus): Promise<void>;
  updatePublishingError(projectId: string, error: string | null): Promise<void>;
  updateCloudFrontDetails(
    projectId: string,
    distributionId: string,
    domain: string
  ): Promise<void>;
  setPublishedAt(projectId: string, publishedAt: Date | null): Promise<void>;
  setPublishedVersion(projectId: string, version: number | null): Promise<void>;
  update(projectId: string, updates: Partial<Project>): Promise<void>;
}